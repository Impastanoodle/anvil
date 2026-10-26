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
    arc: ['cx', 'cy', 'r', 'a0', 'a1'], slot: ['x1', 'y1', 'x2', 'y2', 'w'], poly: ['cx', 'cy', 'r', 'rot'], point: ['x', 'y'],
    aslot: ['cx', 'cy', 'r', 'a0', 'a1', 'w'],   // p9-sketch-curves: arc slot (its refs are an arc's: c, p1 / p2 the cap centres, whole = the centre-line arc)
    ellipse: ['cx', 'cy', 'rx', 'ry', 'rot'], pellipse: ['cx', 'cy', 'rx', 'ry', 'rot', 'a0', 'a1'],   // ui-sketch-spline: rot, a0, a1 in degrees
    text: ['x', 'y']   // sketch-text-ref: a text's insertion point is its point ref ('5', like a Point): Smart Dimension, Coincident / Horizontal / Vertical, dragging
  };
  // a text that stands on its own (not laid along a curve: then the curve places it and its x / y mean nothing)
  function textFree(e) { return e.t === 'text' && !e.path; }
  function paramNames(e) {
    if (e.t === 'polyline' || e.t === 'spline') { var o = []; for (var i = 0; i < e.pts.length * 2; i++) o.push(i); return o; }
    if (e.t === 'text' && !textFree(e)) return [];   // its curve places it: no unknowns of its own
    if (e.t === 'point' && e.blkDef != null && e.blk != null) return ['x', 'y', 'blkAng'];   // rfAU: a block instance's insertion point (x, y, angle)
    return PARAMS[e.t] || [];
  }
  function pget(e, n) { return typeof n === 'number' ? e.pts[n >> 1][n & 1] : isHandleName(e, n) ? +e.tans[+n.slice(1)][0] : (+e[n] || 0); }
  function pset(e, n, v) { if (typeof n === 'number') e.pts[n >> 1][n & 1] = v; else if (isHandleName(e, n)) e.tans[+n.slice(1)][0] = v; else e[n] = v; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  // sketch-units: a length in a message. The UI sets SketchSolver.fmtLen (ui-sketch.js: the document's dimension
  // style and unit, ".250 in"); without it, 4 decimals.
  function fmtL(x) { var h = typeof SketchSolver !== 'undefined' && SketchSolver.fmtLen; return h ? h(x) : String(Math.round(x * 1e4) / 1e4); }

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
      case 'spline': return e.pts;   // ui-sketch-spline: '3.v2' is spline point 2 (no edges: refCurve / curveRefs skip it;
                                     // rfAK: a style spline's '3.e1' is its control polygon leg from vertex 1 to 2)
    }
    return null;
  }
  // ui-sketch-spline: an ellipse's axis end points ('3.v0' major +, '3.v1' minor +, '3.v2' major −, '3.v3' minor −) and a
  // partial ellipse's ends (parameter angles a0 / a1, degrees)
  function ellipseAt(e, uDeg) {
    var r = (+e.rot || 0) * D2R, u = uDeg * D2R, x = e.rx * Math.cos(u), y = e.ry * Math.sin(u);
    return [e.cx + Math.cos(r) * x - Math.sin(r) * y, e.cy + Math.sin(r) * x + Math.cos(r) * y];
  }
  function closedCorners(e) { return e.t === 'spline' ? false : e.t !== 'polyline' || !!e.closed; }
  // rfAK: a style spline's control polygon leg k ('3.ek': vertex k to k + 1), a line for the relations SolidWorks offers
  // on a control polygon line (Horizontal, Vertical, Parallel, Perpendicular, Collinear, Tangent, an angle)
  function isLegRef(ents, r) { var e = r && !r.o && r.s === 'e' ? ents[r.e] : null; return !!(e && e.t === 'spline' && e.style); }
  // the point a ref names, or null when it names no point
  function refPoint(ents, r) {
    if (!r) return null;
    if (r.o) return [0, 0];
    var e = ents[r.e];
    if (!e) return null;
    switch (r.s) {
      case null: return e.t === 'point' || textFree(e) ? [+e.x || 0, +e.y || 0] : null;
      case 'p':
        if (e.t === 'line' || e.t === 'slot') return r.k === 1 ? [e.x1, e.y1] : r.k === 2 ? [e.x2, e.y2] : null;
        if (e.t === 'arc' || e.t === 'aslot') { var a = (r.k === 1 ? e.a0 : r.k === 2 ? e.a1 : NaN) * D2R; return isNaN(a) ? null : [e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]; }
        if (e.t === 'spline' && e.pts.length) { var sp = r.k === 1 ? e.pts[0] : r.k === 2 ? e.pts[e.pts.length - 1] : null; return sp ? [sp[0], sp[1]] : null; }
        if (e.t === 'pellipse') return r.k === 1 ? ellipseAt(e, e.a0) : r.k === 2 ? ellipseAt(e, e.a1) : null;
        return null;
      case 'mid': return e.t === 'line' || e.t === 'slot' ? [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2] : null;
      case 'c':
        if (e.t === 'circle' || e.t === 'arc' || e.t === 'poly' || e.t === 'crect' || e.t === 'aslot' || e.t === 'ellipse' || e.t === 'pellipse') return [e.cx, e.cy];
        if (e.t === 'rect') return [e.x + e.w / 2, e.y + e.h / 2];
        if (e.t === 'slot') return [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2];
        return null;
      case 'v': {
        if (e.t === 'ellipse' || e.t === 'pellipse') return r.k != null && r.k >= 0 && r.k < 4 ? ellipseAt(e, r.k * 90) : null;
        var c = corners(e); return c && r.k != null && c[r.k] ? [c[r.k][0], c[r.k][1]] : null;
      }
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
      if (e.t === 'circle' || e.t === 'arc' || e.t === 'aslot') return { kind: 'circle', c: [e.cx, e.cy], r: e.r };
      return null;
    }
    if (r.s === 'e') {
      var c = e.t === 'spline' && !e.style ? null : corners(e);
      if (!c || r.k == null || r.k < 0) return null;
      var n = c.length, last = closedCorners(e) ? n : n - 1;
      if (r.k >= last) return null;
      return { kind: 'line', a: c[r.k], b: c[(r.k + 1) % n] };
    }
    if (r.s === 'h') return handleLine(e, r.k);   // lane DE: a spline point's tangent handle
    return null;
  }
  // Lane DE: '3.h2' is the tangent handle of (non-style) spline 3 at its point 2, a line for an angle Smart Dimension
  // (SolidWorks: a spline handle dimensioned to a line): from the point along the tangent there (a driving tangent's
  // angle tans[k][0], else the curve's own), a third of the longer neighbouring chord long. A handle in a relation is
  // made driving (handleDrive) and its angle is a solver unknown ('h2', pget / pset), so the dimension turns the handle,
  // not the points.
  function handleLine(e, k) {
    if (!e || e.t !== 'spline' || e.style || k == null || k < 0 || !e.pts || k >= e.pts.length || e.pts.length < 2) return null;
    var P = e.pts[k], tg = e.tans && e.tans[k], ang;
    if (tg && tg[0] != null && isFinite(+tg[0])) ang = +tg[0] * D2R;
    else { var fc = freeCurve(e); if (!fc) return null; var d = fc.d1(Math.min(k, fc.t1)); if (!(len(d) > 1e-15)) return null; ang = Math.atan2(d[1], d[0]); }
    // as long as the handle drawn (Show Spline Handles: the Bézier leg leaving the point, or entering the last one)
    var n = e.pts.length, hl = 0, g = K && K.splineGeom ? K.splineGeom(e) : null, B = g && g.bez && g.bez.length ? (g.bez[k] || g.bez[g.bez.length - 1]) : null;
    if (B) hl = g.bez[k] ? len(sub(B[1], B[0])) : len(sub(B[3], B[2]));
    if (!(hl > 1e-12)) { hl = len(sub(e.pts[(k + 1) % n], P)) / 3 || 1; }
    return { kind: 'line', a: [P[0], P[1]], b: [P[0] + Math.cos(ang) * hl, P[1] + Math.sin(ang) * hl] };
  }
  function isHandleName(e, n) { return typeof n === 'string' && e && e.t === 'spline' && /^h\d+$/.test(n); }
  // make the handle of spline point k driving with the curve as it is (its tangent's angle and speed there: the C2
  // spline through a point of known tangent is the same curve), so dimensioning it changes nothing until a value is set
  function handleDrive(e, k) {
    if (!e || e.t !== 'spline' || e.style || !e.pts || k < 0 || k >= e.pts.length) return false;
    var tg = e.tans && e.tans[k];
    if (tg && tg[0] != null) return true;
    var fc = freeCurve(e);
    if (!fc || !fc.knotD1) return false;
    var d = fc.knotD1(Math.min(k, fc.t1));
    if (!(len(d) > 1e-15)) return false;
    if (!e.tans) e.tans = e.pts.map(function () { return null; });
    while (e.tans.length < e.pts.length) e.tans.push(null);
    e.tans[k] = [Math.atan2(d[1], d[0]) / D2R, len(d)];
    return true;
  }
  function refKind(ents, r) {
    if (refPoint(ents, r)) return 'point';
    var c = refCurve(ents, r);
    if (c) return c.kind;
    // sketch-refine: a whole spline / ellipse (a point can lie on it: Coincident)
    return r && !r.o && r.s === null && isFree(ents[r.e]) ? 'free' : null;
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
    // rfCR: SolidWorks' Equal Curve Length: two of line, arc, circle, spline, ellipse keep one length (a line's length,
    // an arc's r · sweep, a circle's 2πr, a free curve's length along it)
    equalcurve: { name: 'Equal Curve Length', glyph: '≎' },
    midpoint: { name: 'Midpoint', glyph: 'M' },
    collinear: { name: 'Collinear', glyph: '≡' },
    symmetric: { name: 'Symmetric', glyph: '⇹' },
    // r9/sketch9: an offset copy of a rectangle, refs [original, copy] (whole entities): its sides are offset by the same
    // distance all round (one offset dimension drives it, as SolidWorks' Offset Entities links them). Added by Offset
    // Entities only, never offered in Add Relations.
    offset: { name: 'Offset', glyph: '⧈' },
    // sketch tools (ui-sketch-tools.js): a converted model edge held where the edge is (SolidWorks' On Edge; solved as
    // Fix), and the copies of a Linear / Circular Sketch Pattern held to their seeds (one relation per pattern). Made by
    // the commands only, never offered in Add Relations.
    onEdge: { name: 'On Edge', glyph: 'E' },
    pattern: { name: 'Pattern', glyph: '⋯' },
    // rfH: a Polygon drawn by the Polygon tool (or exploded for a fillet), refs [its construction circle, its n sides in
    // order]: the corners (where consecutive sides meet, extended) lie at n equal turns about the circle's centre, on the
    // circle (rel.ins false) or with the circle touching the sides (rel.ins true, SolidWorks' Inscribed circle). Made by
    // the Polygon tool only, never offered in Add Relations.
    polygon: { name: 'Polygon', glyph: '⬡' },
    fix: { name: 'Fix', glyph: 'F' },
    // sketchdims: SolidWorks' Coradial (two arcs / circles on one centre with one radius) and Intersection (a point
    // where two lines cross)
    coradial: { name: 'Coradial', glyph: '⊚' },
    intersection: { name: 'Intersection', glyph: '×' },
    distance: { name: 'Distance', glyph: '↔', dim: true },
    angle: { name: 'Angle', glyph: '∠', dim: true },
    // sketchdims: the length along an arc (Smart Dimension: the arc, then its two end points), refs [arc]
    arclength: { name: 'Arc Length', glyph: '⌒', dim: true },
    // rfAQ: Chamfer Dimension (refs [chamfer line, adjacent line]: v = the chamfer's length along the adjacent line,
    // cang = its angle to that line, degrees), Path Length (refs: the lines / arcs / circles of a chain, v = their total
    // length) and Angular Running (refs [vertex, datum point, point]: v = the angle at the vertex from the datum to the
    // point, counter-clockwise, 0 to 360; rel.run names the set). Made by their commands, never offered in Add Relations.
    chamfer: { name: 'Chamfer Dimension', glyph: '⌔', dim: true },
    pathlength: { name: 'Path Length', glyph: '⤳', dim: true },
    runangle: { name: 'Angular Running', glyph: '∠', dim: true }
  };
  var ADD_ORDER = ['horizontal', 'vertical', 'coincident', 'midpoint', 'intersection', 'collinear', 'parallel', 'perpendicular', 'tangent', 'concentric', 'coradial', 'equal', 'equalcurve', 'symmetric', 'fix'];

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
          if (kinds[o[0]] === kinds[o[1]] && kinds[o[0]] !== 'free') return [o[0], o[1], k];
        }
        return null;
      case 'horizontal': case 'vertical':
        if (n === 1 && kinds[0] === 'line') return [0];
        return n === 2 ? perm('point', 'point') : null;
      case 'coincident':
        if (n !== 2) return null;
        return perm('point', 'point') || perm('point', 'line') || perm('point', 'circle') || perm('point', 'free');
      // p9-sketchfix: or three points, the first midway between the other two (a line cut in two by Trim: the middle of
      // its outer ends)
      case 'midpoint': return n === 2 ? perm('point', 'line') : n === 3 && kinds.every(function (k) { return k === 'point'; }) ? [0, 1, 2] : null;
      case 'parallel': case 'perpendicular': case 'collinear': return n === 2 ? perm('line', 'line') : null;
      // sketch-fillet2: a line or arc and an open spline, at an end they share (a Sketch Fillet's arc on a spline)
      // rfAK: two lines (one a style spline's control polygon leg: relEquation refuses two plain lines) and two splines at
      // an end they share (the pieces Split Entities makes)
      case 'tangent': return n === 2 ? perm('line', 'circle') || perm('circle', 'circle') || perm('circle', 'free') || perm('line', 'free') || perm('line', 'line') || perm('free', 'free') : null;
      case 'concentric': return n === 2 ? perm('circle', 'circle') || perm('point', 'circle') : null;
      case 'coradial': return n === 2 ? perm('circle', 'circle') : null;
      // sketchdims: a point and the two lines it sits where they cross, in that order
      case 'intersection': {
        if (n !== 3) return null;
        var pi = kinds.indexOf('point');
        if (pi < 0 || kinds.lastIndexOf('point') !== pi) return null;
        var ls = [0, 1, 2].filter(function (q) { return q !== pi; });
        return kinds[ls[0]] === 'line' && kinds[ls[1]] === 'line' ? [pi, ls[0], ls[1]] : null;
      }
      case 'arclength': return n === 1 && kinds[0] === 'circle' ? [0] : null;
      case 'equal': return n === 2 ? perm('line', 'line') || perm('circle', 'circle') : null;
      // rfCR: any two curves (a line, an arc / circle, a spline / ellipse); relEquation refuses the entity types it cannot measure
      case 'equalcurve': return n === 2 && kinds.every(function (k) { return k === 'line' || k === 'circle' || k === 'free'; }) ? [0, 1] : null;
      case 'fix': case 'onEdge': return n === 1 && kinds[0] ? [0] : null;
      case 'distance':
        if (n !== 2) return null;
        return perm('point', 'point') || perm('point', 'line') || perm('line', 'line') || perm('circle', 'circle') || perm('point', 'circle') || perm('circle', 'line');
      case 'angle': return n === 2 ? perm('line', 'line') : null;
      // rfAQ: the chamfer line, then the line it is measured along; a chain of lines / arcs / circles; vertex, datum, point
      case 'chamfer': return n === 2 && kinds[0] === 'line' && kinds[1] === 'line' ? [0, 1] : null;
      case 'pathlength': return n >= 1 && kinds.every(function (k) { return k === 'line' || k === 'circle'; }) ? kinds.map(function (k, i) { return i; }) : null;
      case 'runangle': return n === 3 && kinds.every(function (k) { return k === 'point' || k === 'circle'; }) ? [0, 1, 2] : null;
    }
    return null;
  }

  // Residual function of one relation, with the sign / branch choices made from the geometry it is built on.
  // The end-point refs of a curve ref (a line's p1 / p2, an arc's p1 / p2, a polygon edge's corners).
  function endRefs(ents, r) {
    var e = ents[r.e];
    if (!e) return [];
    if (r.s === null && (e.t === 'line' || e.t === 'arc' || (e.t === 'spline' && !e.closed))) return [r.e + '.p1', r.e + '.p2'];
    if (r.s === 'e') {
      var c = corners(e);
      if (!c) return [];
      var o = [r.e + '.v' + r.k, r.e + '.v' + ((r.k + 1) % c.length)];
      // rfAK: a style spline's first / last control vertex is its end point ('3.p1' / '3.p2')
      if (e.t === 'spline') { if (r.k === 0) o.push(r.e + '.p1'); if (r.k + 2 === c.length) o.push(r.e + '.p2'); }
      return o;
    }
    return [];
  }
  // A Coincident in `rels` that joins an end of curve A to an end of curve B (or puts it on B): { ref } names the
  // shared point on A's side, or null. Tangency at a shared end point is written as an angle condition there, because
  // the distance form (centre-to-line = radius) has a zero gradient at the touching point and would be dependent on
  // the Coincident that holds the ends together.
  // p9-sketch: the join may also run through a chain of point-to-point Coincidents (a line drawn on from the end of
  // another line that ends on circle B: its start is Coincident with that end, which lies on B), so each end of A
  // collects the points coincident with it first.
  function sharedEnd(ents, rels, A, B) {
    if (!rels) return null;
    var ea = endRefs(ents, A), eb = endRefs(ents, B).concat([String(B.e)]);
    for (var i = 0; i < rels.length; i++) {
      var r = rels[i];
      if (r.type !== 'coincident' || !r.refs || r.refs.length !== 2) continue;
      for (var k = 0; k < 2; k++) if (ea.indexOf(r.refs[k]) >= 0 && eb.indexOf(r.refs[1 - k]) >= 0) return { ref: parseRef(r.refs[k]) };
    }
    for (var a = 0; a < ea.length; a++) {
      var group = [ea[a]], changed = true;
      while (changed) {
        changed = false;
        for (var j = 0; j < rels.length; j++) {
          var rj = rels[j];
          if (rj.type !== 'coincident' || !rj.refs || rj.refs.length !== 2) continue;
          for (var s = 0; s < 2; s++) {
            if (group.indexOf(rj.refs[s]) < 0 || group.indexOf(rj.refs[1 - s]) >= 0) continue;
            var o = parseRef(rj.refs[1 - s]);
            if (!o || o.o || refKind(ents, o) !== 'point') continue;   // a point, not a curve the end lies on
            group.push(rj.refs[1 - s]); changed = true;
          }
        }
      }
      for (var g = 1; g < group.length; g++) {
        if (eb.indexOf(group[g]) >= 0) return { ref: parseRef(ea[a]) };
        for (var t = 0; t < rels.length; t++) {
          var rt = rels[t];
          if (rt.type !== 'coincident' || !rt.refs || rt.refs.length !== 2) continue;
          for (var u = 0; u < 2; u++) if (rt.refs[u] === group[g] && eb.indexOf(rt.refs[1 - u]) >= 0) return { ref: parseRef(ea[a]) };
        }
      }
    }
    return null;
  }
  function unit(v) { var l = len(v); return l < 1e-15 ? [0, 0] : [v[0] / l, v[1] / l]; }
  // sketch-fillet2: the virtual sharps standing in for the ends of whole line ref r (a Sketch Fillet's construction
  // point at the corner it rounded, held on the line by a Coincident): { p1?: ref, p2?: ref } for the end each replaces
  // (the nearer one), or null
  function virtualEnds(ents, rels, r) {
    var e = !r.o && r.s === null ? ents[r.e] : null, out = null;
    if (!rels || !e || e.t !== 'line') return null;
    var a = [e.x1, e.y1], d = sub([e.x2, e.y2], a), L2 = dot(d, d);
    if (!(L2 > 0)) return null;
    rels.forEach(function (rel) {
      if (rel.type !== 'coincident' || !rel.refs || rel.refs.length !== 2) return;
      var k = rel.refs.indexOf(String(r.e));
      if (k < 0) return;
      var q = parseRef(rel.refs[1 - k]), sp = q && !q.o && q.s === null ? ents[q.e] : null;
      if (!sp || sp.t !== 'point' || !sp.sharp) return;
      var t = dot(sub([sp.x, sp.y], a), d) / L2;
      (out = out || {})[t < 0.5 ? 'p1' : 'p2'] = q;
    });
    return out;
  }
  // r9/sketch9: refs A and B name two whole slots (a slot and its offset copy: the radial offset dimension)
  function slotPair(ents, A, B) {
    return !!(A && B && !A.o && !B.o && A.s === null && B.s === null && A.e !== B.e && ents[A.e] && ents[B.e] && /^a?slot$/.test(ents[A.e].t) && ents[A.e].t === ents[B.e].t);   // p9-sketch-curves: arc slots too
  }

  function relEquation(ents, rel, rels) {
    var R = (rel.refs || []).map(parseRef);
    if (!TYPES[rel.type] || R.some(function (r) { return !r; })) return null;
    // sketch tools: a whole offset chain (Offset Entities) and a sketch pattern are one relation each (below)
    if (rel.type === 'pattern') return patternEquation(ents, rel, R);
    if (rel.type === 'polygon') return polygonEquation(ents, rel, R);
    if (rel.type === 'offset' && rel.chain) return chainEquation(ents, rel, R);
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
        // sketch-refine: a point on a spline / ellipse (its signed distance from the curve)
        else if (kB === 'free') { n = 1; f = function (E) { var fc = refFree(E, B); return [fc ? freeDist(fc, P(A, E)) : 1e6]; }; }
        else { n = 1; f = function (E) { var c = C(B, E); return [len(sub(P(A, E), c.c)) - c.r]; }; }
        break;
      case 'horizontal': case 'vertical': {
        var ax = rel.type === 'horizontal' ? 1 : 0;
        n = 1;
        if (kA === 'line') f = function (E) { var l = C(A, E); return [l.a[ax] - l.b[ax]]; };
        else f = function (E) { return [P(A, E)[ax] - P(B, E)[ax]]; };
        break;
      }
      case 'midpoint':
        n = 2;
        if (Ax) f = function (E) { var a = P(A, E), b = P(B, E), c = P(Ax, E); return [a[0] - (b[0] + c[0]) / 2, a[1] - (b[1] + c[1]) / 2]; };
        else f = function (E) { var a = P(A, E), l = C(B, E); return [a[0] - (l.a[0] + l.b[0]) / 2, a[1] - (l.a[1] + l.b[1]) / 2]; };
        break;
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
        // p9-sketchfix: two slots are mirror images: their widths are equal too (Mirror Entities holds a slot copy so)
        var slots = kA === 'line' && slotPair(ents, A, B);
        n = pairs.length * 2 + (kA === 'circle' || slots ? 1 : 0);
        f = function (E) {
          var L = C(Ax, E), dir = unit(sub(L.b, L.a)), out = [];
          pairs.forEach(function (pr) {
            var a = pr[0](E), b = pr[1](E);
            out.push(lineDist([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], L), dot(sub(b, a), dir));
          });
          if (kA === 'circle') out.push(C(A, E).r - C(B, E).r);
          if (slots) out.push(E[A.e].w - E[B.e].w);
          return out;
        };
        break;
      }
      case 'collinear': n = 2; f = function (E) { var l1 = C(A, E), l2 = C(B, E); return [lineDist(l2.a, l1), lineDist(l2.b, l1)]; }; break;
      case 'tangent': {
        n = 1;
        var sh = sharedEnd(ents, rels, A, B);
        if (kA === 'line' && kB === 'line') {
          // rfAK: a style spline's control polygon leg and a line: the leg (so the curve, at the vertex it ends on) runs
          // along the line's direction. Two plain lines are never tangent.
          if (!isLegRef(ents, A) && !isLegRef(ents, B)) return null;
          f = function (E) { return [crs(unit(sub(C(A, E).b, C(A, E).a)), unit(sub(C(B, E).b, C(B, E).a)))]; };
          break;
        }
        if (kB === 'free') {
          // sketch-fillet2: square to the spline's direction at the end it shares with the line / arc (no shared end: none)
          if (!sh) return null;
          var spdOf = function (Rf, E) {
            var fc = refFree(E, Rf), q = P(sh.ref, E);
            if (!fc) return [1, 0];
            var t = len(sub(fc.pt(fc.t0), q)) <= len(sub(fc.pt(fc.t1), q)) ? fc.t0 : fc.t1;
            return unit(fc.d1(t));
          };
          var spd = function (E) { return spdOf(B, E); };
          // rfAK: two splines meeting end to end: their directions there are parallel
          if (kA === 'free') f = function (E) { return [crs(spdOf(A, E), spd(E))]; };
          else if (kA === 'line') f = function (E) { return [crs(unit(sub(C(A, E).b, C(A, E).a)), spd(E))]; };
          else f = function (E) { return [dot(spd(E), unit(sub(P(sh.ref, E), C(A, E).c)))]; };
          break;
        }
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
      // sketchdims: one centre and one radius
      case 'coradial': n = 3; f = function (E) { var a = C(A, E), b = C(B, E); return [a.c[0] - b.c[0], a.c[1] - b.c[1], a.r - b.r]; }; break;
      // sketchdims: the point lies on both lines (where they cross, extended if need be)
      case 'intersection': n = 2; f = function (E) { var q = P(A, E); return [lineDist(q, C(B, E)), lineDist(q, C(Ax, E))]; }; break;
      case 'arclength': {
        // sketchdims: r · sweep of an arc (whole arc ref only)
        if (!(v >= 0) || A.o || A.s !== null || !ents[A.e] || ents[A.e].t !== 'arc') return null;
        var ia = A.e;
        n = 1;
        f = function (E) { var e = E[ia]; return [e.r * (e.a1 - e.a0) * D2R - v]; };
        break;
      }
      case 'equal':
        n = 1;
        if (kA === 'line') {
          // sketch-fillet2: a line that lost a corner to a Sketch Fillet / Chamfer is as long as it was to the corner (the
          // virtual sharp), as its length dimension is: Equal sides stay equal (a filleted polygon stays regular)
          var vA = virtualEnds(ents, rels, A), vB = virtualEnds(ents, rels, B);
          var vlen = function (r, v, E) { var l = C(r, E); return v ? len(sub(v.p2 ? P(v.p2, E) : l.b, v.p1 ? P(v.p1, E) : l.a)) : len(sub(l.b, l.a)); };
          f = function (E) { return [vlen(A, vA, E) - vlen(B, vB, E)]; };
        }
        else f = function (E) { return [C(A, E).r - C(B, E).r]; };
        break;
      case 'equalcurve': {
        // rfCR: the length along each curve: a line (or a rectangle's / polygon's edge), an arc's r · sweep, a circle's
        // 2πr, a spline's / ellipse's chord length over its samples. Other entity types (slots, arc slots) are refused.
        var lenOf = function (r, k) {
          var e = ents[r.e];
          if (e && (e.t === 'slot' || e.t === 'aslot')) return null;   // a slot's whole ref is its centre line, not its outline
          if (k === 'line') return function (E) { var l = C(r, E); return len(sub(l.b, l.a)); };
          if (k === 'free') return r.s === null ? function (E) { var fc = refFree(E, r); if (!fc) return 0; var sm = freeSamples(fc), L = 0; for (var q = 1; q < sm.length; q++) L += len(sub(sm[q].p, sm[q - 1].p)); return L; } : null;
          if (r.s !== null || !e) return null;
          if (e.t === 'arc') return function (E) { var a = E[r.e]; return Math.abs(a.a1 - a.a0) * D2R * a.r; };
          if (e.t === 'circle') return function (E) { return 2 * Math.PI * E[r.e].r; };
          return null;
        };
        var lA = lenOf(A, kA), lB = lenOf(B, kB);
        if (!lA || !lB) return null;
        n = 1;
        f = function (E) { return [lA(E) - lB(E)]; };
        break;
      }
      case 'fix': case 'onEdge': {
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
        if (rel.dir === 'r' && kA === 'circle' && kB === 'circle' && !slotPair(ents, A, B)) {   // (two arc slots: their width, below)
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
        // sketchdims: rel.flip (Reverse the sense of the dimension, one solve only): the signed distance taken from the
        // other side, so the solve mirrors the free entity across; a plain point-to-point distance has no side
        if (rel.flip && !(kA !== 'line' && kB !== 'line' && rel.dir !== 'h' && rel.dir !== 'v')) { var fs = f; f = function (E) { return [-(fs(E)[0] + v) - v]; }; }
        // sketchdims: arc conditions (rel.ac = [first, second], 'c' | 'min' | 'max', in refs order): a distance to a whole
        // circle / arc measured to its near side (min) or far side (max) instead of its centre
        if (rel.dir !== 'r' && Array.isArray(rel.ac)) {
          var acAdj = [];
          R.forEach(function (r, i) { var cd = rel.ac[i]; if (kinds[i] === 'circle' && (cd === 'min' || cd === 'max')) acAdj.push({ r: r, s: cd === 'min' ? -1 : 1 }); });
          if (acAdj.length) { var fb = f; f = function (E) { var x = fb(E)[0]; acAdj.forEach(function (q) { x += q.s * C(q.r, E).r; }); return [x]; }; }
        }
        break;
      }
      case 'angle': {
        if (!(v >= 0)) return null;
        n = 1;
        // rel.sup (r5/sketch5): the supplementary angle, measured to the second line reversed (the dimension was
        // placed in the obtuse quadrant); same sign as the plain angle, magnitude 180 - |angle|
        var sup = !!rel.sup, ang = function (E) { var a = angleDeg(C(A, E), C(B, E)); return sup ? (a >= 0 ? 180 - a : -180 - a) : a; };
        var s2 = sgn(ang(ents)) * (rel.flip ? -1 : 1);   // sketchdims: rel.flip, the angle swung to the other side
        f = function (E) { return [s2 * ang(E) - v]; };
        break;
      }
      case 'chamfer': case 'pathlength': case 'runangle': {
        var xq = rfaqEquation(ents, rel, R, kinds, v);
        if (!xq) return null;
        n = xq.n; f = xq.f;
        break;
      }
    }
    return f ? { n: n, f: f, ents: eidx } : null;
  }

  // rfAQ: what a Chamfer Dimension, a Path Length and an Angular Running dimension measure, and their equations
  function rfaqPathLen(ents, R, kinds) {
    for (var i = 0; i < R.length; i++) if (kinds[i] === 'circle' && (R[i].o || R[i].s !== null || !ents[R[i].e] || !/^(arc|circle)$/.test(ents[R[i].e].t))) return null;
    return function (E) {
      var t = 0;
      R.forEach(function (r, i) {
        if (kinds[i] === 'line') { var l = refCurve(E, r); t += len(sub(l.b, l.a)); }
        else { var e = E[r.e]; t += e.t === 'circle' ? 2 * Math.PI * Math.abs(e.r) : Math.abs(e.r * (e.a1 - e.a0) * D2R); }
      });
      return t;
    };
  }
  function rfaqPt(E, r, k) { return k === 'circle' ? refCurve(E, r).c : refPoint(E, r); }
  function rfaqRunAngle(E, R, kinds, cw) {
    var o = rfaqPt(E, R[0], kinds[0]), d = sub(rfaqPt(E, R[1], kinds[1]), o), m = sub(rfaqPt(E, R[2], kinds[2]), o);
    var a = (cw ? -1 : 1) * Math.atan2(crs(d, m), dot(d, m)) / D2R;
    return a < 0 ? a + 360 : a;
  }
  function rfaqChamfer(E, R) { var l1 = refCurve(E, R[0]), l2 = refCurve(E, R[1]); return dot(sub(l1.b, l1.a), unit(sub(l2.b, l2.a))); }
  function rfaqMeasure(sketch, type, R, kinds, cw) {
    var ents = sketch.entities;
    if (type === 'chamfer') return Math.abs(rfaqChamfer(ents, R));
    if (type === 'runangle') return rfaqRunAngle(ents, R, kinds, cw);
    var pl = rfaqPathLen(ents, R, kinds);
    return pl ? pl(ents) : null;
  }
  function rfaqEquation(ents, rel, R, kinds, v) {
    if (!(v >= 0)) return null;
    if (rel.type === 'pathlength') { var pl = rfaqPathLen(ents, R, kinds); return pl ? { n: 1, f: function (E) { return [pl(E) - v]; } } : null; }
    if (rel.type === 'runangle') {
      var cw = rel.dir === 'cw';
      // the difference wrapped to ±180: smooth through 0 / 360
      return { n: 1, f: function (E) { var r = rfaqRunAngle(E, R, kinds, cw) - v; return [((r % 360) + 540) % 360 - 180]; } };
    }
    // chamfer: the chamfer's length along the adjacent line (signed as it started) and, when rel.cang is set, the angle
    // between the two lines folded to 0..90 (signed as it started)
    var sd = sgn(rfaqChamfer(ents, R)), a0 = angleDeg(refCurve(ents, R[0]), refCurve(ents, R[1])), sa = sgn(a0), supA = Math.abs(a0) > 90;
    var hasAng = rel.cang != null && isFinite(+rel.cang), ca = +rel.cang;
    function angF(E) { var a = angleDeg(refCurve(E, R[0]), refCurve(E, R[1])); return supA ? (a >= 0 ? 180 - a : -180 - a) : a; }
    return { n: hasAng ? 2 : 1, f: function (E) { var out = [sd * rfaqChamfer(E, R) - v]; if (hasAng) out.push(sa * angF(E) - ca); return out; } };
  }

  // Equation of a Smart Dimension (Kernel.dimGeometry kinds) holding value `target`.
  function dimEquation(ents, d, target) {
    if (!K || !ents[d.e]) return null;
    var g = K.dimGeometry(ents[d.e], d);
    if (!g) return null;
    var t = target != null ? +target : g.value;
    return { n: 1, ents: [d.e], f: function (E) { var x = K.dimValue(E[d.e], d); return [x == null ? 0 : x - t]; } };
  }

  // ------------------------------------------------------------------ rfAU: block instances as rigid groups
  // A block instance (Kernel.makeBlock / insertBlock: entities tagged `blk` plus an insertion point { t: 'point', blkDef,
  // blkAng, blkS }) is one rigid body: its insertion point carries three unknowns (x, y and blkAng, degrees; the scale
  // blkS is a fixed value only Block properties changes) and every parameter of the instance's geometry is tied to them
  // by one equation (the definition placed by x, y, angle, scale). So an instance has exactly 3 degrees of freedom, a
  // dimension or relation to any of its points places / turns the whole instance, and one that would deform it adds no
  // rank (redundant: over-defining) or cannot be met (a conflict), reported like any other. The rows come first in the
  // system so the rank reduction blames the relation, not the block. The geometry of the definition comes from
  // sketch.blocks; when the instance no longer matches it (an entity deleted, a target without definitions: a No Solve
  // drag) the instance's present shape is the rigid shape. sketch._blkEdit (non-enumerable, set by Edit Block) is the
  // instance being edited: it is ordinary geometry meanwhile (its angle is held by a gauge row so it adds no DOF).
  var BLK_PAIR_X = { x: 'y', x1: 'y1', x2: 'y2', cx: 'cy' }, BLK_PAIR_Y = { y: 'x', y1: 'x1', y2: 'x2', cy: 'cx' };
  var BLK_ANG_MOB = 1e-4;   // a degree of block rotation is dear next to a unit of travel: a drag translates the block
  var BLK_W = 30;           // rigid rows weigh more than a relation: a least-squares compromise (conflict names) bends the relation
  function blkAngled(t, nm) { return nm === 'rot' || ((nm === 'a0' || nm === 'a1') && t !== 'pellipse'); }
  // the value parameter nm of block-coordinate entity loc takes when placed by m ({ c, s, k, ang, tx, ty })
  function blkWant(loc, nm, m) {
    var X, Y;
    if (typeof nm === 'number') { var p = loc.pts[nm >> 1]; X = p[0]; Y = p[1]; return nm & 1 ? m.ty + m.k * (m.s * X + m.c * Y) : m.tx + m.k * (m.c * X - m.s * Y); }
    if (BLK_PAIR_X[nm]) { X = +loc[nm] || 0; Y = +loc[BLK_PAIR_X[nm]] || 0; return m.tx + m.k * (m.c * X - m.s * Y); }
    if (BLK_PAIR_Y[nm]) { X = +loc[BLK_PAIR_Y[nm]] || 0; Y = +loc[nm] || 0; return m.ty + m.k * (m.s * X + m.c * Y); }
    if (nm === 'r' || nm === 'w' || nm === 'rx' || nm === 'ry') return m.k * (+loc[nm] || 0);
    if (blkAngled(loc.t, nm)) return (+loc[nm] || 0) + m.ang;
    return +loc[nm] || 0;
  }
  function blkM(x, y, ang, s) { var a = ang * D2R; return { c: Math.cos(a), s: Math.sin(a), k: s > 0 ? s : 1, ang: ang, tx: x, ty: y }; }
  // the block-coordinate copy of placed entity e (the inverse of blkWant for its parameters)
  function blkLocal(e, m) {
    var o = clone(e), inv = { c: m.c, s: -m.s, k: 1 / m.k, ang: -m.ang, tx: 0, ty: 0 }, sh = clone(e);
    paramNames(e).forEach(function (nm) {
      if (typeof nm === 'number') { if (nm & 1) return; var p = e.pts[nm >> 1]; sh.pts[nm >> 1] = [p[0] - m.tx, p[1] - m.ty]; return; }
      if (BLK_PAIR_X[nm]) sh[nm] = (+e[nm] || 0) - m.tx; else if (BLK_PAIR_Y[nm]) sh[nm] = (+e[nm] || 0) - m.ty;
    });
    paramNames(e).forEach(function (nm) { pset(o, nm, blkWant(sh, nm, inv)); });
    return o;
  }
  function blkSameShape(a, b) {
    if (!a || !b || a.t !== b.t) return false;
    return !(a.pts || b.pts) || !!(a.pts && b.pts && a.pts.length === b.pts.length);
  }
  // the rigid groups of a sketch: [{ ins, ents: [indices], local: [block-coordinate entities], s, free }]
  function blockGroups(sketch, ents) {
    if (!K || !K.blockInstances) return [];
    var list = K.blockInstances({ entities: ents });
    if (!list.length) return [];
    var defs = sketch.blocks || null, edit = sketch._blkEdit != null ? String(sketch._blkEdit) : null;
    return list.map(function (r) {
      var g = { ins: r.ins, ents: r.ents, s: r.s > 0 ? r.s : 1, free: edit === r.id, def: r.def };
      if (g.free) return g;
      var d = defs && defs[r.def], E = r.ents.map(function (i) { return ents[i]; });
      if (d && d.ents && d.ents.length === E.length && d.ents.every(function (q, k) { return blkSameShape(q, E[k]); })) g.local = d.ents;
      else { var m = blkM(r.x, r.y, r.ang, g.s); g.local = E.map(function (e) { return blkLocal(e, m); }); }
      return g;
    });
  }
  // the system rows: one per instance entity (all its parameters), and a gauge on an edited instance's angle
  function blockRows(sketch, ents) {
    var rows = [];
    blockGroups(sketch, ents).forEach(function (g) {
      var ins = g.ins, sc = g.s;
      if (g.free) {
        var a0 = +ents[ins].blkAng || 0;
        rows.push({ src: 'extra', index: -1, n: 1, ents: [ins], gauge: true, rigid: true, f: function (E) { return [(+E[ins].blkAng || 0) - a0]; } });
        return;
      }
      g.ents.forEach(function (i, k) {
        var loc = g.local[k], names = paramNames(ents[i]);
        if (!loc || !names.length) return;
        var angled = names.map(function (nm) { return typeof nm !== 'number' && blkAngled(loc.t, nm); });
        rows.push({ src: 'extra', index: -1, n: names.length, ents: [i, ins], rigid: true, blk: g.def, f: function (E) {
          var P = E[ins], e = E[i], m = blkM(+P.x || 0, +P.y || 0, +P.blkAng || 0, sc);
          return names.map(function (nm, j) { var d = pget(e, nm) - blkWant(loc, nm, m); return BLK_W * (angled[j] ? ((d % 360) + 540) % 360 - 180 : d); });
        } });
      });
    });
    return rows;
  }
  // a drag's mobilities when the sketch has block instances (their angle moves little: a drag translates the block)
  function blockMob(sys) {
    if (!sys.vars.some(function (v) { return v.n === 'blkAng'; })) return null;
    return sys.vars.map(function (v) { return v.n === 'blkAng' ? BLK_ANG_MOB : 1; });
  }
  // before a solve: an instance moved as a whole by a direct edit (Move Entities, a typed coordinate) takes its insertion
  // point along (Kernel.syncBlocks), so the rigid rows hold it where it was put rather than pulling it back
  // (instances that came in from a DXF get their definitions first: Kernel.adoptBlocks)
  function blockPresync(sketch) {
    if (!sketch || !K || !K.syncBlocks) return;
    try {
      if (K.adoptBlocks) K.adoptBlocks(sketch);
      if (sketch.blocks) K.syncBlocks(sketch, sketch._blkEdit != null ? sketch._blkEdit : null);
    } catch (err) { /* solved as it is */ }
  }

  // ------------------------------------------------------------------ the system
  // opts: { dimTargets: { index: value }, relTargets: { index: value }, extra: [{ n, f, ents }], skipRels: bool }
  function buildSystem(sketch, opts) {
    opts = opts || {};
    var ents = clone(sketch.entities || []);
    var vars = [], owner = [];
    var only = opts.entities || null;   // { index: true }: unknowns of these entities only, and the equations that touch them
    ents.forEach(function (e, i) { if (only && !only[i]) return; paramNames(e).forEach(function (nm) { vars.push({ e: i, n: nm }); owner.push(i); }); });
    // lane DE: a driving spline handle a relation names ('3.h2') turns: its angle is an unknown
    var hSeen = {};
    (sketch.rels || []).forEach(function (rel) {
      if (rel.suppressed) return;
      rel.refs.forEach(function (r) {
        var p = parseRef(r), e = p && !p.o && p.s === 'h' ? ents[p.e] : null;
        if (!e || e.t !== 'spline' || e.style || (only && !only[p.e]) || !(e.tans && e.tans[p.k] && e.tans[p.k][0] != null) || hSeen[r]) return;
        hSeen[r] = true; vars.push({ e: p.e, n: 'h' + p.k }); owner.push(p.e);
      });
    });
    var cons = blockRows(sketch, ents);   // rfAU: block instances are rigid (first: the rank reduction blames relations)
    (sketch.rels || []).forEach(function (rel, i) {
      var r = rel;
      if (opts.relTargets && opts.relTargets[i] != null) { r = clone(rel); r.v = opts.relTargets[i]; }
      if (rel.driven && TYPES[rel.type] && TYPES[rel.type].dim) { cons.push({ src: 'rel', index: i, n: 0, driven: true, ents: [] }); return; }
      // sketchdims: a suppressed relation (Display/Delete Relations' Suppressed) holds nothing until it is unsuppressed
      if (rel.suppressed) { cons.push({ src: 'rel', index: i, n: 0, suppressed: true, ents: [] }); return; }
      var q = relEquation(ents, r, sketch.rels);
      cons.push(q ? { src: 'rel', index: i, n: q.n, f: q.f, ents: q.ents, implied: !!rel.implied } : { src: 'rel', index: i, n: 0, bad: true, ents: [] });
    });
    (sketch.dims || []).forEach(function (d, i) {
      if (d.driven) { cons.push({ src: 'dim', index: i, n: 0, driven: true, ents: [] }); return; }
      var q = dimEquation(ents, d, opts.dimTargets ? opts.dimTargets[i] : null);
      cons.push(q ? { src: 'dim', index: i, n: q.n, f: q.f, ents: q.ents } : { src: 'dim', index: i, n: 0, bad: true, ents: [] });
    });
    (opts.extra || []).forEach(function (q, i) { cons.push({ src: 'extra', index: i, n: q.n, f: q.f, ents: q.ents, soft: q.soft }); });
    // sketch-refine: an infinite line is the line through its two points; how far each point sits along it means nothing,
    // so each is held where it is along the line (2 degrees of freedom left, as a line has: a dimensioned infinite line
    // is Fully Defined)
    ents.forEach(function (e, i) {
      var sd = infSides(e);
      if (!sd || (only && !only[i])) return;
      var u = unit([e.x2 - e.x1, e.y2 - e.y1]), a0 = [e.x1, e.y1], b0 = [e.x2, e.y2];
      if (!(len(u) > 0.5)) return;
      if (sd.p1) cons.push({ src: 'extra', index: -1, n: 1, ents: [i], gauge: true, f: function (E) { var l = E[i]; return [dot(sub([l.x1, l.y1], a0), u)]; } });
      if (sd.p2) cons.push({ src: 'extra', index: -1, n: 1, ents: [i], gauge: true, f: function (E) { var l = E[i]; return [dot(sub([l.x2, l.y2], b0), u)]; } });
    });
    if (only) cons = cons.filter(function (c) { return c.n && c.ents.some(function (e) { return only[e]; }); });
    var row = 0, byEnt = ents.map(function () { return []; });
    cons.forEach(function (c) { c.row = row; row += c.n; c.ents.forEach(function (e) { if (byEnt[e]) byEnt[e].push(c); }); });
    var scale = 1;
    vars.forEach(function (v) { if (v.n !== 'a0' && v.n !== 'a1' && v.n !== 'rot' && v.n !== 'blkAng' && !isHandleName(ents[v.e], v.n)) scale = Math.max(scale, Math.abs(pget(ents[v.e], v.n))); });
    return { ents: ents, vars: vars, cons: cons, m: row, byEnt: byEnt, scale: scale };
  }
  // The entities tied to entity e through the system's equations: { set: { index: true }, count }. skip: an entity the
  // walk does not pass through (sketch-anchor: the side of a dimension that moves, with the other side's entity cut out).
  function connected(sys, e, skip) {
    var set = {}, count = 0, stack = [e];
    while (stack.length) {
      var i = stack.pop();
      if (set[i] || !sys.ents[i] || i === skip) continue;
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
      else if (c.suppressed) st = 'suppressed';
      else if (c.bad) st = 'invalid';
      else {
        var bad = false;
        for (var k = 0; k < c.n; k++) if (Math.abs(r[c.row + k]) > tol) bad = true;
        // rfY: an implied relation (an arc slot's fourth join) repeats part of what the others say by construction
        if (bad) st = 'conflict'; else if (info.dep[ci] && !c.implied) st = 'redundant';
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
    // lane DE: the handle angles a relation turned (unknowns beyond paramNames)
    sys.vars.forEach(function (v) {
      var e = sys.ents[v.e], o = sketch.entities[v.e];
      if (!isHandleName(e, v.n) || !o || !o.tans || !o.tans[+v.n.slice(1)]) return;
      var x = pget(e, v.n), q = Math.round(x * 1e6) / 1e6;
      if (Math.abs(q - x) < 1e-9) x = q;
      while (x > 180) x -= 360;
      while (x <= -180) x += 360;
      if (x !== pget(o, v.n)) pset(o, v.n, x);
    });
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
      if (o.t === 'arc' || o.t === 'aslot') { while (o.a1 <= o.a0) o.a1 += 360; while (o.a1 - o.a0 > 360 + 1e-9) o.a1 -= 360; }
    });
  }
  function mobility(sys, mobByEnt) {
    // ui-sketch-spline: an ellipse's radii move less than positions (a Coincident on an axis end moves the ellipse
    // rather than collapsing it)
    // lane DE: a spline handle's angle turns freely (its dimension turns the handle, not the line it is measured to)
    var axes = sys.vars.some(function (v) { return v.n === 'rx' || v.n === 'ry' || v.n === 'blkAng' || isHandleName(sys.ents[v.e], v.n); });
    if (!mobByEnt && !axes) return null;
    return sys.vars.map(function (v) { var mb = mobByEnt && mobByEnt[v.e] != null ? mobByEnt[v.e] : 1; return v.n === 'rx' || v.n === 'ry' ? mb * 0.3 : v.n === 'blkAng' ? mb * BLK_ANG_MOB : isHandleName(sys.ents[v.e], v.n) ? mb * 100 : mb; });
  }
  // ui-sketch-spline: dragging an ellipse's axis end turns / resizes it about its centre, a partial ellipse's end slides
  // along it (SolidWorks): the centre hardly moves, the end's parameter angle moves freely
  function dragMob(sys, R) {
    var list = null;
    sys.vars.forEach(function (v, j) {
      if (v.e !== R.e || (R.s !== 'v' && R.s !== 'p')) return;
      // (angles are in degrees: a degree costs what a length unit does, so they get a large mobility)
      var w = v.n === 'cx' || v.n === 'cy' ? 0.05 : v.n === 'rx' || v.n === 'ry' ? (R.s === 'p' ? 0.3 : 1) : v.n === 'a0' || v.n === 'a1' ? 50 : v.n === 'rot' && R.s === 'v' ? 100 : null;
      if (w == null) return;
      if (!list) list = sys.vars.map(function () { return 1; });
      list[j] = w;
    });
    return list;
  }
  // rfAV: did the solve take a line of real length (a circle / arc of real radius) down to (almost) nothing?
  // Returns the hold equations (each such entity kept at its size) for a second try, or null.
  function collapsed(sketch, sys) {
    var holds = null;
    for (var i = 0; i < sys.ents.length; i++) {
      var a = sketch.entities[i], b = sys.ents[i];
      if (!a || !b || a.t !== b.t) continue;
      var L0, L1;
      if (a.t === 'line') { L0 = Math.hypot(a.x2 - a.x1, a.y2 - a.y1); L1 = Math.hypot(b.x2 - b.x1, b.y2 - b.y1); }
      else if (a.t === 'circle' || a.t === 'arc') { L0 = Math.abs(a.r); L1 = Math.abs(b.r); }
      else continue;
      if (L0 > 1e-6 && L1 < Math.max(1e-9, L0 * 1e-6)) (holds = holds || []).push(sizeHold(i, a.t, L0));
    }
    return holds;
  }
  function sizeHold(i, t, L0) {
    return { i: i, n: 1, ents: [i], f: t === 'line' ? function (E) { var e = E[i]; return [Math.hypot(e.x2 - e.x1, e.y2 - e.y1) - L0]; } : function (E) { return [E[i].r - L0]; } };
  }
  // The second try starts from a copy with each held line turned 2° about its middle: an exactly horizontal line asked
  // to be vertical at constant length sits on a saddle (no first-order way to turn), the turn lets it go either way.
  // The result is copied into the sketch's own entity objects (callers keep references to them).
  function solveHolding(sketch, opts, holds) {
    var c = Object.assign({}, sketch, { entities: clone(sketch.entities) }), tw = 2 * Math.PI / 180;
    holds.forEach(function (h) {
      var e = c.entities[h.i];
      if (!e || e.t !== 'line') return;
      var mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2, co = Math.cos(tw), si = Math.sin(tw);
      [['x1', 'y1'], ['x2', 'y2']].forEach(function (k) { var dx = e[k[0]] - mx, dy = e[k[1]] - my; e[k[0]] = mx + dx * co - dy * si; e[k[1]] = my + dx * si + dy * co; });
    });
    var r = solve(c, Object.assign({}, opts, { extra: (opts.extra || []).concat(holds), noCollapse: true }));
    if (!r.ok) { updateDriven(sketch); return { ok: false, it: r.it, res: r.res, moved: 0, collapsed: true }; }
    var moved = 0;
    c.entities.forEach(function (e, i) {
      var o = sketch.entities[i];
      if (!o || !e) return;
      paramNames(e).forEach(function (nm) { var v = pget(e, nm), w = pget(o, nm); if (v === w) return; moved = Math.max(moved, Math.abs(v - w)); pset(o, nm, v); });
    });
    updateDriven(sketch);
    return { ok: true, it: r.it, res: r.res, moved: moved };
  }
  function solve(sketch, opts) {
    opts = opts || {};
    blockPresync(sketch);   // rfAU
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
    // rfAV: a solution that shrinks a line (or a circle / arc) of real size to nothing is no solution, as in SolidWorks
    // (Horizontal plus Vertical on one line is a conflict, not a zero-length line). Accepting it lost the line's length
    // for good: deleting one of the two relations afterwards left the line a point.
    // The second try holds those sizes: a line left with Vertical only (its Horizontal deleted) turns about its
    // middle and keeps its length; Horizontal and Vertical together then fail, as the conflict they are.
    var holds = r.ok && !opts.force && !opts.noCollapse ? collapsed(sketch, sys) : null;
    if (holds) return solveHolding(sketch, opts, holds);
    if (r.ok && opts.noCollapse && collapsed(sketch, sys)) r = { ok: false, it: r.it, res: r.res };
    if (r.ok || opts.force) writeBack(sketch, sys);
    updateDriven(sketch);
    return { ok: r.ok, it: r.it, res: r.res, moved: r.ok || opts.force ? moved : 0 };
  }

  // Driven (reference) distance / angle relations read their value off the geometry. Single-entity Smart Dimensions
  // hold no value (Kernel.dimValue reads the entity), so a driven one is always current.
  function updateDriven(sketch) {
    (sketch.rels || []).forEach(function (rel) {
      if (!rel.driven || !TYPES[rel.type] || !TYPES[rel.type].dim) return;
      var v = measure(sketch, rel.type, rel.refs, rel.dir, rel.sup, rel.ac);
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
    else { over = overDefines(sketch, kind, index); delete item.driven; if (kind === 'rel') { var v = measure(sketch, item.type, item.refs, item.dir, item.sup, item.ac); if (v != null) item.v = v; } }
    var an = analyze(sketch), st = an[kind === 'rel' ? 'rels' : 'dims'][index];
    return { ok: true, state: over && st === 'ok' ? 'redundant' : st, analysis: an };
  }

  // ------------------------------------------------------------------ SketchXpert (rfAR)
  // SolidWorks' SketchXpert: Diagnose finds the sets of relations / dimensions whose removal leaves an over-defined
  // sketch solvable and no longer over defined; Manual Repair lists the items involved, to delete one by one. Pure:
  // the sketch is never changed (each trial runs on a copy where the items are suppressed / made driven).
  // diagnose(sketch, opts) -> { status, over, candidates: [{ src: 'rel' | 'dim', index, name, state }],
  //   solutions: [{ remove: [{ src, index }], names: [text], status, dof }] }. opts: { max: 12 solutions,
  //   maxCandidates: 40, pairs: true (try pairs when no single item fixes it) }
  function diagItemName(sketch, it) { return it.src === 'dim' ? dimName(sketch, sketch.dims[it.index]) : describe(sketch, sketch.rels[it.index]); }
  function diagWithout(sketch, list) {
    var c = { entities: clone(sketch.entities || []) };
    if (sketch.rels) c.rels = clone(sketch.rels);
    if (sketch.dims) c.dims = clone(sketch.dims);
    list.forEach(function (it) { if (it.src === 'rel') c.rels[it.index].suppressed = true; else c.dims[it.index].driven = true; });
    return c;
  }
  function diagTrial(sketch, list) {
    var c = diagWithout(sketch, list), a;
    try {
      a = analyze(c);
      if (a.conflicts) { if (!solve(c).ok) return null; a = analyze(c); }
    } catch (err) { return null; }
    return a.conflicts || a.redundant ? null : { sketch: c, analysis: a };
  }
  function diagnose(sketch, opts) {
    opts = opts || {};
    var max = opts.max || 12, a0 = analyze(sketch), out = { status: a0.status, over: a0.status === 'over', candidates: [], solutions: [] };
    if (!out.over) return out;
    var sys = buildSystem(sketch), overEnts = {}, flagged = [], tied = [];
    a0.entities.forEach(function (st, i) { if (st === 'over' || st === 'conflict') overEnts[i] = true; });
    sys.cons.forEach(function (c) {
      if (c.src === 'extra' || !c.n || c.driven || c.suppressed) return;
      var st = (c.src === 'rel' ? a0.rels : a0.dims)[c.index], it = { src: c.src, index: c.index, state: st };
      if (st === 'conflict' || st === 'redundant') flagged.push(it);
      else if (c.ents.some(function (e) { return overEnts[e]; })) tied.push(it);
    });
    var cands = flagged.concat(tied).slice(0, opts.maxCandidates || 40);
    cands.forEach(function (it) { it.name = diagItemName(sketch, it); });
    out.candidates = cands;
    function add(list, tr) {
      out.solutions.push({ remove: list.map(function (it) { return { src: it.src, index: it.index }; }), names: list.map(function (it) { return it.name; }), status: tr.analysis.status, dof: tr.analysis.dof });
    }
    cands.forEach(function (it) { if (out.solutions.length < max) { var tr = diagTrial(sketch, [it]); if (tr) add([it], tr); } });
    if (!out.solutions.length && opts.pairs !== false) {
      var tries = 0;
      for (var i = 0; i < cands.length && out.solutions.length < max && tries < 400; i++) {
        for (var j = i + 1; j < cands.length && out.solutions.length < max && tries < 400; j++) {
          tries++;
          var tr = diagTrial(sketch, [cands[i], cands[j]]);
          if (tr) add([cands[i], cands[j]], tr);
        }
      }
    }
    return out;
  }
  // Delete the relations / dimensions of a SketchXpert solution (diagnose().solutions[k].remove, or any list of
  // { src, index }) and re-solve. Returns { ok, removed, analysis }.
  function diagnoseApply(sketch, remove) {
    var rels = remove.filter(function (it) { return it.src === 'rel'; }).map(function (it) { return it.index; }).sort(function (a, b) { return b - a; });
    var dims = remove.filter(function (it) { return it.src === 'dim'; }).map(function (it) { return it.index; }).sort(function (a, b) { return b - a; });
    rels.forEach(function (i) { deleteRelation(sketch, i); });
    dims.forEach(function (i) { if (sketch.dims && sketch.dims[i]) sketch.dims.splice(i, 1); });
    if (sketch.dims && !sketch.dims.length) delete sketch.dims;
    var r = solve(sketch);
    return { ok: r.ok, removed: rels.length + dims.length, analysis: analyze(sketch) };
  }

  // ------------------------------------------------------------------ Scan Equal (rfAR)
  // Tools > Relations > Scan Equal: lines of equal length and arcs / circles of equal radius, within opts.tol (an
  // absolute length; default 1e-6 of the sketch's size). Construction geometry counts unless opts.noConstruction;
  // opts.entities limits the scan to those indices. Returns { groups: [{ kind: 'line' | 'radius', value,
  // members: [entity index] }], tol } (two members or more each).
  function scanEqual(sketch, opts) {
    opts = opts || {};
    var ents = sketch.entities || [], items = [], size = 0;
    ents.forEach(function (e, i) {
      if (!e || (opts.noConstruction && e.construction)) return;
      if (opts.entities && opts.entities.indexOf(i) < 0) return;
      if (e.t === 'line' && !e.infinite) items.push({ i: i, kind: 'line', v: Math.hypot(e.x2 - e.x1, e.y2 - e.y1) });
      else if ((e.t === 'arc' || e.t === 'circle') && e.r > 0) items.push({ i: i, kind: 'radius', v: +e.r });
    });
    items.forEach(function (it) { size = Math.max(size, it.v); });
    var tol = opts.tol != null ? +opts.tol : 1e-6 * Math.max(1, size), groups = [];
    ['line', 'radius'].forEach(function (kind) {
      var list = items.filter(function (it) { return it.kind === kind; }).sort(function (a, b) { return a.v - b.v || a.i - b.i; }), g = null;
      list.forEach(function (it) {
        if (g && it.v - g.first <= tol) g.members.push(it.i);
        else { if (g && g.members.length > 1) groups.push(g); g = { kind: kind, value: it.v, first: it.v, members: [it.i] }; }
      });
      if (g && g.members.length > 1) groups.push(g);
    });
    groups.forEach(function (g) { delete g.first; g.members.sort(function (a, b) { return a - b; }); });
    return { groups: groups, tol: tol };
  }
  // Equal between the first member of a scanEqual group and each other one; an Equal that would over-define the
  // sketch (already equal through other relations) is skipped. Returns { ok, added: [rel index], skipped }.
  function applyEqual(sketch, members) {
    var added = [], skipped = 0;
    for (var k = 1; k < members.length; k++) {
      var r = addRelation(sketch, 'equal', [String(members[0]), String(members[k])], { rejectOver: true });
      if (r.ok) added = added.concat(r.rels); else skipped++;
    }
    return { ok: true, added: added, skipped: skipped };
  }

  // ------------------------------------------------------------------ Fully Define Sketch (sketchdims)
  // SolidWorks' Tools > Dimensions > Fully Define Sketch: relations first (Horizontal / Vertical on lines within
  // opts.tolDeg of an axis), then dimensions: sizes (circle diameters, arc and polygon radii, slot widths), then the
  // position of every point as horizontal and vertical distances from the datums (Baseline: each from the datum;
  // Chain: each from the previous point along the axis). A candidate is kept only when it removes a degree of freedom
  // the sketch still has (its Jacobian rows add rank to what the relations and dimensions already pin), so nothing is
  // over-defined and points already held stay as they are. A point level with the datum gets a Horizontal / Vertical
  // relation with it instead of a zero dimension.
  // opts: { relations: { horizontal, vertical } (default both on; false: none), dims: true, scheme: 'baseline' | 'chain'
  //   (or hScheme / vScheme for one direction), hDatum: ref the horizontal dimensions start from (default 'O'), vDatum:
  //   ref the vertical ones start from ('O'), hPlace: 'below' | 'above', vPlace: 'left' | 'right', entities: [i]
  //   (default every entity), tolDeg: 1, gap: spacing of stacked dimension lines (sketch units; default 8 % of the
  //   sketch's size, at least minGap) }.
  // Returns { ok, rels: [indices added], dims: [indices added], status, dof }.
  function basisAdd(basis, v0, n, commit) {
    var v = Array.prototype.slice.call(v0), nv = 0, j;
    for (j = 0; j < n; j++) nv += v[j] * v[j];
    nv = Math.sqrt(nv);
    if (nv < 1e-14) return false;
    for (j = 0; j < n; j++) v[j] /= nv;
    basis.forEach(function (b) { var f = v[b.p]; if (f) for (var j2 = 0; j2 < n; j2++) v[j2] -= f * b.row[j2]; });
    var p = -1, best = 0;
    for (j = 0; j < n; j++) if (Math.abs(v[j]) > best) { best = Math.abs(v[j]); p = j; }
    if (best < 1e-7) return false;
    if (!commit) return true;
    var pv = v[p];
    for (j = 0; j < n; j++) v[j] /= pv;
    basis.forEach(function (b) { var f = b.row[p]; if (f) for (var j5 = 0; j5 < n; j5++) b.row[j5] -= f * v[j5]; });
    basis.push({ p: p, row: v });
    return true;
  }
  function fullyDefine(sketch, opts) {
    opts = opts || {};
    var ents = sketch.entities || [];
    if (!ents.length) return { ok: false, error: 'The sketch has no geometry to define.' };
    var sys = buildSystem(sketch), n = sys.vars.length, J = jacobian(sys), basis = [];
    sys.cons.forEach(function (c) { if (!c.soft) for (var k = 0; k < c.n; k++) basisAdd(basis, J[c.row + k], n, true); });
    var varsOf = sys.ents.map(function () { return []; });
    sys.vars.forEach(function (v, j) { varsOf[v.e].push(j); });
    // the Jacobian row(s) of one candidate equation, on the current geometry
    function rowsOf(q) {
      var rows = [];
      for (var k = 0; k < q.n; k++) rows.push(new Float64Array(n));
      q.ents.forEach(function (ei) {
        (varsOf[ei] || []).forEach(function (j) {
          var v = sys.vars[j], e = sys.ents[v.e], x = pget(e, v.n), h = 1e-6 * Math.max(1, Math.abs(x));
          pset(e, v.n, x + h); var a = q.f(sys.ents);
          pset(e, v.n, x - h); var b = q.f(sys.ents);
          pset(e, v.n, x);
          for (var k2 = 0; k2 < q.n; k2++) rows[k2][j] = (a[k2] - b[k2]) / (2 * h);
        });
      });
      return rows;
    }
    function useful(q) {
      if (!q || q.n !== 1) return false;
      var rows = rowsOf(q);
      if (!basisAdd(basis, rows[0], n, false)) return false;
      basisAdd(basis, rows[0], n, true);
      return true;
    }
    var only = Array.isArray(opts.entities) ? opts.entities.filter(function (i) { return ents[i]; }) : ents.map(function (e, i) { return i; });
    var relOn = opts.relations !== false, relH = relOn && !(opts.relations && opts.relations.horizontal === false), relV = relOn && !(opts.relations && opts.relations.vertical === false);
    var tolDeg = opts.tolDeg != null ? +opts.tolDeg : 1, newRels = [], newDims = [];
    function chainOn(ax) { var sc = ax === 0 ? opts.hScheme : opts.vScheme; return (sc || opts.scheme) === 'chain'; }
    // relations
    only.forEach(function (i) {
      var e = ents[i];
      if (!e || e.t !== 'line') return;
      var a = Math.abs(Math.atan2(e.y2 - e.y1, e.x2 - e.x1) / D2R) % 180;
      var t = relH && (a <= tolDeg || a >= 180 - tolDeg) ? 'horizontal' : relV && Math.abs(a - 90) <= tolDeg ? 'vertical' : null;
      if (!t) return;
      var rel = { type: t, refs: [String(i)] }, q = relEquation(sys.ents, rel, sketch.rels);
      if (useful(q)) newRels.push(rel);
    });
    if (opts.dims !== false) {
      // sizes
      only.forEach(function (i) {
        var e = ents[i], k = e && (e.t === 'circle' ? 'dia' : e.t === 'arc' || e.t === 'poly' ? 'r' : e.t === 'slot' ? 'w' : null);
        if (!k) return;
        var d = { e: i, k: k }, q = dimEquation(sys.ents, d);
        if (useful(q)) newDims.push(d);
      });
      // positions
      var hD = opts.hDatum != null ? String(opts.hDatum) : 'O', vD = opts.vDatum != null ? String(opts.vDatum) : 'O';
      var pts = [];
      only.forEach(function (i) {
        var e = ents[i];
        pointRefs(sketch, i).forEach(function (pr) {
          if (/\.mid$/.test(pr.ref) || (/\.c$/.test(pr.ref) && (e.t === 'rect' || e.t === 'slot'))) return;
          pts.push(pr);
        });
      });
      var scale = sys.scale, tiny = 1e-9 * Math.max(1, scale);
      // each point: level with a point already placed on this axis (the datum first) -> Vertical / Horizontal with it;
      // otherwise a distance from the datum (baseline) or from the previous point dimensioned (chain)
      function axisCands(ax, datum) {
        var dk = refKind(ents, parseRef(datum)), list = pts.slice(), prev = datum, chain = chainOn(ax);
        var placed = dk === 'point' ? [{ ref: datum, pt: refPoint(ents, parseRef(datum)) }] : [];
        if (chain) list.sort(function (a, b) { return a.pt[ax] - b.pt[ax]; });
        function take(rel) {
          if (rel.type === 'distance') { rel.v = measure(sketch, 'distance', rel.refs, rel.dir); if (!(rel.v >= 0)) return false; }
          if (!useful(relEquation(sys.ents, rel, sketch.rels))) return false;
          rel.axis = ax;
          newRels.push(rel);
          return true;
        }
        list.forEach(function (pr) {
          if (pr.ref === datum) return;
          var lvl = placed.filter(function (q) { return Math.abs(q.pt[ax] - pr.pt[ax]) <= tiny; })[0];
          if (lvl && take({ type: ax === 0 ? 'vertical' : 'horizontal', refs: [lvl.ref, pr.ref] })) { placed.push(pr); return; }
          var from = chain ? prev : datum, fk = refKind(ents, parseRef(from));
          var ok = fk === 'line' ? take({ type: 'distance', refs: [from, pr.ref] }) : fk === 'point' ? take({ type: 'distance', refs: [from, pr.ref], dir: ax === 0 ? 'h' : 'v' }) : false;
          if (ok) { placed.push(pr); prev = pr.ref; }
        });
      }
      if (!opts.skipH) axisCands(0, hD);   // rfAQ: Autodimension with one direction off
      if (!opts.skipV) axisCands(1, vD);
    }
    // placement: horizontal dimensions stacked below the sketch, vertical ones to its left (baseline: nearest first;
    // chain: one row)
    var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    ents.forEach(function (e) {
      var pls = [];
      try { pls = K && K.entityPolylines ? K.entityPolylines(e) : []; } catch (err) { pls = []; }
      if (!pls.length && e.t === 'point') pls = [{ pts: [[e.x, e.y]] }];
      pls.forEach(function (l) { l.pts.forEach(function (q) { for (var a = 0; a < 2; a++) { lo[a] = Math.min(lo[a], q[a]); hi[a] = Math.max(hi[a], q[a]); } }); });
    });
    if (!isFinite(lo[0])) { lo = [0, 0]; hi = [0, 0]; }
    lo = [Math.min(lo[0], 0), Math.min(lo[1], 0)];
    hi = [Math.max(hi[0], 0), Math.max(hi[1], 0)];
    var gap = opts.gap > 0 ? +opts.gap : Math.max(Math.max(hi[0] - lo[0], hi[1] - lo[1], 1) * 0.08, +opts.minGap || 0);
    var rows = [0, 0], dimRels = newRels.filter(function (r) { return r.type === 'distance' && r.dir; });
    var far = [opts.hPlace === 'above', opts.vPlace === 'right'];
    [0, 1].forEach(function (ax) {
      dimRels.filter(function (r) { return r.axis === ax; }).sort(function (a, b) { return a.v - b.v; }).forEach(function (r) {
        var P = refPoint(ents, parseRef(r.refs[0])), Q = refPoint(ents, parseRef(r.refs[1]));
        if (!P || !Q) return;
        var step = gap * (1 + (chainOn(ax) ? 0 : rows[ax]++)), level = far[ax] ? hi[1 - ax] + step : lo[1 - ax] - step;
        var dirS = Q[ax] - P[ax] < 0 ? -1 : 1;
        r.off = Math.round((ax === 0 ? dirS * (level - P[1]) : -dirS * (level - P[0])) * 1e4) / 1e4;
      });
    });
    sketch.rels = sketch.rels || [];
    var relIdx = [], dimIdx = [];
    newRels.forEach(function (r) { delete r.axis; sketch.rels.push(r); relIdx.push(sketch.rels.length - 1); });
    if (newDims.length) sketch.dims = sketch.dims || [];
    newDims.forEach(function (d) { sketch.dims.push(d); dimIdx.push(sketch.dims.length - 1); });
    if (!sketch.rels.length) delete sketch.rels;
    var res = solve(sketch), an = analyze(sketch);
    return { ok: res.ok, rels: relIdx, dims: dimIdx, status: an.status, dof: an.dof, analysis: an };
  }

  // ------------------------------------------------------------------ editing helpers
  var DRIVEN_MSG = 'This is a driven dimension: its value follows the geometry. Make it driving to change it.';
  // What a failed edit fights with: the sketch is solved in the least-squares sense with the new value, and the other
  // relations / dimensions left unsatisfied (largest first) are named, so the message can say "conflicts with Line1
  // length (50)" as SolidWorks' "over defining" list does. `skip` = { src, index } is the edited item.
  var DIM_WORDS = { len: 'length', dx: 'horizontal distance', dy: 'vertical distance', w: 'width', h: 'height', dia: 'diameter', r: 'radius', seg: 'segment length' };
  function dimName(sketch, d) {
    var e = sketch.entities[d.e], v = e && K ? K.dimValue(e, d) : null;
    return (e ? (ENTITY_NAMES[e.t] || 'Entity') : 'Entity') + (d.e + 1) + ' ' + (DIM_WORDS[d.k] || d.k) + (v != null ? ' (' + fmtL(v) + ')' : '');
  }
  function conflictNames(sketch, opts, skip, max) {
    try {
      var sys = buildSystem(sketch, opts), tol = 1e-6 * sys.scale, list = [], blkNamed = {};
      lm(sys, { leastSquares: true, maxIt: 60 });
      var r = residuals(sys);
      sys.cons.forEach(function (c) {
        if (c.blk != null && c.n && !blkNamed[c.blk]) {   // rfAU: a block instance the relation would bend
          var wb = 0;
          for (var kb = 0; kb < c.n; kb++) wb = Math.max(wb, Math.abs(r[c.row + kb]));
          if (wb > tol) { blkNamed[c.blk] = true; list.push({ w: wb, rank: 3, text: 'Block ' + c.blk + ' (a block is rigid)' }); }
          return;
        }
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
    var saved = clone(sketch.entities), opts = { dimTargets: {}, part: dim.e };
    // p9-sketch-curves / fidelity audit #1: the entity's other driving dimensions hold what they read before the edit
    // (a slot's Overall Length stays put when its width changes; a line's horizontal 3.000 stays 3.000 when its length
    // is typed — the kernel's one-entity guess below would scale the line along itself and silently change it)
    (sketch.dims || []).forEach(function (o, j) { if (j !== index && o.e === dim.e && !o.driven) { var ov = K.dimValue(e, o); if (ov != null) opts.dimTargets[j] = ov; } });
    K.setDimValue(e, dim, v);              // the kernel's one-entity move is the starting guess
    if (index >= 0) opts.dimTargets[index] = v;
    else opts.extra = [dimEquation(sketch.entities, dim, v)];
    var lk = index >= 0 ? linkTargets(sketch, dim.link, v, 'dim', index, opts) : null;   // lane CV: Link Values
    var r = solve(sketch, opts);
    if (!r.ok) { var names = conflictNames(sketch, opts, index >= 0 ? { src: 'dim', index: index } : null); sketch.entities = saved; return { ok: false, error: conflictMessage(names), conflicts: names }; }
    if (lk) lk.rels.forEach(function (j) { sketch.rels[j].v = v; });
    return { ok: true };
  }
  // lane CV: Link Values (SolidWorks' right-click a dimension ▸ Link Values). Dimensions (Smart Dimensions in
  // sketch.dims and distance / angle relations) that carry the same `link` name share one value: setting one sets
  // them all in the same solve (whole sketch, not only the edited part). Adds their targets to opts and returns
  // { dims, rels } (indices), or null when the item has no link.
  function linkTargets(sketch, link, v, src, index, opts) {
    if (link == null || link === '') return null;
    var out = { dims: [], rels: [] };
    (sketch.dims || []).forEach(function (o, j) {
      if ((src === 'dim' && j === index) || o.link !== link || o.driven) return;
      var oe = sketch.entities[o.e];
      if (!oe || !K.dimGeometry(oe, o)) return;
      K.setDimValue(oe, o, v);
      (opts.dimTargets = opts.dimTargets || {})[j] = v;
      out.dims.push(j);
    });
    (sketch.rels || []).forEach(function (o, j) {
      if ((src === 'rel' && j === index) || o.link !== link || o.driven || !TYPES[o.type] || !TYPES[o.type].dim) return;
      (opts.relTargets = opts.relTargets || {})[j] = v;
      out.rels.push(j);
    });
    if (out.dims.length || out.rels.length) { delete opts.part; delete opts.mob; delete opts.extra; }
    return out;
  }
  // the value a dimension item ({ kind: 'dim' | 'rel', index }) holds now, or null
  function itemValue(sketch, it) {
    if (it.kind === 'rel') { var r = (sketch.rels || [])[it.index]; return r && r.v != null ? +r.v : null; }
    var d = (sketch.dims || [])[it.index], e = d && sketch.entities[d.e];
    return e ? K.dimValue(e, d) : null;
  }
  function itemKind(sketch, it) {
    var d = it.kind === 'rel' ? (sketch.rels || [])[it.index] : (sketch.dims || [])[it.index];
    return !d ? null : it.kind === 'rel' && d.type === 'angle' ? 'angle' : 'len';
  }
  // linkValues(sketch, items, name, value?) -> { ok, value } | { ok: false, error }: items ([{ kind, index }]) take the
  // link `name` and all take one value: `value` when given (the name's value in another sketch), else the value of
  // an item already linked by that name in this sketch, else the first item's. All or nothing.
  function linkValues(sketch, items, name, value) {
    name = String(name == null ? '' : name).trim();
    if (!name) return { ok: false, error: 'Type a name for the shared value.' };
    items = (items || []).filter(function (it) { return it && itemKind(sketch, it); });
    if (!items.length) return { ok: false, error: 'Select the dimensions to link.' };
    var already = linkedItems(sketch, name), kinds = {};
    items.concat(already).forEach(function (it) { kinds[itemKind(sketch, it)] = true; });
    if (Object.keys(kinds).length > 1) return { ok: false, error: 'An angle cannot share a value with a length.' };
    if (items.some(function (it) { var d = it.kind === 'rel' ? sketch.rels[it.index] : sketch.dims[it.index]; return d.driven; })) return { ok: false, error: 'A driven dimension cannot be linked: make it driving first.' };
    var v = value != null ? +value : already.length ? itemValue(sketch, already[0]) : itemValue(sketch, items[0]);
    if (v == null || !isFinite(v)) return { ok: false, error: 'That dimension has no value to share.' };
    var saved = clone(sketch.entities), old = items.map(function (it) { var d = it.kind === 'rel' ? sketch.rels[it.index] : sketch.dims[it.index]; return { d: d, link: d.link, v: d.v }; });
    old.forEach(function (o) { o.d.link = name; });
    var first = items[0], r = first.kind === 'rel' ? setRelValue(sketch, first.index, v) : setDim(sketch, first.index, v);
    if (!r.ok) {
      sketch.entities = saved;
      old.forEach(function (o) { if (o.link == null) delete o.d.link; else o.d.link = o.link; if (o.v !== undefined) o.d.v = o.v; });
      return { ok: false, error: r.error, conflicts: r.conflicts };
    }
    return { ok: true, value: v };
  }
  // unlinkValue(sketch, item): the dimension keeps its value and leaves its link
  function unlinkValue(sketch, it) {
    var d = it && (it.kind === 'rel' ? (sketch.rels || [])[it.index] : (sketch.dims || [])[it.index]);
    if (!d || d.link == null) return { ok: false, error: 'That dimension is not linked.' };
    delete d.link;
    return { ok: true };
  }
  // linkedItems(sketch, link) -> [{ kind: 'dim' | 'rel', index, d }] the dimensions of the sketch with that link name
  function linkedItems(sketch, link) {
    var out = [];
    if (link == null || link === '') return out;
    (sketch.dims || []).forEach(function (d, i) { if (d.link === link) out.push({ kind: 'dim', index: i, d: d }); });
    (sketch.rels || []).forEach(function (d, i) { if (d.link === link && TYPES[d.type] && TYPES[d.type].dim) out.push({ kind: 'rel', index: i, d: d }); });
    return out;
  }
  // p9-sketchtab: drive entity i to satisfy n extra equations f(E) -> residuals (a value typed into Line Properties,
  // the Rectangle or Point PropertyManager), keeping every relation and dimension; the rest of the sketch moves as
  // little as possible. opts.guess(entities) moves the entity toward the value first (a starting guess); opts.ents lists
  // every entity f reads (default [i]). Returns
  // { ok } or { ok: false, error, conflicts } with the sketch unchanged when the value would over-define it.
  function driveEntity(sketch, i, n, f, opts) {
    opts = opts || {};
    var saved = clone(sketch.entities), mob = {}, extra = [{ n: n, ents: opts.ents || [i], f: f }];
    if (opts.guess) opts.guess(sketch.entities);
    (sketch.entities || []).forEach(function (e, j) { mob[j] = (opts.ents || [i]).indexOf(j) >= 0 ? 1 : 0.05; });
    var r = solve(sketch, { extra: extra, part: i, mob: mob });
    var res = r.ok ? f(sketch.entities) : null, off = false;
    if (res) for (var k = 0; k < res.length; k++) if (!(Math.abs(res[k]) <= 1e-6 * Math.max(1, Math.abs(res[k])))) off = true;
    if (!r.ok || off) {
      sketch.entities = saved;
      var names = conflictNames(sketch, { extra: extra });
      return { ok: false, error: 'That value would over-define the sketch: it conflicts with ' + (names.length ? names.join('; ') : 'the sketch\'s other relations or dimensions') + '.', conflicts: names };
    }
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
    var R = rel.refs.map(parseRef), pe = R.filter(function (q) { return q && !q.o; })[0];
    // sketch-anchor: as SolidWorks, the entity picked first (an ordinate set's zero) stays where it is and the one
    // picked second moves with what hangs on it; the minimum-norm solve alone would shift both (an ordinate edit in an
    // under-defined sketch moved the whole sketch). When the sketch cannot satisfy that (the two sides are joined
    // rigidly), the plain solve moves both.
    var lo = { relTargets: t }, lk = linkTargets(sketch, rel.link, v, 'rel', index, lo);   // lane CV: Link Values
    if (lk && (lk.dims.length || lk.rels.length)) {
      var rl = solve(sketch, lo), r = rl.ok ? rl : null;
      if (!r) { var nl = conflictNames(sketch, lo, { src: 'rel', index: index }); sketch.entities = saved; return { ok: false, error: conflictMessage(nl), conflicts: nl }; }
      rel.v = v;
      lk.rels.forEach(function (j) { sketch.rels[j].v = v; });
      return { ok: true };
    }
    if (rel.type === 'angle') handleTurn(sketch, rel, R, v);   // lane DE: a spline handle turns to the value first
    var an = anchorFirst(sketch, rel, R), r = an ? solve(sketch, { relTargets: t, part: pe ? pe.e : null, mob: an.mob, extra: an.extra }) : null;
    if (!r || !r.ok) r = solve(sketch, { relTargets: t, part: pe ? pe.e : null });
    if (!r.ok) { var names = conflictNames(sketch, { relTargets: t }, { src: 'rel', index: index }); sketch.entities = saved; return { ok: false, error: conflictMessage(names), conflicts: names }; }
    rel.v = v;
    return { ok: true };
  }
  // lane DE: an angle to a driving spline handle: the handle alone is turned until the angle reads v (secant steps on
  // its angle), so the solve that follows has nothing to move (SolidWorks: the dimension turns the handle)
  function handleTurn(sketch, rel, R, v) {
    var E = sketch.entities, h = R.filter(function (q) { return q && !q.o && q.s === 'h'; })[0], e = h && E[h.e];
    if (!e || e.t !== 'spline' || !e.tans || !e.tans[h.k] || e.tans[h.k][0] == null) return;
    var rv = clone(rel); rv.v = v;
    var q = relEquation(E, rv, sketch.rels), tg = e.tans[h.k], th0 = +tg[0];
    if (!q) return;
    function F(th) { tg[0] = th; return q.f(E)[0]; }
    var a = th0, b = th0 + 1, fa = F(a), fb = F(b);
    for (var it = 0; it < 30 && Math.abs(fb) > 1e-11; it++) {
      if (fb === fa) break;
      var c = b - fb * (b - a) / (fb - fa);
      a = b; fa = fb; b = c; fb = F(b);
    }
    if (!(Math.abs(fb) < 1e-9)) { tg[0] = th0; return; }
    while (b > 180) b -= 360;
    while (b <= -180) b += 360;
    tg[0] = b;
  }
  // sketch-anchor: solve options that hold the first ref of a two-ref dimension (its point, a line's two ends, a
  // circle's centre) and let the second ref's side move: mob 1 for the entities reachable from the second ref's entity
  // without passing through the first's, 0.05 for the rest. null when the dimension has no two sides to tell apart.
  function anchorFirst(sketch, rel, R) {
    if (!R || R.length !== 2 || !R[0] || !R[1] || R[0].o || R[1].o) return null;
    var E = sketch.entities, z = R[0].e, tg = R[1].e;
    if (!E[z] || !E[tg]) return null;
    var hold = [], kz = refKind(E, R[0]);
    if (kz === 'point') hold.push(R[0]);
    else if (kz === 'line') {
      // a line's two ends (a rectangle's or polygon's edge: its two corners; a slot: its two centres)
      var er = endRefs(E, R[0]);
      if (!er.length && R[0].s === null && E[z].t === 'slot') er = [z + '.p1', z + '.p2'];
      hold = er.map(parseRef);
    }
    else if (kz === 'circle') hold.push({ e: z, s: 'c', k: null });
    if (!hold.length) return null;
    var at = hold.map(function (h) { var p = refPoint(E, h) || refCenter(E, h); return p ? [p[0], p[1]] : null; });
    if (at.some(function (p) { return !p; })) return null;
    var extra = [{ n: 2 * hold.length, ents: [z], f: function (Ents) {
      var out = [];
      hold.forEach(function (h, i) { var p = refPoint(Ents, h) || refCenter(Ents, h) || at[i]; out.push(p[0] - at[i][0], p[1] - at[i][1]); });
      return out;
    } }];
    var mob = null;
    if (tg !== z) {
      var side = connected(buildSystem(sketch), tg, z).set;
      mob = {};
      E.forEach(function (e, j) { mob[j] = side[j] ? 1 : 0.05; });
    }
    return { extra: extra, mob: mob };
  }
  // The value a distance / angle relation reads on the current geometry (dir 'h' / 'v': the horizontal / vertical
  // distance between two points or centres).
  // sketchdims: ac (arc conditions, refs order: 'c' | 'min' | 'max') moves the ends of a distance to whole circles / arcs
  // to their near or far side; 'arclength' reads an arc's length.
  function measure(sketch, type, refs, dir, sup, ac) {
    var ents = sketch.entities, R = refs.map(parseRef), kinds = R.map(function (r) { return refKind(ents, r); });
    var p = match(type, kinds);
    if (!p) return null;
    if (type === 'arclength') { var ea = !R[0].o && R[0].s === null && ents[R[0].e]; return ea && ea.t === 'arc' ? ea.r * (ea.a1 - ea.a0) * D2R : null; }
    if (type === 'chamfer' || type === 'pathlength' || type === 'runangle') return rfaqMeasure(sketch, type, R, kinds, dir === 'cw');   // rfAQ (dir 'cw': a clockwise running angle)
    var base = measureBase(sketch, type, R, kinds, p, dir, sup);
    if (base == null || type !== 'distance' || dir === 'r' || !Array.isArray(ac)) return base;
    R.forEach(function (r, i) { if (kinds[i] === 'circle' && (ac[i] === 'min' || ac[i] === 'max')) base += (ac[i] === 'min' ? -1 : 1) * refCurve(ents, r).r; });
    return base;
  }
  function measureBase(sketch, type, R, kinds, p, dir, sup) {
    var ents = sketch.entities, A = R[p[0]], B = R[p[1]], kA = kinds[p[0]], kB = kinds[p[1]];
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
      if (t === 'symmetric' || t === 'intersection') return R.length === 3 && !!match(t, kinds);
      if (R.length > 2) return (t === 'horizontal' || t === 'vertical' || t === 'fix') && kinds.every(function (k) { return k === 'line' || t === 'fix'; })
        || ((t === 'parallel' || t === 'equal' || t === 'collinear' || t === 'coincident') && sameKind(kinds, t));
      if (R.length === 2 && kinds[0] === 'line' && kinds[1] === 'line' && (t === 'horizontal' || t === 'vertical')) return true;
      if (R.length === 2 && t === 'fix') return true;
      // sketch-fillet2: Tangent to a spline only where it shares an end with the line / arc
      if (t === 'tangent' && (kinds.indexOf('free') >= 0 || (kinds[0] === 'line' && kinds[1] === 'line'))) return !!match(t, kinds) && !!relEquation(sketch.entities, { type: 'tangent', refs: refs.map(String) }, sketch.rels);
      // rfCR: Equal Curve Length only between curves it can measure (not a slot's outline, not two refs of one entity)
      if (t === 'equalcurve') return R.length === 2 && R[0].e !== R[1].e && !!match(t, kinds) && !!relEquation(sketch.entities, { type: t, refs: refs.map(String) }, sketch.rels);
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
    if (type === 'merge') type = 'coincident';   // sketchdims: SolidWorks' Merge (two points) is a point-to-point Coincident
    refs = (Array.isArray(refs) ? refs : [refs]).map(String);
    if (!TYPES[type]) return { ok: false, error: 'Unknown relation ' + type };
    var groups;
    if ((type === 'horizontal' || type === 'vertical') && refs.length === 2) {
      var kinds = refs.map(function (r) { return refKind(sketch.entities, parseRef(r)); });
      groups = kinds[0] === 'point' && kinds[1] === 'point' ? [refs] : refs.map(function (r) { return [r]; });
    } else if (type === 'symmetric') groups = [symOrder(sketch, refs)];
    else if (type === 'intersection') { var mi = match('intersection', refs.map(function (r) { return refKind(sketch.entities, parseRef(r)); })); groups = [mi ? mi.map(function (i) { return refs[i]; }) : refs]; }
    else if (type === 'midpoint' && refs.length === 3 && match('midpoint', refs.map(function (r) { return refKind(sketch.entities, parseRef(r)); }))) groups = [refs];
    else groups = type === 'distance' || type === 'angle' || type === 'chamfer' || type === 'pathlength' || type === 'runangle' ? [refs] : expand(type, refs);   // rfAQ: one dimension on all its refs
    var added = [], saved = clone(sketch.entities), savedRels = clone(sketch.rels || []), before = analyze(sketch);
    sketch.rels = sketch.rels || [];
    for (var g = 0; g < groups.length; g++) {
      var rel = { type: type, refs: groups[g] };
      groups[g].forEach(function (r) { var hp = parseRef(r); if (hp && !hp.o && hp.s === 'h') handleDrive(sketch.entities[hp.e], hp.k); });   // lane DE
      if (TYPES[type].dim) {
        if (type === 'distance' && (opts.dir === 'h' || opts.dir === 'v') && groups[g].every(function (r) { return refKind(sketch.entities, parseRef(r)) !== 'line'; })) rel.dir = opts.dir;
        if (type === 'distance' && opts.dir === 'r' && (groups[g].every(function (r) { return refKind(sketch.entities, parseRef(r)) === 'circle'; }) || slotPair(sketch.entities, parseRef(groups[g][0]), parseRef(groups[g][1])))) rel.dir = 'r';
        // angle (r5/sketch5): sup = the supplementary angle, q = -1 drawn on the reversed rays, ta = label angle from
        // the middle of the arc (degrees)
        if (type === 'angle' && opts.sup) rel.sup = true;
        if (type === 'angle' && +opts.q === -1) rel.q = -1;
        if (type === 'angle' && opts.ta != null) rel.ta = +opts.ta;
        // sketchdims: arc conditions of a distance to whole circles / arcs ('c' centre, 'min', 'max'; refs order)
        if (type === 'distance' && Array.isArray(opts.ac) && opts.ac.some(function (c) { return c === 'min' || c === 'max'; })) rel.ac = opts.ac.map(function (c) { return c === 'min' || c === 'max' ? c : 'c'; });
        rel.v = opts.value != null && !opts.driven ? +opts.value : measure(sketch, type, groups[g], rel.dir, rel.sup, rel.ac);
        if (opts.off != null) rel.off = +opts.off;
        if (opts.tx != null && type === 'distance') rel.tx = +opts.tx;
        if (opts.driven) rel.driven = true;
      }
      if (type === 'fix' || type === 'onEdge') {
        var r0 = parseRef(groups[g][0]), e = sketch.entities[r0.e];
        if (r0 && !r0.o && r0.s === null && e && e.t !== 'point') rel.at = paramNames(e).map(function (nm) { return pget(e, nm); });
        else { var pt = refPoint(sketch.entities, r0) || refCenter(sketch.entities, r0); if (pt) rel.at = [pt[0], pt[1]]; }
      }
      if (!relEquation(sketch.entities, rel, sketch.rels)) { sketch.rels = savedRels; sketch.entities = saved; return { ok: false, error: TYPES[type].name + ' does not apply to that selection.' }; }
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
  // rfCR: SolidWorks' Replace Entity: entity j takes the place of entity i. Every relation and dimension on i moves to
  // j: a whole-entity ref (and a rectangle's / polygon's edge) becomes j, each end (or corner) the nearest end or
  // corner of j, a centre j's centre, a midpoint j's midpoint; a ref j cannot take (a centre of a line) drops that
  // relation, as does a relation that tied i to j (an end they shared). A placed dimension moves when j can carry its
  // kind, and keeps its value (the solve pulls j to it, as a driving dimension would). The old entity goes, or stays as
  // construction geometry (opts.construction). All or nothing: when the sketch cannot be solved afterwards it is left
  // exactly as it was. Returns { ok, index (j's index afterwards), moved (relations), dims, error }.
  function replaceEntity(sketch, i, j, opts) {
    opts = opts || {};
    var E = sketch.entities, a = E[i], b = E[j];
    if (!a || !b) return { ok: false, error: 'Select the entity to replace, then the entity that replaces it.' };
    if (i === j) return { ok: false, error: 'The replacement has to be another entity.' };
    if (a.t === 'point' || a.t === 'text' || b.t === 'point' || b.t === 'text') return { ok: false, error: 'Replace Entity works on lines, arcs, circles and curves, not on points or text.' };
    var saved = tSave(sketch), an0 = analyze(sketch);
    var ptsB = pointRefs(sketch, j), endsB = ptsB.filter(function (q) { return /\.(p\d|v\d+)$/.test(q.ref); });
    function mapRef(r) {
      var p = parseRef(r);
      if (!p || p.o || p.e !== i) return r;
      if (p.s === null) return String(j);
      if (p.s === 'e') return (b.t === 'line' || b.t === 'arc' || b.t === 'circle') ? String(j) : null;
      if (p.s === 'c' || p.s === 'mid') { var same = ptsB.filter(function (q) { return q.ref === j + '.' + p.s; })[0]; return same ? same.ref : null; }
      var at = refPoint(E, p), best = null, bd = Infinity;
      if (!at) return null;
      endsB.forEach(function (q) { var d = len(sub(q.pt, at)); if (d < bd) { bd = d; best = q.ref; } });
      return best;
    }
    var moved = 0;
    sketch.rels = (sketch.rels || []).map(function (rel) {
      if (!rel.refs.some(function (r) { var p = parseRef(r); return p && !p.o && p.e === i; })) return rel;
      var refs = rel.refs.map(mapRef);
      if (refs.some(function (r) { return r == null; })) return null;
      if (refs.some(function (r, k) { return refs.indexOf(r) !== k; })) return null;   // it tied i to j: nothing to hold now
      var copy = clone(rel);
      copy.refs = refs;
      moved++;
      return copy;
    }).filter(Boolean);
    if (!sketch.rels.length) delete sketch.rels;
    // placed dimensions: the kinds j can carry, at their old values
    var targets = [], dims = 0;
    sketch.dims = (sketch.dims || []).filter(function (d) {
      if (d.e !== i) return true;
      var v = K ? K.dimValue(a, d) : null;
      if (!K || !K.dimGeometry(b, d) || v == null) return false;
      d.e = j; dims++;
      if (!d.driven) targets.push({ d: d, v: v });
      return true;
    });
    if (!sketch.dims.length) delete sketch.dims;
    if (opts.construction) a.construction = true;
    else {
      removeEntity(sketch, i);
      E.splice(i, 1);
      (sketch.dims || []).forEach(function (d) { if (d.e > i) d.e--; });
      if (j > i) j--;
    }
    clean(sketch);
    var res = solve(sketch), ok = res.ok;
    for (var t = 0; ok && t < targets.length; t++) { var sr = setDim(sketch, sketch.dims.indexOf(targets[t].d), targets[t].v); ok = sr.ok; }
    var an = ok ? analyze(sketch) : null;
    // a moved dimension or relation the new entity cannot take (it fights, or repeats, what already holds it) refuses
    // the whole replacement, as an over-defining dimension is refused elsewhere
    if (!ok || an.conflicts > an0.conflicts || an.redundant > an0.redundant) { tRestore(sketch, saved); return { ok: false, error: 'The replacement conflicts with the relations or dimensions moved onto it (it would over-define the sketch): nothing was replaced.' }; }
    return { ok: true, index: j, moved: moved, dims: dims, analysis: an };
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
  // p9-sketchfix: a line (or an arc) cut in two keeps its degrees of freedom. The two pieces stay on one carrier
  // (Collinear; an arc's pieces Concentric + Equal), each relation of the whole line goes to one piece only (the piece
  // the other entity of the relation joins, else the longer one) instead of to both (that over-defined the sketch), a
  // length dimension becomes the distance between the two outer ends (same value, same side), and a Midpoint on the
  // line becomes a Midpoint between those two ends. Relations of a surviving point (an end, an arc's centre) are kept
  // whatever their type (a circle's centre held at a line's midpoint kept it). A relation the trim moved or made that
  // still over-defines the sketch afterwards is dropped.
  var KEEP_ON_PIECE = { horizontal: 1, vertical: 1, parallel: 1, perpendicular: 1, collinear: 1, tangent: 1, concentric: 1, coincident: 1, angle: 1, distance: 1 };
  var KEEP_ON_ARC = { equal: 1, symmetric: 1 };   // a circle / arc piece keeps its radius and centre: these hold on it too
  // does point pt lie within the extent of line / arc e (between its ends, inside its sweep)?
  function onPieceExtent(pt, e) {
    var tol = 1e-6 * Math.max(1, Math.abs(pt[0]), Math.abs(pt[1]));
    if (e.t === 'line') { var a = [e.x1, e.y1], d = sub([e.x2, e.y2], a), L = len(d), sd = infSides(e); if (L < 1e-12) return false; var t = dot(sub(pt, a), d) / L; return (t > -tol || !!(sd && sd.p1)) && (t < L + tol || !!(sd && sd.p2)); }
    if (e.t !== 'arc') return true;
    var r = ((Math.atan2(pt[1] - e.cy, pt[0] - e.cx) / D2R - e.a0) % 360 + 360) % 360;
    return r * D2R * e.r < (e.a1 - e.a0) * D2R * e.r + tol || (360 - r) * D2R * e.r < tol;
  }
  // (r13/trim13) ctx, optional: { conflicts, redundant } of the sketch before (a Power trim drag knows them from the trim
  // before), and on return { conflicts, redundant, analysis } of the result, so a run of trims analyses each state once.
  // junctions (rfCH, optional): the end refs of other entities that lay on the trimmed entity within floating-point
  // noise (endsOn, read before the cut): each is tied to the piece it lies on by a Coincident when nothing ties it yet.
  function afterTrim(sketch, before, idx, ctx, junctions) {
    var E = sketch.entities, old = before[idx];
    var map = before.map(function (e) { return E.indexOf(e); });
    var pieces = [];
    E.forEach(function (e, i) { if (before.indexOf(e) < 0) pieces.push(i); });
    var simple = !!old && (old.t === 'line' || old.t === 'arc' || old.t === 'circle') && pieces.every(function (i) { return E[i].t === 'line' || E[i].t === 'arc'; });
    var split = simple && pieces.length === 2 && (old.t === 'line' || old.t === 'arc') && E[pieces[0]].t === old.t && E[pieces[1]].t === old.t;
    var savedRels = sketch.rels ? clone(sketch.rels) : null, savedDims = sketch.dims ? clone(sketch.dims) : null;
    var an0 = !simple ? null : ctx && ctx.conflicts != null && ctx.redundant != null ? { conflicts: ctx.conflicts, redundant: ctx.redundant } : analyze({ entities: before, rels: sketch.rels, dims: sketch.dims });
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
    // split: the outer ends (the old ends, on the first and the last piece) and the piece each relation goes to
    var outer = split ? [pointOnPiece({ s: 'p', k: 1 }), pointOnPiece({ s: 'p', k: 2 })] : null;
    if (split && !(outer[0] && outer[1])) split = false;
    function pieceLen(pi) { var e = E[pi]; return e.t === 'line' ? len([e.x2 - e.x1, e.y2 - e.y1]) : (e.a1 - e.a0) * D2R * e.r; }
    var longest = pieces.length ? pieces.reduce(function (a, b) { return pieceLen(b) > pieceLen(a) * (1 + 1e-9) ? b : a; }) : -1;
    function pieceFor(rel) {
      var tol = 1e-3;   // the pieces were rounded to 1e-4 (tRound)
      for (var r = 0; r < rel.refs.length; r++) {
        var p = parseRef(rel.refs[r]);
        if (!p || p.o || p.e === idx || !(map[p.e] >= 0)) continue;
        var pts = pointRefs(sketch, map[p.e]);
        for (var j = 0; j < pieces.length; j++) {
          for (var k = 1; k <= 2; k++) {
            var q = refPoint(E, { e: pieces[j], s: 'p', k: k });
            if (pts.some(function (pr) { return !/\.(mid|c)$/.test(pr.ref) && len(sub(pr.pt, q)) < tol; })) return pieces[j];
          }
        }
      }
      return longest;
    }
    var rels = [], moved = [];   // moved: relations this trim moved onto a piece or made (dropped first if they over-define)
    (sketch.rels || []).forEach(function (rel) {
      var touches = false, ok = true, whole = false;
      var refs = rel.refs.map(function (r) {
        var p = parseRef(r);
        if (!p || p.o) return [r];
        if (p.e !== idx) { if (map[p.e] < 0) ok = false; return [String(map[p.e]) + String(r).slice(String(p.e).length)]; }
        touches = true;
        if (p.s === null) { whole = true; return pieces.map(String); }          // the whole curve: each piece
        var q = simple ? pointOnPiece(p) : null;
        if (!q) ok = false;
        return [q];
      });
      if (!ok) return;
      if (!touches) { rel.refs = refs.map(function (x) { return x[0]; }); rels.push(rel); return; }
      if (!simple) return;
      // only surviving points of the trimmed entity (an end, the centre): the relation holds as it did
      if (!whole) { var keepPt = clone(rel); keepPt.refs = refs.map(function (x) { return x[0]; }); rels.push(keepPt); return; }
      // a point at the middle of a line cut in two: the middle of its outer ends
      if (split && old.t === 'line' && rel.type === 'midpoint' && rel.refs.length === 2) {
        var pr = refs.filter(function (x) { return x.length === 1; })[0];
        if (pr) { var mp = { type: 'midpoint', refs: [pr[0], outer[0], outer[1]] }; rels.push(mp); moved.push(mp); }
        return;
      }
      if (!KEEP_ON_PIECE[rel.type] && !(old.t !== 'line' && KEEP_ON_ARC[rel.type])) return;
      if (split && rel.type !== 'coincident') {
        var pi = pieceFor(rel), one = clone(rel);
        one.refs = refs.map(function (x) { return x.length > 1 ? String(pi) : x[0]; });
        rels.push(one); moved.push(one);
        return;
      }
      var n = Math.max.apply(null, refs.map(function (x) { return x.length; }));
      for (var k = 0; k < n; k++) {
        var copy = clone(rel);
        copy.refs = refs.map(function (x) { return x.length > 1 ? x[k] : x[0]; });
        if (!copy.refs.every(function (x) { return x != null; })) continue;
        // r13/trim13: a point that lay on the trimmed curve lies on (the extent of) one piece at most: its Coincident goes
        // to that piece only (a point left in the removed gap loses it), so no piece gets a redundant one
        if (rel.type === 'coincident') {
          var cr = copy.refs.filter(function (x) { return pieces.indexOf(+x) >= 0 && String(+x) === x; })[0];
          var other = cr != null ? copy.refs.filter(function (x) { return x !== cr; })[0] : null, op = other != null ? parseRef(other) : null;
          var opt = op && refKind(E, op) === 'point' ? refPoint(E, op) : null;
          if (opt && !onPieceExtent(opt, E[+cr])) continue;
        }
        rels.push(copy); moved.push(copy);
      }
    });
    if (split) {
      // the two pieces stay on the old line (Collinear) or the old circle (Concentric + Equal)
      var A = String(pieces[0]), B = String(pieces[1]);
      if (old.t === 'line') rels.push({ type: 'collinear', refs: [A, B] });
      else rels.push({ type: 'concentric', refs: [A, B] }, { type: 'equal', refs: [A, B] });
    }
    if (simple) {
      // the new ends: Coincident with whatever they were cut at (an end point there, or the cutting curve)
      pieces.forEach(function (pi) {
        [1, 2].forEach(function (k) {
          var pt = refPoint(E, { e: pi, s: 'p', k: k }), sdk = infSides(E[pi]);
          if (!pt || near(pt, oldPt(1)) || near(pt, oldPt(2)) || (sdk && sdk['p' + k])) return;   // (sketch-refine: a ray's far point is no end)
          var hit = null;
          for (var j = 0; j < E.length && !hit; j++) {
            if (pieces.indexOf(j) >= 0) continue;
            pointRefs(sketch, j).forEach(function (q) { if (!hit && !/\.(mid|c)$/.test(q.ref) && len(sub(q.pt, pt)) < 1e-3) hit = q.ref; });
          }
          var on = hit || onCurveRef(sketch, -1, pt, 1e-3, pieces);
          if (!on) return;
          // the other entity's end was already Coincident with (lying on) the trimmed curve: the end-to-end one replaces it
          if (hit) rels = rels.filter(function (r) { return !(r.type === 'coincident' && r.refs.indexOf(hit) >= 0 && r.refs.indexOf(String(pi)) >= 0); });
          var ce = { type: 'coincident', refs: [pi + '.p' + k, on] };
          rels.push(ce); moved.push(ce);
        });
      });
      // rfCH: a true T-junction on the trimmed entity (another entity's end on it within noise) is tied to the piece it
      // lies on now, when nothing ties it yet: the pieces were rounded to 1e-4, and only a junction a Coincident holds
      // is closed again by the solve below (an untied one on a slanted line would be left off it by up to 1.4e-4 and
      // the next trim there would no longer find it, deleting the whole piece)
      (junctions || []).forEach(function (ref) {
        var p = parseRef(ref);
        if (!p || p.o || !(map[p.e] >= 0)) return;
        var nr = String(map[p.e]) + String(ref).slice(String(p.e).length), pt = refPoint(E, parseRef(nr));
        if (!pt) return;
        var pi = pieces.filter(function (i) { return onPieceExtent(pt, E[i]); })[0];
        if (pi == null) return;
        var tied = rels.some(function (r) { return r.type === 'coincident' && r.refs.indexOf(nr) >= 0 && r.refs.some(function (x) { return x === String(pi) || x === pi + '.p1' || x === pi + '.p2'; }); });
        if (tied) return;
        var jr = { type: 'coincident', refs: [nr, String(pi)] };
        rels.push(jr); moved.push(jr);
      });
    }
    sketch.rels = rels;
    if (!rels.length) delete sketch.rels;
    // placed dimensions follow their entity; a radius / diameter of the trimmed circle or arc goes to its first arc; the
    // length of a line cut in two becomes the distance between its outer ends
    var firstArc = pieces.filter(function (i) { return E[i].t === 'arc'; })[0];
    function moveDims() {
      if (!sketch.dims) return;
      sketch.dims = sketch.dims.filter(function (d) {
        if (d.e !== idx) { if (!(map[d.e] >= 0)) return false; d.e = map[d.e]; return true; }
        if (simple && (d.k === 'r' || d.k === 'dia') && firstArc != null) { d.e = firstArc; d.k = 'r'; return true; }
        if (simple && split && old.t === 'line' && (d.k === 'len' || d.k === 'dx' || d.k === 'dy') && K) {
          var v = K.dimValue(old, d);
          if (v == null) return false;
          // it ran p1 -> p2 along the line: from the first piece's start to the last piece's end keeps its side
          var dr = { type: 'distance', refs: [outer[0], outer[1]], v: v };
          if (d.k === 'dx') dr.dir = 'h'; else if (d.k === 'dy') dr.dir = 'v';
          if (d.off != null) dr.off = d.off;
          if (d.tx != null) dr.tx = d.tx;
          if (d.driven) dr.driven = true;
          (sketch.rels = sketch.rels || []).push(dr); moved.push(dr);
        }
        return false;
      });
      if (!sketch.dims.length) delete sketch.dims;
    }
    moveDims();
    clean(sketch);
    dedupe(sketch, true);
    if (sketch.rels && !sketch.rels.length) delete sketch.rels;
    if (simple) solve(sketch);   // the cut point was rounded: close the new Coincidents exactly
    var an1 = simple ? analyze(sketch) : null;
    // whatever the trim moved or made that still repeats what the rest says goes, last first (dropping a repeat frees
    // nothing: the degrees of freedom stay)
    if (simple && an0 && an0.redundant != null && an1.redundant > an0.redundant) {
      for (var m = moved.length - 1; m >= 0 && an1.redundant > an0.redundant; m--) {
        var at = sketch.rels ? sketch.rels.indexOf(moved[m]) : -1;
        if (at < 0) continue;
        sketch.rels.splice(at, 1);
        var anT = analyze(sketch);
        if (anT.redundant < an1.redundant && anT.dof === an1.dof && anT.conflicts <= an1.conflicts) an1 = anT;
        else sketch.rels.splice(at, 0, moved[m]);
      }
      if (sketch.rels && !sketch.rels.length) delete sketch.rels;
    }
    if (ctx) { ctx.conflicts = an1 ? an1.conflicts : null; ctx.redundant = an1 ? an1.redundant : null; ctx.analysis = an1; }
    if (simple && an1.conflicts > an0.conflicts) {
      if (ctx) { ctx.conflicts = null; ctx.redundant = null; ctx.analysis = null; }
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
  // rfH: the Polygon relation (refs [circle, side 0 … side n-1]): corner k is where side k-1 meets side k (the lines
  // extended, so a filleted or chamfered corner still counts as its virtual sharp); corner 0 lies at the circle's radius
  // from its centre (inscribed: radius / cos(180° / n)), and corner k is corner 0 turned k × 360° / n about the centre,
  // the way the sides run (taken from the geometry the equation is built on). 2n - 1 equations: with the sides' end
  // Coincidents the polygon keeps 4 degrees of freedom (centre, size, rotation).
  function polygonEquation(ents, rel, R) {
    var n = R.length - 1;
    if (n < 3 || R.some(function (r) { return r.o || r.s !== null || !ents[r.e]; })) return null;
    if (ents[R[0].e].t !== 'circle' || R.slice(1).some(function (r) { return ents[r.e].t !== 'line'; })) return null;
    var ins = !!rel.ins, kR = ins ? 1 / Math.cos(Math.PI / n) : 1;
    function corner(E, k) {
      var a = refCurve(E, R[1 + (k + n - 1) % n]), b = refCurve(E, R[1 + k]);
      var d1 = sub(a.b, a.a), d2 = sub(b.b, b.a), den = crs(d1, d2);
      if (Math.abs(den) < 1e-300) return b.a;
      var t = crs(sub(b.a, a.a), d2) / den;
      return [a.a[0] + d1[0] * t, a.a[1] + d1[1] * t];
    }
    var c0 = refCurve(ents, R[0]).c, s0 = sgn(crs(sub(corner(ents, 0), c0), sub(corner(ents, 1), c0)));
    var f = function (E) {
      var cc = refCurve(E, R[0]), c = cc.c, v0 = sub(corner(E, 0), c), out = [len(v0) - cc.r * kR];
      for (var k = 1; k < n; k++) {
        var a = s0 * 2 * Math.PI * k / n, co = Math.cos(a), si = Math.sin(a), q = corner(E, k);
        out.push(q[0] - (c[0] + v0[0] * co - v0[1] * si), q[1] - (c[1] + v0[0] * si + v0[1] * co));
      }
      return out;
    };
    var used = [];
    R.forEach(function (r) { if (used.indexOf(r.e) < 0) used.push(r.e); });
    return { n: 2 * n - 1, f: f, ents: used };
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
      if (e.layer != null) l.layer = e.layer;   // sketch-layers: the four lines stay on the rectangle's layer
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
  // sketch-fillet2: a block of entities in place of entity idx (explodePoly / explodeSlot): later entities shift, refs to
  // the old entity go through mapRef (null: the relation goes), its dimensions through mapDim (null: it goes; a
  // relation: it becomes that relation), then the block's own relations are added. Returns idx.
  function explodeInto(sketch, idx, block, mapRef, mapDim, own) {
    var E = sketch.entities, e = E[idx], shift = block.length - 1;
    block.forEach(function (b) { if (e.construction) b.construction = true; if (e.layer != null) b.layer = e.layer; });
    sketch.entities = E.slice(0, idx).concat(block, E.slice(idx + 1));
    function ref(r) {
      var p = parseRef(r);
      if (!p || p.o) return r;
      if (p.e > idx) return String(p.e + shift) + String(r).slice(String(p.e).length);
      if (p.e < idx) return r;
      return mapRef(p);
    }
    var rels = [];
    (sketch.rels || []).forEach(function (rel) {
      var refs = rel.refs.map(ref);
      if (refs.some(function (r) { return r == null; })) return;
      rel.refs = refs;
      rels.push(rel);
    });
    if (sketch.dims) {
      sketch.dims = sketch.dims.filter(function (d) {
        if (d.e > idx) { d.e += shift; return true; }
        if (d.e < idx) return true;
        var m = mapDim(d);
        if (m && m.type) { rels.push(m); return false; }
        if (m) { Object.keys(m).forEach(function (k) { d[k] = m[k]; }); return true; }
        return false;
      });
      if (!sketch.dims.length) delete sketch.dims;
    }
    sketch.rels = rels.concat(own);
    clean(sketch);
    return idx;
  }
  // sketch-fillet2: a Polygon becomes its n lines and its construction circle, as SolidWorks draws a polygon (Sketch
  // Fillet rounds one of its corners; rfH: the Polygon tool draws it so): line k from corner k to corner k+1, the
  // corners Coincident, the whole held regular by one Polygon relation (refs [the circle, the sides]). The circle runs
  // through the corners (Circumscribed) or touches the sides (Inscribed, e.ins: its radius is the distance to the
  // flats). Refs follow: corner vk -> line k's start, edge ek -> line k, the centre -> the circle's; the radius
  // dimension becomes the circle's diameter. Later entities shift by n. Returns idx, or -1.
  function explodePoly(sketch, idx) {
    var e = sketch.entities[idx];
    if (!e || e.t !== 'poly') return -1;
    var c = corners(e), n = c.length, block = [], own = [], ci = idx + n;
    if (n < 3) return -1;
    for (var k = 0; k < n; k++) block.push({ t: 'line', x1: c[k][0], y1: c[k][1], x2: c[(k + 1) % n][0], y2: c[(k + 1) % n][1] });
    block.push({ t: 'circle', cx: e.cx, cy: e.cy, r: e.ins ? e.r * Math.cos(Math.PI / n) : e.r, construction: true });
    var pg = { type: 'polygon', refs: [String(ci)] };
    if (e.ins) pg.ins = true;
    for (k = 0; k < n; k++) {
      own.push({ type: 'coincident', refs: [(idx + k) + '.p2', (idx + (k + 1) % n) + '.p1'] });
      pg.refs.push(String(idx + k));
    }
    own.push(pg);
    explodeInto(sketch, idx, block, function (p) {
      if (p.s === 'c') return ci + '.c';
      if (p.s === 'v' && p.k != null && p.k < n) return (idx + p.k) + '.p1';
      if (p.s === 'e' && p.k != null && p.k < n) return String(idx + p.k);
      return null;
    }, function (d) {
      if (d.k !== 'r') return null;
      // the circle's diameter: through the corners, or (inscribed) touching the flats
      return { e: ci, k: 'dia' };   // (its placement, ang / off, and driven state stay)
    }, own);
    sketch.entities[ci].construction = true;
    return idx;
  }
  // sketch-fillet2: a Straight Slot becomes its two sides, its two end arcs and its construction centerline (as
  // SolidWorks draws a slot): side 1 (left of p1 -> p2), the arc at p2, side 2, the arc at p1, the centerline from p1
  // to p2; ends Coincident and Tangent, the arcs centred on the centerline's ends and Equal. Refs follow: p1 / p2 -> the
  // centerline's ends, the centre -> its midpoint, the whole slot -> the centerline; the length dimension -> the
  // centerline's length, the width -> the distance between the sides, the overall length -> the distance between the
  // arcs' far sides. Later entities shift by 4. Returns idx, or -1.
  function explodeSlot(sketch, idx) {
    var e = sketch.entities[idx];
    if (e && e.t === 'aslot') return explodeArcSlot(sketch, idx);   // rfY
    if (!e || e.t !== 'slot') return -1;
    var A = [e.x1, e.y1], B = [e.x2, e.y2], u = unit(sub(B, A)), nn = [-u[1], u[0]], h = e.w / 2, an = Math.atan2(nn[1], nn[0]) / D2R;
    if (!(len(sub(B, A)) > 1e-12)) return -1;
    function at(p, s) { return [p[0] + nn[0] * h * s, p[1] + nn[1] * h * s]; }
    var a1 = at(A, 1), b1 = at(B, 1), b2 = at(B, -1), a2 = at(A, -1);
    var block = [
      { t: 'line', x1: a1[0], y1: a1[1], x2: b1[0], y2: b1[1] },
      normArc({ t: 'arc', cx: B[0], cy: B[1], r: h, a0: an + 180, a1: an + 360 }),
      { t: 'line', x1: b2[0], y1: b2[1], x2: a2[0], y2: a2[1] },
      normArc({ t: 'arc', cx: A[0], cy: A[1], r: h, a0: an, a1: an + 180 }),
      { t: 'line', x1: A[0], y1: A[1], x2: B[0], y2: B[1], construction: true }
    ];
    var L1 = String(idx), A2 = String(idx + 1), L2 = String(idx + 2), A1 = String(idx + 3), CL = String(idx + 4);
    var own = [
      { type: 'coincident', refs: [L1 + '.p2', A2 + '.p2'] }, { type: 'coincident', refs: [A2 + '.p1', L2 + '.p1'] },
      { type: 'coincident', refs: [L2 + '.p2', A1 + '.p2'] }, { type: 'coincident', refs: [A1 + '.p1', L1 + '.p1'] },
      { type: 'tangent', refs: [L1, A2] }, { type: 'tangent', refs: [L2, A2] }, { type: 'tangent', refs: [L2, A1] }, { type: 'tangent', refs: [L1, A1] },
      { type: 'coincident', refs: [A1 + '.c', CL + '.p1'] }, { type: 'coincident', refs: [A2 + '.c', CL + '.p2'] },
      { type: 'equal', refs: [A1, A2] }
    ];
    explodeInto(sketch, idx, block, function (p) {
      if (p.s === 'p' && (p.k === 1 || p.k === 2)) return CL + '.p' + p.k;
      if (p.s === 'c' || p.s === 'mid') return CL + '.mid';
      if (p.s === null) return CL;
      return null;
    }, function (d) {
      if (d.k === 'len') return { e: idx + 4, k: 'len' };
      var rel = d.k === 'w' ? { type: 'distance', refs: [L1, L2], v: e.w } : d.k === 'olen' ? { type: 'distance', refs: [A1, A2], ac: ['max', 'max'], v: len(sub(B, A)) + e.w } : null;
      if (rel && d.driven) rel.driven = true;
      if (rel && d.off != null) rel.off = d.off;
      return dimPropsTo(d, rel);
    }, own);
    sketch.entities[idx + 4].construction = true;
    return idx;
  }
  // rfAF: a slot dimension that becomes a distance relation (explodeSlot / explodeArcSlot) keeps what the Dimension
  // PropertyManager set on it: tolerance, precision, the text before / after the value and its name
  function dimPropsTo(d, rel) {
    if (rel) ['tol', 'prec', 'prefix', 'suffix', 'name'].forEach(function (k) { if (d[k] != null && d[k] !== '') rel[k] = JSON.parse(JSON.stringify(d[k])); });
    return rel;
  }
  // rfY: an Arc Slot becomes what SolidWorks draws: the outer arc, the end arc at the slot's end (a1), the inner arc, the
  // end arc at its start (a0) and the construction centre-line arc. The outer and inner arcs are centred on the
  // construction arc's centre (its centre point is the slot's), the end arcs on its ends; the four joins are Coincident
  // and Tangent. The fourth join is `implied` (SketchSolver.analyze: a consistent repeat is not over-defining): with the
  // other three joins its radial part repeats what they say (outer - r = r - inner = the end arcs' radius), as
  // SolidWorks' own solver accepts it. Refs follow: c -> the construction arc's centre, p1 / p2 -> its ends, the whole
  // slot -> the construction arc; the radius dimension -> the construction arc's, the width -> the radial distance
  // between the inner and the outer arc. Later entities shift by 4. Returns idx, or -1.
  function explodeArcSlot(sketch, idx) {
    var e = sketch.entities[idx];
    if (!e || e.t !== 'aslot') return -1;
    var h = e.w / 2, r = e.r, a0 = e.a0, a1 = e.a1;
    if (!(h > 1e-12) || !(r - h > 1e-12) || !(a1 - a0 > 1e-9)) return -1;
    function tidy(x) { return Math.abs(x) < 1e-12 * Math.max(1, r) ? 0 : +x.toPrecision(14); }   // (cos 90° is 6e-17, not 0)
    function at(a, rr) { return [tidy(e.cx + rr * Math.cos(a * D2R)), tidy(e.cy + rr * Math.sin(a * D2R))]; }
    var P1 = at(a0, r), P2 = at(a1, r);
    var block = [
      normArc({ t: 'arc', cx: e.cx, cy: e.cy, r: r + h, a0: a0, a1: a1 }),
      normArc({ t: 'arc', cx: P2[0], cy: P2[1], r: h, a0: a1, a1: a1 + 180 }),
      normArc({ t: 'arc', cx: e.cx, cy: e.cy, r: r - h, a0: a0, a1: a1 }),
      normArc({ t: 'arc', cx: P1[0], cy: P1[1], r: h, a0: a0 + 180, a1: a0 + 360 }),
      normArc({ t: 'arc', cx: e.cx, cy: e.cy, r: r, a0: a0, a1: a1, construction: true })
    ];
    var O = String(idx), C2 = String(idx + 1), I = String(idx + 2), C1 = String(idx + 3), CA = String(idx + 4);
    var own = [
      { type: 'coincident', refs: [O + '.c', CA + '.c'] }, { type: 'coincident', refs: [I + '.c', CA + '.c'] },
      { type: 'coincident', refs: [C1 + '.c', CA + '.p1'] }, { type: 'coincident', refs: [C2 + '.c', CA + '.p2'] },
      { type: 'coincident', refs: [O + '.p2', C2 + '.p1'] }, { type: 'coincident', refs: [C2 + '.p2', I + '.p2'] },
      { type: 'coincident', refs: [I + '.p1', C1 + '.p1'] },
      { type: 'tangent', refs: [O, C2] }, { type: 'tangent', refs: [I, C2] }, { type: 'tangent', refs: [I, C1] }, { type: 'tangent', refs: [O, C1] },
      { type: 'coincident', refs: [C1 + '.p2', O + '.p1'], implied: true }
    ];
    explodeInto(sketch, idx, block, function (p) {
      if (p.s === 'p' && (p.k === 1 || p.k === 2)) return CA + '.p' + p.k;
      if (p.s === 'c') return CA + '.c';
      if (p.s === null) return CA;
      return null;
    }, function (d) {
      if (d.k === 'r') return { e: idx + 4, k: 'r' };
      if (d.k !== 'w') return null;
      var rel = { type: 'distance', refs: [I, O], dir: 'r', v: e.w };
      if (d.driven) rel.driven = true;
      if (d.off != null) rel.off = d.off;
      return dimPropsTo(d, rel);
    }, own);
    sketch.entities[idx + 4].construction = true;
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
  // Drop relations whose refs no longer name anything of the right kind (an entity changed type, went away), and
  // relations that repeat another one exactly (dedupe).
  function clean(sketch) {
    if (!sketch.rels) return 0;
    var n = sketch.rels.length;
    sketch.rels = sketch.rels.filter(function (rel) { return !!relEquation(sketch.entities, rel, sketch.rels); });   // (with the relations: a Tangent to a spline needs the Coincident that joins them)
    dedupe(sketch);
    var dropped = n - (sketch.rels ? sketch.rels.length : 0);
    if (sketch.rels && !sketch.rels.length) delete sketch.rels;
    return dropped;
  }
  // p9-sketchfix: the identity of a relation, for spotting exact repeats: the type and its refs in either order (a
  // Symmetric's two mirrored items in either order, its axis last; a three-point Midpoint's two ends in either order).
  // A dimension also keys on its direction / supplement; with dims false, dimensions never count as repeats (a driven
  // reference dimension may well repeat a driving one, and a repeated driving one is the user's to settle).
  function relKey(rel, dims) {
    var t = TYPES[rel.type];
    if (!t || !rel.refs) return null;
    if (t.dim && !dims) return null;
    var refs = rel.refs.map(String);
    if (refs.length === 2 && refs[0] === refs[1]) return 'self';
    if (rel.type === 'symmetric' && refs.length === 3) refs = refs.slice(0, 2).sort().concat([refs[2]]);
    else if (rel.type === 'midpoint' && refs.length === 3) refs = [refs[0]].concat(refs.slice(1).sort());
    else refs = refs.slice().sort();
    return rel.type + '|' + refs.join(',') + (t.dim ? '|' + (rel.dir || '') + '|' + (rel.sup ? 1 : 0) + '|' + (rel.driven ? 'd' : '') : '');
  }
  // Remove relations that repeat an earlier one exactly (same type, same refs in either order), and a relation of a
  // point with itself; with dims, repeated dimensions too (same refs, direction and driven state). Returns how many went.
  function dedupe(sketch, dims) {
    if (!sketch.rels) return 0;
    var seen = {}, n = sketch.rels.length;
    sketch.rels = sketch.rels.filter(function (rel) {
      var k = relKey(rel, dims);
      if (k == null) return true;
      if (k === 'self' || seen[k]) return false;
      seen[k] = true;
      return true;
    });
    return n - sketch.rels.length;
  }

  // ------------------------------------------------------------------ inference (automatic relations while sketching)
  // Every point ref of entity i with its position.
  function pointRefs(sketch, i) {
    var e = sketch.entities[i], out = [];
    if (!e) return out;
    function add(s) { var r = String(i) + (s ? '.' + s : ''), p = refPoint(sketch.entities, parseRef(r)); if (p) out.push({ ref: r, pt: p }); }
    switch (e.t) {
      case 'point': add(''); break;
      case 'text': if (textFree(e)) add(''); break;   // sketch-text-ref: the insertion point
      case 'line': {
        // sketch-refine: an infinite line has no end points, a ray only the one it starts from
        var inf = infSides(e);
        if (!inf || !inf.p1) add('p1');
        if (!inf || !inf.p2) add('p2');
        if (!inf) add('mid');
        break;
      }
      case 'slot': add('p1'); add('p2'); add('c'); break;
      case 'arc': case 'aslot': add('c'); add('p1'); add('p2'); break;
      case 'circle': add('c'); break;
      // ui-sketch-spline: a spline's ends and its inner points (all points of a closed one); an ellipse's centre and axis
      // ends, a partial ellipse's ends too
      case 'spline': {
        var sn = e.pts.length;
        if (!e.closed) add('p1');
        for (var sk = e.closed ? 0 : 1; sk < (e.closed ? sn : sn - 1); sk++) add('v' + sk);
        if (!e.closed) add('p2');
        break;
      }
      case 'ellipse': case 'pellipse': add('c'); if (e.t === 'pellipse') { add('p1'); add('p2'); } for (var ek = 0; ek < 4; ek++) add('v' + ek); break;
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
    var c = e.t === 'spline' ? null : corners(e);
    if (c) for (var k = 0; k < (closedCorners(e) ? c.length : c.length - 1); k++) out.push(i + '.e' + k);
    return out;
  }
  function isCenterRef(sketch, ref) { var p = parseRef(ref), e = p && !p.o && sketch.entities[p.e]; return !!(e && p.s === 'c' && (e.t === 'circle' || e.t === 'arc' || e.t === 'aslot')); }
  // Relations SolidWorks would infer for entity i as drawn: coincident / concentric / midpoint where one of its points
  // lands exactly on an existing point (or the origin), horizontal / vertical for an axis-aligned line.
  // opts.skip: a RegExp of the entity's point refs that were not placed by a click (rfA: the centre a Tangent / 3 Point
  // Arc or a Perimeter Circle is computed to) and so infer nothing, as SolidWorks infers only where points are placed
  // opts.placed (lane C, fidelity #8): the points [[x, y], …] the tool actually placed (clicked or snapped). Only the
  // entity's points lying on one of them infer Coincident / Concentric / Midpoint and the Tangent / Perpendicular of a
  // shared end; a corner the tool computed (a Corner Rectangle's other two corners) infers nothing, even where it lands
  // on a line. Without it every point of the entity infers (scripts, paste, the engine tests).
  // opts.symmetric (lane C, fidelity #7): also Symmetric about a centerline. SolidWorks never infers Symmetric while
  // sketching (Mirror Entities, Dynamic Mirror and Add Relations make it), so the drawing tools leave it out.
  function inferCandidates(sketch, i, opts) {
    var e = sketch.entities[i], out = [], skip = opts && opts.skip;
    if (!e) return out;
    // r15/snapaudit15: the tolerance follows the entity's own coordinates (the old `e.x1 || e.x || e.cx` fell through
    // to the next field whenever a coordinate was 0)
    var mag = 1;
    pointRefs(sketch, i).forEach(function (pr) { mag = Math.max(mag, Math.abs(pr.pt[0]), Math.abs(pr.pt[1])); });
    var tol = 1e-9 * mag + 1e-9, placed = placedTest(opts && opts.placed, Math.max(tol, 1e-7 * mag));
    if (opts && opts.symmetric) symCandidates(sketch, i, tol).forEach(function (c) { out.push(c); });
    if (e.t === 'line' || e.t === 'slot') {   // r9/sketch9: a straight slot drawn level / upright too (its centre line)
      var dx = Math.abs(e.x2 - e.x1), dy = Math.abs(e.y2 - e.y1);
      if (dy < tol && dx > tol) out.push({ type: 'horizontal', refs: [String(i)], at: [(e.x1 + e.x2) / 2, e.y1] });
      else if (dx < tol && dy > tol) out.push({ type: 'vertical', refs: [String(i)], at: [e.x1, (e.y1 + e.y2) / 2] });
    }
    pointRefs(sketch, i).forEach(function (pr) {
      // r9/sketch9: a Center Rectangle's / Polygon's centre is a sketch point in SolidWorks (started on the origin it is
      // Coincident with it); a corner rectangle's and a slot's centre are not
      if (/\.mid$/.test(pr.ref) || (/\.c$/.test(pr.ref) && (e.t === 'rect' || e.t === 'slot'))) return;
      if (skip && skip.test(pr.ref)) return;
      if (placed && !placed(pr.pt)) return;   // fidelity #8: a point the tool computed, not placed
      if (Math.abs(pr.pt[0]) < tol && Math.abs(pr.pt[1]) < tol) { out.push({ type: 'coincident', refs: [pr.ref, 'O'], at: pr.pt }); return; }
      // lane C: a point already Coincident with this one (the corner a rectangle's next line shares, made with the
      // lines) is no new point to land on: look past it, so a corner placed on a line still finds the line
      var joined = {};
      (sketch.rels || []).forEach(function (rel) { if (rel.type === 'coincident' && rel.refs.length === 2 && rel.refs.indexOf(pr.ref) >= 0) joined[rel.refs[0] === pr.ref ? rel.refs[1] : rel.refs[0]] = true; });
      var hit = null;
      for (var j = 0; j < sketch.entities.length && !hit; j++) {
        if (j === i) continue;
        var cands = pointRefs(sketch, j);
        for (var k = 0; k < cands.length; k++) {
          var q = cands[k];
          if (joined[q.ref]) continue;
          if (Math.abs(q.pt[0] - pr.pt[0]) < tol && Math.abs(q.pt[1] - pr.pt[1]) < tol) { hit = q; break; }
        }
      }
      if (!hit) {
        // an end point (or a centre, a point) dropped on another entity's line, circle or arc, not at one of its points: Coincident to it
        var on = onCurveRef(sketch, i, pr.pt, Math.max(tol, 1e-7));
        // r9/sketch9: at the middle of a rectangle / polygon edge: Midpoint (as a line's midpoint already infers it)
        var oc = on && /\.e\d+$/.test(on) ? refCurve(sketch.entities, parseRef(on)) : null;
        if (oc && oc.kind === 'line' && len(sub(pr.pt, [(oc.a[0] + oc.b[0]) / 2, (oc.a[1] + oc.b[1]) / 2])) < Math.max(tol, 1e-7)) { out.push({ type: 'midpoint', refs: [pr.ref, on], at: pr.pt }); return; }
        if (on) {
          out.push({ type: 'coincident', refs: [pr.ref, on], at: pr.pt });
          // r15/snapaudit15: at the crossing of two curves (the intersection snap) the point is on both of them
          var on2 = onCurveRef(sketch, i, pr.pt, Math.max(tol, 1e-7), [parseRef(on).e]);
          if (on2) out.push({ type: 'coincident', refs: [pr.ref, on2], at: pr.pt });
        }
        return;
      }
      if (isCenterRef(sketch, pr.ref) && isCenterRef(sketch, hit.ref)) out.push({ type: 'concentric', refs: [pr.ref.replace(/\.c$/, ''), hit.ref.replace(/\.c$/, '')], at: pr.pt });
      else if (/\.mid$/.test(hit.ref)) out.push({ type: 'midpoint', refs: [pr.ref, hit.ref.replace(/\.mid$/, '')], at: pr.pt });
      else if (/\.c$/.test(hit.ref) && /^(rect|slot)$/.test(sketch.entities[parseRef(hit.ref).e].t)) return;   // r15/snapaudit15: a Polygon's / Center Rectangle's centre is a sketch point (Coincident); a Corner Rectangle's / slot's is not
      else out.push({ type: 'coincident', refs: [pr.ref, hit.ref], at: pr.pt });
    });
    smoothCandidates(sketch, i, tol, placed).forEach(function (c) { out.push(c); });
    return out;
  }
  // opts.placed as a test: function (pt) -> whether pt is one of the placed points (within ptol), or null (no list)
  function placedTest(list, ptol) {
    if (!list || typeof list.length !== 'number') return null;
    var P = [];
    for (var k = 0; k < list.length; k++) if (list[k] && isFinite(list[k][0]) && isFinite(list[k][1])) P.push(list[k]);
    return function (pt) {
      for (var m = 0; m < P.length; m++) if (Math.abs(P[m][0] - pt[0]) <= ptol && Math.abs(P[m][1] - pt[1]) <= ptol) return true;
      return false;
    };
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
  // Horizontal / Vertical when both lines are axis-aligned); r15/tangent15: a line that starts or ends on a circle /
  // arc square to its radius there (Tangent).
  // placed (inferCandidates' opts.placed test, or null): only the ends the tool placed
  function smoothCandidates(sketch, i, tol, placed) {
    var E = sketch.entities, e = E[i], out = [], ANG = 1e-7;
    if (!e || (e.t !== 'line' && e.t !== 'arc')) return out;
    function axis(d) { return Math.abs(d[0]) < ANG || Math.abs(d[1]) < ANG; }
    var seen = {};
    ['p1', 'p2'].forEach(function (s) {
      var pt = refPoint(E, { e: i, s: 'p', k: s === 'p1' ? 1 : 2 }), u = pt && endDir(e, pt);
      if (!u || len(u) < 0.5 || (placed && !placed(pt))) return;
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
      // r15/tangent15: a line end on a circle, or on an arc inside its sweep (an arc's own ends are handled above),
      // with the line square to the radius there: the line touches it at that end (the Line tool's tangent snap).
      // Tangent follows the end's on-curve Coincident, which inferCandidates lists first, so its equation is the
      // shared-end one (radius square to the line) and the pair is not redundant.
      if (e.t !== 'line') return;
      for (var c = 0; c < E.length; c++) {
        var ci = E[c];
        if (c === i || seen[c] || !ci || (ci.t !== 'circle' && ci.t !== 'arc') || !(ci.r > 0)) continue;
        var rv = sub(pt, [+ci.cx || 0, +ci.cy || 0]);
        if (Math.abs(len(rv) - ci.r) >= Math.max(tol, 1e-7)) continue;
        if (ci.t === 'arc') {
          var sw = ci.a1 - ci.a0, rel = ((Math.atan2(rv[1], rv[0]) / D2R - ci.a0) % 360 + 360) % 360;
          if (sw < 360 && (rel < 1e-7 || rel > sw - 1e-7)) continue;
        }
        if (Math.abs(dot(u, unit(rv))) < ANG) { out.push({ type: 'tangent', refs: [String(i), String(c)], at: pt }); seen[c] = true; }
      }
    });
    return out;
  }
  // The curve ref (a line, a rectangle / polygon edge, a circle or an arc) of an entity other than `self` that point pt
  // lies on, within its extent (between a segment's ends, inside an arc's sweep), or null.
  function onCurveRef(sketch, self, pt, tol, skip) {
    var E = sketch.entities;
    for (var j = 0; j < E.length; j++) {
      if (j === self || !E[j] || E[j].t === 'slot' || E[j].t === 'aslot' || (skip && skip.indexOf(j) >= 0)) continue;
      // sketch-refine: on a spline / ellipse, inside its extent (not at an open end, which is a point of its own)
      if (isFree(E[j])) {
        var fcj = freeCurve(E[j]), cj = fcj && freeClosest(fcj, pt);
        if (cj && !cj.end && cj.d < tol && !(!fcj.closed && (len(sub(cj.p, fcj.pt(fcj.t0))) < tol || len(sub(cj.p, fcj.pt(fcj.t1))) < tol))) return String(j);
        continue;
      }
      var refs = curveRefs(sketch, j);
      for (var k = 0; k < refs.length; k++) {
        var c = refCurve(E, parseRef(refs[k]));
        if (!c) continue;
        if (c.kind === 'line') {
          var d = sub(c.b, c.a), l2 = dot(d, d);
          if (l2 < 1e-18) continue;
          var t = dot(sub(pt, c.a), d) / l2;
          var sj = infSides(E[j]);
          if ((t > 1e-9 || (sj && sj.p1)) && (t < 1 - 1e-9 || (sj && sj.p2)) && Math.abs(lineDist(pt, c)) < tol) return refs[k];
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
  function infer(sketch, i, opts) {
    var added = [];
    function tryAdd(rel) {
      if (!relEquation(sketch.entities, rel, sketch.rels)) return false;
      var before = analyze(sketch);
      (sketch.rels = sketch.rels || []).push(rel);
      var an = analyze(sketch), k = sketch.rels.length - 1;
      if (an.rels[k] !== 'ok' || an.redundant > before.redundant || an.conflicts > before.conflicts) { sketch.rels.pop(); if (!sketch.rels.length) delete sketch.rels; return false; }
      added.push(rel);
      return true;
    }
    var hv = null;   // the Horizontal / Vertical this call added to the entity itself
    inferCandidates(sketch, i, opts).forEach(function (c) {
      var rel = { type: c.type, refs: c.refs };
      if (tryAdd(rel)) { if ((c.type === 'horizontal' || c.type === 'vertical') && c.refs.length === 1) hv = rel; return; }
      // a Midpoint that half repeats what is there (a vertical line between two midpoints) still puts the end on the line
      if (c.type === 'midpoint') { tryAdd({ type: 'coincident', refs: c.refs.slice() }); return; }
      // rfA: a line that closes a loop on a point: its end's Coincident counts more than the Horizontal / Vertical that
      // already fixes one of that end's coordinates (the loop was left open, a degree of freedom short of Fully
      // Defined): the Coincident goes in, the Horizontal / Vertical only if it still adds something
      if (c.type !== 'coincident' || !hv || !sketch.rels) return;
      var at = sketch.rels.indexOf(hv);
      if (at < 0) return;
      sketch.rels.splice(at, 1); added.splice(added.indexOf(hv), 1);
      if (tryAdd(rel)) { var was = hv; hv = null; tryAdd(was); }
      else { (sketch.rels = sketch.rels || []).splice(at, 0, hv); added.push(hv); }
    });
    return added;
  }
  // What a temporary (being-drawn) entity would infer: [{ type, at }] for the yellow inference icons.
  function inferPreview(sketch, e, opts) {
    if (!e) return [];
    var tmp = { entities: (sketch.entities || []).concat([e]) };
    return inferCandidates(tmp, tmp.entities.length - 1, opts).map(function (c) { return { type: c.type, at: c.at }; });
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
    var w = 0.1, pull, capHold = null;
    var P0 = refPoint(base.entities, R), eR = base.entities[R.e];
    if (opts && opts.cap && R.s === null && eR && eR.t === 'arc') {
      // rfY: a slot's end cap (slotCap) grabbed on its curve moves that end of the slot: its centre follows the mouse
      // (`to` is the move from the grab) and its radius holds, so the slot stretches and keeps its width (SolidWorks)
      var cT = [eR.cx + to[0], eR.cy + to[1]], rC = eR.r;
      pull = { n: 2, ents: [R.e], soft: true, f: function (E) { var a = E[R.e]; return [w * (a.cx - cT[0]), w * (a.cy - cT[1])]; } };
      capHold = { n: 1, ents: [R.e], f: function (E) { return [E[R.e].r - rC]; } };   // (held exactly: the width does not creep)
    } else if (opts && opts.radius && R.s === null && eR && (eR.t === 'circle' || eR.t === 'arc')) {
      var rTo = len(sub(to, [eR.cx, eR.cy]));
      pull = { n: 1, ents: [R.e], soft: true, f: function (E) { return [w * (E[R.e].r - rTo)]; } };
    } else if (P0) pull = { n: 2, ents: [R.e], soft: true, f: function (E) { var p = refPoint(E, R); return [w * (p[0] - to[0]), w * (p[1] - to[1])]; } };
    else {
      var e0 = base.entities[R.e];
      if (!e0 || !K) return { ok: false };
      var tgt = K.translateEntity(e0, to[0], to[1]), names = paramNames(e0);
      pull = { n: names.length, ents: [R.e], soft: true, f: function (E) { return names.map(function (nm) { return w * (pget(E[R.e], nm) - pget(tgt, nm)); }); } };
    }
    var extra = capHold ? [pull, capHold] : [pull];
    // rfY: opts.hold = an entity held where it was (softly): a slot's centre line while one of its sides is dragged
    var eH = opts && opts.hold != null && opts.hold !== R.e ? base.entities[opts.hold] : null;
    if (eH) {
      var hn = paramNames(eH), hi = opts.hold;
      extra.push({ n: hn.length, ents: [hi], soft: true, f: function (E) { return hn.map(function (nm) { return w * (pget(E[hi], nm) - pget(eH, nm)); }); } });
    }
    var sys = buildSystem(sketch, { dimTargets: targets, extra: extra });
    // only the geometry tied to the dragged entity (through relations and dimensions) can move: solve that part alone
    // (much smaller matrices in a sketch of several separate pieces; a conflict elsewhere does not block the drag)
    var part = connected(sys, R.e);
    if (part.count < sys.ents.length) sys = buildSystem(sketch, { dimTargets: targets, extra: extra, entities: part.set });
    var eR0 = base.entities[R.e], dm = eR0 && (eR0.t === 'ellipse' || eR0.t === 'pellipse') ? dragMob(sys, R) : blockMob(sys);   // ui-sketch-spline; rfAU: blocks
    lm(sys, { leastSquares: true, maxIt: 60, mob: dm });
    var r = lm(sys, { only: function (c) { return !c.soft; }, mob: dm });
    if (!r.ok) return { ok: false };
    writeBack(sketch, sys);
    return { ok: true };
  }

  // rfY (sketch fidelity 3, finding 2): is arc i a slot's end cap? Its centre sits on an end of a construction line or
  // arc (a straight slot's centerline, an arc slot's centre-line arc) and it is Tangent to something (the slot's
  // sides). Dragging a cap stretches the slot (drag opts.cap) instead of changing its radius as a free arc's drag does.
  function slotCap(sketch, i) {
    var E = sketch.entities, e = E[i], c = i + '.c', tangent = false, onEnd = false;
    if (!e || e.t !== 'arc' || !sketch.rels) return false;
    sketch.rels.forEach(function (rel) {
      if (rel.suppressed || !rel.refs) return;
      if (rel.type === 'tangent' && rel.refs.indexOf(String(i)) >= 0) tangent = true;
      if (rel.type === 'coincident' && rel.refs.length === 2 && rel.refs.indexOf(c) >= 0) {
        var m = /^(\d+)\.p[12]$/.exec(rel.refs[0] === c ? rel.refs[1] : rel.refs[0]), o = m && E[+m[1]];
        if (o && o.construction && (o.t === 'line' || o.t === 'arc')) onEnd = true;
      }
    });
    return tangent && onEnd;
  }
  // rfY: the construction centre line (or centre-line arc) of the slot whose side line / arc i is (Tangent to a slot
  // cap), or -1. Dragging a side holds it (drag opts.hold), so the width changes symmetrically about it (SolidWorks).
  function slotAxisOf(sketch, i) {
    var E = sketch.entities, out = -1, s = String(i);
    if (!E[i] || E[i].construction || !sketch.rels) return -1;
    sketch.rels.forEach(function (rel) {
      if (out >= 0 || rel.type !== 'tangent' || rel.refs.indexOf(s) < 0) return;
      var j = +(rel.refs[0] === s ? rel.refs[1] : rel.refs[0]);
      if (!(j >= 0) || !slotCap(sketch, j)) return;
      sketch.rels.forEach(function (r2) {
        if (out >= 0 || r2.type !== 'coincident' || r2.refs.indexOf(j + '.c') < 0) return;
        var m = /^(\d+)\.p[12]$/.exec(r2.refs[0] === j + '.c' ? r2.refs[1] : r2.refs[0]);
        if (m && E[+m[1]] && E[+m[1]].construction) out = +m[1];
      });
    });
    return out;
  }

  // ------------------------------------------------------------------ offset of a whole entity
  // Offset Entities on a circle, rectangle, slot or regular polygon gives the same kind of entity (a circle stays a
  // circle, not a faceted polyline). d > 0 grows it, d < 0 shrinks it. Returns null for other kinds or when it would
  // vanish.
  function offsetEntity(e, d) {
    d = +d;
    if (!e || !isFinite(d)) return null;
    if (isFree(e)) return freeOffset(e, d);   // sketch-refine
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
      case 'aslot': if (e.w + 2 * d > 1e-9 && e.w + 2 * d < 2 * e.r) o = { t: 'aslot', cx: e.cx, cy: e.cy, r: e.r, a0: e.a0, a1: e.a1, w: e.w + 2 * d }; break;
      case 'poly': { var n = e.n | 0 || 6, r = e.r + d / Math.cos(Math.PI / n); if (r > 1e-9) { o = { t: 'poly', cx: e.cx, cy: e.cy, r: r, n: n, rot: e.rot || 0 }; if (e.ins) o.ins = true; } break; }
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
    if (e.t === 'aslot') return [{ type: 'coincident', refs: [i + '.p1', j + '.p1'] }, { type: 'coincident', refs: [i + '.p2', j + '.p2'] }, { type: 'equal', refs: [String(i), String(j)] }];
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
    var pairs = e.t === 'circle' || e.t === 'arc' || e.t === 'line' || e.t === 'slot' || e.t === 'aslot' ? [[String(i), String(j)]]
      : e.t === 'poly' ? [[i + '.e0', j + '.e0']] : e.t === 'rect' || e.t === 'crect' ? [[i + '.e0', j + '.e0']] : [];
    pairs.forEach(function (p) {
      var r = addRelation(sketch, 'distance', p, { value: v, dir: e.t === 'circle' || e.t === 'arc' || e.t === 'slot' || e.t === 'aslot' ? 'r' : undefined, rejectOver: true });
      if (r.ok) out = out.concat(r.rels);
    });
    return out;
  }

  // Mirror Entities about a line entity: each copy is held Symmetric to its original about that line (lines, circles,
  // arcs, points), as SolidWorks does. pairs = [[original, copy], ...]. A relation that would over-define is skipped.
  // Returns the number added.
  // p9-sketchfix: compound entities are held too, so a mirrored slot or polygon follows its original: a slot by one
  // Symmetric of the two slots (ends mirrored, equal width), a polygon by its centre and first corner (Symmetric
  // points: size and turn follow), a rectangle mirrored about an upright / level line by its centre and Equal sides,
  // and a polyline (or a rectangle mirrored about a slanted line, which comes out as one) corner by corner.
  // A pair counts once however many relations hold it.
  function mirrorPairRels(E, i, j, axis) {
    var a = E[i], b = E[j], A = String(i), B = String(j), X = String(axis);
    function sym(ra, rb) { return { type: 'symmetric', refs: [ra, rb, X] }; }
    if (!a || !b) return [];
    if (a.t === b.t && /^(line|circle|arc|point|slot)$/.test(a.t)) return [sym(A, B)];
    if (a.t === 'text' && b.t === 'text' && textFree(a) && textFree(b)) return [sym(A, B)];   // sketch-text-ref: their insertion points
    if (a.t === 'poly' && b.t === 'poly') return [sym(A + '.c', B + '.c'), sym(A + '.v0', B + '.v0')];
    // p9-sketch-curves: an arc slot's mirror image runs the other way round: its start is the original's end
    if (a.t === 'aslot' && b.t === 'aslot') return [sym(A + '.p1', B + '.p2'), sym(A + '.p2', B + '.p1'), { type: 'equal', refs: [A, B] }];
    if ((a.t === 'rect' || a.t === 'crect') && a.t === b.t) return [sym(A + '.c', B + '.c'), { type: 'equal', refs: [A + '.e0', B + '.e0'] }, { type: 'equal', refs: [A + '.e1', B + '.e1'] }];
    var ca = corners(a), cb = corners(b);
    if (b.t === 'polyline' && ca && cb && ca.length === cb.length) return ca.map(function (q, k) { return sym(A + '.v' + k, B + '.v' + k); });
    // sketch-refine: a spline's points pair one for one; an ellipse's centre and major axis end (the mirror turns the
    // minor axis end the other way round)
    if (a.t === 'spline' && b.t === 'spline' && a.pts.length === b.pts.length) return a.pts.map(function (q, k) { return sym(A + '.v' + k, B + '.v' + k); });
    if ((a.t === 'ellipse' || a.t === 'pellipse') && a.t === b.t) return [sym(A + '.c', B + '.c'), sym(A + '.v0', B + '.v0'), sym(A + '.v1', B + '.v3')];
    return [];
  }
  function mirrorRelations(sketch, pairs, axis) {
    var n = 0, E = sketch.entities, ax = E[axis];
    if (!ax || ax.t !== 'line') return 0;
    pairs.forEach(function (p) {
      var held = 0;
      mirrorPairRels(sketch.entities, p[0], p[1], axis).forEach(function (rel) {
        if (!relEquation(sketch.entities, rel, sketch.rels)) return;
        var before = analyze(sketch);
        (sketch.rels = sketch.rels || []).push(rel);
        solve(sketch);   // the copies were rounded to 1e-4: close the relation exactly
        var an = analyze(sketch);
        if (an.rels[sketch.rels.length - 1] !== 'ok' || an.redundant > before.redundant || an.conflicts > before.conflicts) { sketch.rels.pop(); if (!sketch.rels.length) delete sketch.rels; return; }
        held++;
      });
      if (held) n++;
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
  // Round the corner between lines / arcs c.i and c.j (a lineCorner / curveCorner result) with radius r, as SolidWorks'
  // Sketch Fillet does (filletPair, below): both are trimmed back to the tangent points, an arc is added, held by
  // Coincident and Tangent relations, and relations and length dimensions on the vanished corner move to a virtual
  // sharp. opts: filletPair's. Returns { ok, arc, sharp (index or -1), error }.
  function filletCorner(sketch, c, r, opts) {
    return filletPair(sketch, { i: c.i, ei: c.ei, j: c.j, ej: c.ej, at: c.at }, r, opts);
  }

  // ------------------------------------------------------------------ extend (the counterpart of Trim)
  // Where line or arc i reaches when its end nearest uv is extended to the first entity it meets, as SolidWorks' Extend
  // Entities does: { end: 'p1' | 'p2', from, to, d: added length (line) or degrees (arc), a: new end angle (arc) }, or
  // null when nothing lies ahead.
  function extendTarget(sketch, i, uv, all) {   // all (r13/trim13): every point where the carrier meets other entities
    var E = sketch.entities, e = E[i];
    if (!all && e && (e.t === 'spline' || e.t === 'pellipse')) return freeExtendTarget(sketch, i, uv);   // sketch-refine
    if (!e || (e.t !== 'line' && e.t !== 'arc')) return null;
    var q1 = refPoint(E, { e: i, s: 'p', k: 1 }), q2 = refPoint(E, { e: i, s: 'p', k: 2 });
    var end = len(sub(uv, q1)) <= len(sub(uv, q2)) ? 'p1' : 'p2', from = end === 'p1' ? q1 : q2;
    var segs = [], circs = [], frees = [];
    E.forEach(function (o, j) {
      if (j === i || !o || o.t === 'point' || tSkipped(o)) return;   // (rfCY: nor an entity withSkip leaves out, a hidden layer's)
      if (o.t === 'line') { var cs = carrierSeg(o); segs.push([cs.a, cs.b]); }
      else if (o.t === 'circle' || o.t === 'arc') circs.push(o);
      else if (isFree(o)) { var fo = freeCurve(o); if (fo) frees.push(fo); }   // sketch-refine: onto the true curve
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
    // rfCH: the other entities' ends (and corners) that lie on the carrier within floating-point noise are met too (a
    // T-junction the crossing test misses when the end is a hair off): the carrier lands exactly at the end's foot
    var ends = [], jtol = 1e-9 * tSize(sketch);
    if (K && K.entityEnds) E.forEach(function (o, j) { if (j !== i && o && !tSkipped(o)) K.entityEnds(o).forEach(function (p) { ends.push(p); }); });
    function onSweep(o, p) {
      if (o.t !== 'arc' || o.a1 - o.a0 >= 360) return true;
      var a = Math.atan2(p[1] - o.cy, p[0] - o.cx) / D2R, rel = ((a - o.a0) % 360 + 360) % 360;
      return rel <= o.a1 - o.a0 + 1e-7;
    }
    // points where the carrier (the infinite line, or the arc's whole circle) meets the other entities
    function lineHits(A, d) {
      ends.forEach(function (p) { var t = dot(sub(p, A), d), foot = [A[0] + d[0] * t, A[1] + d[1] * t]; if (len(sub(p, foot)) <= jtol) hits.push(foot); });
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
      frees.forEach(function (fo) { freeHits(fo, { kind: 'line', a: A, b: [A[0] + d[0], A[1] + d[1]] }).forEach(function (t) { hits.push(fo.pt(t)); }); });
    }
    function circleHits(C, R) {
      ends.forEach(function (p) { var v = sub(p, C), l = len(v); if (l > 1e-12 && Math.abs(l - R) <= jtol) hits.push([C[0] + v[0] * R / l, C[1] + v[1] * R / l]); });
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
      frees.forEach(function (fo) { freeHits(fo, { kind: 'circle', c: C, r: R }).forEach(function (t) { hits.push(fo.pt(t)); }); });
    }
    var best = null;
    if (e.t === 'line') {
      var other = end === 'p1' ? q2 : q1, L0 = len(sub(from, other));
      if (L0 < 1e-12) return null;
      var d = [(from[0] - other[0]) / L0, (from[1] - other[1]) / L0];
      lineHits(from, d);
      if (all) return hits;
      hits.forEach(function (p) { var t = dot(sub(p, from), d); if (t > eps && (!best || t < best.d)) best = { end: end, from: from, to: p, d: t }; });
      return best;
    }
    var sw = e.a1 - e.a0;
    if (sw >= 360 - 1e-9) return null;
    circleHits([e.cx, e.cy], e.r);
    if (all) return hits;
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
    if (e && (e.t === 'spline' || e.t === 'pellipse')) return freeExtend(sketch, i, uv);   // sketch-refine
    if (e && e.infinite) { var tgI = extendTarget(sketch, i, uv), sI = infSides(e); if (!tgI || sI[tgI.end]) return { ok: false, error: 'That end of the line runs on for ever: there is nothing to extend.' }; }
    if (!e || (e.t !== 'line' && e.t !== 'arc')) return { ok: false, error: 'Extend works on lines, arcs, open splines and partial ellipses.' };
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

  // ------------------------------------------------------------------ sketch-refine: free curves (splines, ellipses)
  // A spline or (partial) ellipse as a curve: { e, t0, t1, closed, per, pt(t), d1(t) }. The parameter of a spline is its
  // span index plus the span's Bézier parameter (spline point k sits at t = k), of an ellipse its parameter angle in
  // radians (Kernel.ellipsePoint). An open spline's pt / d1 extrapolate its end spans past t0 / t1 (Extend). These are
  // what point-on-curve Coincidents, Trim, Extend and the hover previews use, so each lands on the true curve.
  function isFree(e) { return !!e && (e.t === 'spline' || e.t === 'ellipse' || e.t === 'pellipse'); }
  function bzPt(B, s) { var u = 1 - s, b0 = u * u * u, b1 = 3 * u * u * s, b2 = 3 * u * s * s, b3 = s * s * s; return [b0 * B[0][0] + b1 * B[1][0] + b2 * B[2][0] + b3 * B[3][0], b0 * B[0][1] + b1 * B[1][1] + b2 * B[2][1] + b3 * B[3][1]]; }
  function bzD1(B, s) { var u = 1 - s, d0 = 3 * u * u, d1 = 6 * u * s, d2 = 3 * s * s; return [d0 * (B[1][0] - B[0][0]) + d1 * (B[2][0] - B[1][0]) + d2 * (B[3][0] - B[2][0]), d0 * (B[1][1] - B[0][1]) + d1 * (B[2][1] - B[1][1]) + d2 * (B[3][1] - B[2][1])]; }
  function freeCurve(e) {
    if (!isFree(e)) return null;
    if (e.t === 'spline' && e.style && K && K.bzPoint) {
      // rfAH: a style spline: its one Bézier span exactly, t in [0, 1] (the polynomial carried on past its ends: Extend)
      var SP = (e.pts || []).map(function (q) { return [+q[0], +q[1]]; });
      if (SP.length < 2) return null;
      var gs = K.splineGeom(e), Ls = gs && gs.style ? gs.style.L : 1;
      return { e: e, g: gs, style: true, t0: 0, t1: 1, closed: false, per: 1, n: 16 * Math.max(4, SP.length), reach: 1,
        pt: function (t) { return K.bzPoint(SP, t); },
        d1: function (t) { return K.bzDeriv(SP, t); },
        knotD1: function (t) { var d = K.bzDeriv(SP, t); return [d[0] / Ls, d[1] / Ls]; } };
    }
    if (e.t === 'spline') {
      var g = K && K.splineGeom ? K.splineGeom(e) : null;
      if (!g || !g.bez.length) return null;
      var m = g.bez.length;
      var at = function (t) {
        var j, s;
        if (g.closed) { var w = ((t % m) + m) % m; j = Math.min(m - 1, Math.floor(w)); s = w - j; }
        else { j = Math.max(0, Math.min(m - 1, Math.floor(t))); s = t - j; }
        return { B: g.bez[j], s: s };
      };
      return { e: e, g: g, t0: 0, t1: m, closed: g.closed, per: m, n: 24 * m,
        pt: function (t) { var q = at(t); return bzPt(q.B, q.s); },
        d1: function (t) { var q = at(t); return bzD1(q.B, q.s); },
        // the derivative along the spline's own (chord-length knot) parameter: what a tangent-driving point's weight measures
        knotD1: function (t) { var q = at(t), j = g.bez.indexOf(q.B), h = g.knots[j + 1] - g.knots[j], d = bzD1(q.B, q.s); return [d[0] / h, d[1] / h]; } };
    }
    if (!(e.rx > 0) || !(e.ry > 0)) return null;
    var r = (+e.rot || 0) * D2R, cr = Math.cos(r), sr = Math.sin(r), full = e.t === 'ellipse';
    var u0 = full ? 0 : +e.a0 * D2R, u1 = full ? 2 * Math.PI : +e.a1 * D2R;
    if (!(u1 > u0)) return null;
    return { e: e, t0: u0, t1: u1, closed: full, per: 2 * Math.PI, n: Math.max(16, Math.ceil(128 * (u1 - u0) / (2 * Math.PI))),
      pt: function (u) { var x = e.rx * Math.cos(u), y = e.ry * Math.sin(u); return [e.cx + cr * x - sr * y, e.cy + sr * x + cr * y]; },
      d1: function (u) { var x = -e.rx * Math.sin(u), y = e.ry * Math.cos(u); return [cr * x - sr * y, sr * x + cr * y]; } };
  }
  // samples of fc from t0 to t1: [{ t, p }] (n + 1 of them; a closed curve's last is its first again)
  function freeSamples(fc) {
    var out = [];
    for (var k = 0; k <= fc.n; k++) { var t = fc.t0 + (fc.t1 - fc.t0) * k / fc.n; out.push({ t: t, p: fc.pt(t) }); }
    return out;
  }
  // the point of fc nearest p: { t, p, d, end } (end: an open curve's t0 / t1 was the nearest; p lies past that end)
  function freeClosest(fc, p, samples) {
    var sm = samples || freeSamples(fc), bt = fc.t0, bd = Infinity;
    sm.forEach(function (q) { var d = (q.p[0] - p[0]) * (q.p[0] - p[0]) + (q.p[1] - p[1]) * (q.p[1] - p[1]); if (d < bd) { bd = d; bt = q.t; } });
    var t = bt, span = (fc.t1 - fc.t0) / fc.n, h = 1e-6 * Math.max(1, span);
    for (var it = 0; it < 30; it++) {
      var S = fc.pt(t), d = fc.d1(t), w = sub(S, p), g = dot(w, d);
      var dd = sub(fc.d1(t + h), fc.d1(t - h)), d2 = [dd[0] / (2 * h), dd[1] / (2 * h)], gp = dot(d, d) + dot(w, d2);
      if (!(gp > 1e-300)) gp = dot(d, d) || 1;
      var step = g / gp;
      if (Math.abs(step) > span) step = step > 0 ? span : -span;
      var nt = t - step;
      if (!fc.closed) nt = Math.max(fc.t0, Math.min(fc.t1, nt));
      if (Math.abs(nt - t) < 1e-15 * Math.max(1, Math.abs(t))) { t = nt; break; }
      t = nt;
    }
    var P = fc.pt(t), end = !fc.closed && (t <= fc.t0 + 1e-12 || t >= fc.t1 - 1e-12);
    return { t: t, p: P, d: len(sub(P, p)), end: end };
  }
  // the signed distance from p to fc (positive on the left of its direction); past an open end, the distance to the end
  function freeDist(fc, p) {
    var c = freeClosest(fc, p), d = fc.d1(c.t), L = len(d);
    if (c.end || L < 1e-15) { var v = sub(p, c.p), s = crs(d, v); return (s < 0 ? -1 : 1) * len(v); }
    return crs(d, sub(p, c.p)) / L;
  }
  // a whole spline / ellipse ref ('3'): its curve, or null
  function refFree(ents, r) {
    if (!r || r.o || r.s !== null) return null;
    var e = ents[r.e];
    return isFree(e) ? freeCurve(e) : null;
  }
  // Parameters on fc where the carrier q crosses it. q: { kind: 'seg', a, b } (the segment), { kind: 'line', a, b } (the
  // infinite line), { kind: 'arc', c, r, a0, a1 (radians), full } or { kind: 'circle', c, r }, or another free curve
  // { fc }. Sign changes of the carrier's signed distance along the samples, refined by bisection then secant steps
  // (curves crossing a free curve: its chords, then Newton on both true curves).
  function freeHits(fc, q, samples) {
    var sm = samples || freeSamples(fc), out = [];
    if (q.fc) {
      var sq = freeSamples(q.fc);
      for (var i = 0; i < sm.length - 1; i++) for (var j = 0; j < sq.length - 1; j++) {
        var A = sm[i].p, B = sm[i + 1].p, C = sq[j].p, Dq = sq[j + 1].p, d1 = sub(B, A), d2 = sub(Dq, C), den = crs(d1, d2);
        if (Math.abs(den) < 1e-18) continue;
        var w = sub(C, A), s = crs(w, d2) / den, u = crs(w, d1) / den;
        if (s < -1e-9 || s > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue;
        var t = sm[i].t + (sm[i + 1].t - sm[i].t) * s, v = sq[j].t + (sq[j + 1].t - sq[j].t) * u, t00 = t, v00 = v;
        for (var it = 0; it < 30; it++) {
          var F = sub(fc.pt(t), q.fc.pt(v)), Ja = fc.d1(t), Jb = q.fc.d1(v), dt = crs(Jb, Ja);
          if (Math.abs(dt) < 1e-300) break;
          // F + Ja·δt − Jb·δv = 0 (lane DE: the signs were flipped, so Newton ran away and spline / spline and
          // spline / ellipse crossings were dropped)
          var x = crs(F, Jb) / dt, y = crs(F, Ja) / dt;
          t += x; v += y;
          if (Math.abs(x) + Math.abs(y) < 1e-15 * Math.max(1, Math.abs(t))) break;
        }
        // a Newton that wandered off (tangent curves) keeps the chords' crossing
        if (!(len(sub(fc.pt(t), q.fc.pt(v))) < 1e-9 * Math.max(1, len(fc.pt(t00))))) { t = t00; v = v00; }
        if (!fc.closed && (t < fc.t0 - 1e-9 || t > fc.t1 + 1e-9)) continue;
        if (!q.fc.closed && (v < q.fc.t0 - 1e-9 || v > q.fc.t1 + 1e-9)) continue;
        out.push(t);
      }
      return dedupT(fc, out);
    }
    var phi;
    if (q.kind === 'seg' || q.kind === 'line') { var u0 = unit(sub(q.b, q.a)); phi = function (p) { return crs(u0, sub(p, q.a)); }; }
    else phi = function (p) { return len(sub(p, q.c)) - q.r; };
    function within(p) {
      if (q.kind === 'seg') { var d = sub(q.b, q.a), L2 = dot(d, d), tt = L2 > 0 ? dot(sub(p, q.a), d) / L2 : 0; return tt > -1e-9 && tt < 1 + 1e-9; }
      if (q.kind === 'arc' && !q.full) return tAngIn(Math.atan2(p[1] - q.c[1], p[0] - q.c[0]), q.a0, q.a1) != null;
      return true;
    }
    var vals = sm.map(function (s) { return phi(s.p); });
    for (var k = 0; k < sm.length - 1; k++) {
      var fa = vals[k], fb = vals[k + 1], ta = sm[k].t, tb = sm[k + 1].t;
      if (fa === 0) { if (within(sm[k].p)) out.push(ta); continue; }
      if (fa * fb > 0) continue;
      for (var b = 0; b < 60 && tb - ta > 1e-15 * Math.max(1, Math.abs(ta)); b++) {
        var tm = (ta + tb) / 2, fm = phi(fc.pt(tm));
        if (fm === 0) { ta = tb = tm; break; }
        if (fa * fm < 0) { tb = tm; fb = fm; } else { ta = tm; fa = fm; }
      }
      var th = (ta + tb) / 2;
      if (within(fc.pt(th))) out.push(th);
    }
    if (!fc.closed && vals[vals.length - 1] === 0 && within(sm[sm.length - 1].p)) out.push(sm[sm.length - 1].t);
    return dedupT(fc, out);
  }
  function dedupT(fc, ts) {
    ts.sort(function (a, b) { return a - b; });
    var out = [], tol = 1e-7 * (fc.t1 - fc.t0);
    ts.forEach(function (t) { if (!out.length || t - out[out.length - 1] > tol) out.push(t); });
    if (fc.closed && out.length > 1 && out[0] + fc.per - out[out.length - 1] < tol) out.pop();
    return out;
  }
  // the carriers of entity o that cut a free curve: K.entityPrimitives' segments and arcs, or o's own curve
  function freeCutters(o) {
    if (!o || o.t === 'point') return [];
    if (isFree(o)) { var fo = freeCurve(o); return fo ? [{ fc: fo }] : []; }
    return tPrims(o);
  }
  // the parameters on free entity idx where the other entities (only: those listed) cross it, in order
  function freeCuts(sketch, idx, fc, only) {
    var E = sketch.entities, sm = freeSamples(fc), ts = [];
    E.forEach(function (o, oi) {
      if (oi === idx || !o || o.t === 'point' || (only && only.indexOf(oi) < 0)) return;
      freeCutters(o).forEach(function (q) { freeHits(fc, q, sm).forEach(function (t) { ts.push(t); }); });
    });
    return dedupT(fc, ts);
  }
  // Trim to closest on a free curve at uv: the span to remove { lo, hi, whole } between the neighbouring crossings (a
  // closed curve needs two to be cut open), or null
  function freeSpan(sketch, idx, uv) {
    var e = sketch.entities[idx], fc = freeCurve(e);
    if (!fc) return null;
    var ts = freeCuts(sketch, idx, fc), kt = freeClosest(fc, uv).t, lo = null, hi = null, tol = 1e-9 * (fc.t1 - fc.t0);
    if (fc.closed) {
      if (ts.length < 2) return { fc: fc, whole: true, lo: fc.t0, hi: fc.t1 };
      ts.forEach(function (t) { if (t < kt - tol && (lo == null || t > lo)) lo = t; if (t > kt + tol && (hi == null || t < hi)) hi = t; });
      if (lo == null) lo = ts[ts.length - 1] - fc.per;
      if (hi == null) hi = ts[0] + fc.per;
      return { fc: fc, whole: false, lo: lo, hi: hi };
    }
    ts.forEach(function (t) { if (t > fc.t0 + tol && t < fc.t1 - tol) { if (t < kt - tol && (lo == null || t > lo)) lo = t; if (t > kt + tol && (hi == null || t < hi)) hi = t; } });
    return { fc: fc, whole: lo == null && hi == null, lo: lo == null ? fc.t0 : lo, hi: hi == null ? fc.t1 : hi };
  }
  function freePts(fc, lo, hi) {
    var n = Math.max(8, Math.ceil(fc.n * Math.abs(hi - lo) / (fc.t1 - fc.t0))), out = [];
    for (var k = 0; k <= n; k++) out.push(fc.pt(lo + (hi - lo) * k / n));
    return out;
  }
  // The piece of free curve fc from parameter ta to tb (ta < tb; a closed curve's may run past its seam) as an entity of
  // the same family: a partial ellipse, or a spline through the cut points and the original points between them. A
  // spline's cut end leaves along the original curve (a tangent-driving point with the curve's direction and speed
  // there), and so does the original point next to it, so every span past it is exactly the original's (the C2 system
  // beyond a point of known tangent is the original's) and only the span cut in two is redrawn through its new end;
  // points it keeps keep their own tangents.
  // rfAX: ext — an open spline's piece may run past its ends (ta < t0, tb > t1): the end span carried on (its own
  // polynomial, as Extend Entities carries it), the old end becoming a spline point with its own tangent
  function freePiece(fc, ta, tb, ext) {
    var e = fc.e, o;
    function r6(x) { return Math.round(x * 1e6) / 1e6; }
    if (e.t === 'spline' && e.conic != null && K.conicPieceAt) {
      // rfAS: the piece of a conic / parabola is a conic of its own through the same curve (ui-sketch-spline.js)
      return K.conicPieceAt(e, fc.pt(ta), fc.pt(tb));
    }
    if (e.t === 'spline' && e.style) {
      // rfAH: the piece of a style spline is a style spline of the same degree (the Bézier's own sub-span, exactly)
      o = { t: 'spline', style: true, pts: K.bzSub(e.pts, ta, tb).map(function (q) { return [r6(q[0]), r6(q[1])]; }) };
      if (e.showCurvature) o.showCurvature = true;
      if (e.showMinRadius) o.showMinRadius = true;   // lane CV
    } else if (e.t !== 'spline') {
      o = { t: 'pellipse', cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry, rot: +e.rot || 0, a0: ta / D2R, a1: tb / D2R };
      while (o.a0 >= 360) { o.a0 -= 360; o.a1 -= 360; }
      while (o.a0 < 0) { o.a0 += 360; o.a1 += 360; }
      o.a0 = r6(o.a0); o.a1 = r6(o.a1);
    } else {
      var n = e.pts.length, eps = 1e-6, pts = [], tans = [], any = false;
      var tanAt = function (t) { var d = fc.knotD1(t); return [r6(Math.atan2(d[1], d[0]) / D2R), r6(len(d))]; };
      var add = function (p, tg) { pts.push([r6(p[0]), r6(p[1])]); tans.push(tg || null); if (tg) any = true; };
      var startOrig = !fc.closed && ta <= fc.t0 + eps && !(ext && ta < fc.t0 - eps), endOrig = !fc.closed && tb >= fc.t1 - eps && !(ext && tb > fc.t1 + eps), inner = [];
      add(startOrig ? e.pts[0] : fc.pt(ta), startOrig ? (e.tans && e.tans[0]) : tanAt(ta));
      for (var k = Math.floor(ta) + 1; k < tb - eps; k++) if (k > ta + eps && (fc.closed || (k >= 0 && k <= n - 1))) inner.push(k);
      inner.forEach(function (k, q) {
        var kk = ((k % n) + n) % n, own = e.tans && e.tans[kk];
        add(e.pts[kk], (q === 0 && !startOrig) || (q === inner.length - 1 && !endOrig) ? (own ? own.slice() : tanAt(k)) : own);
      });
      if (endOrig) add(e.pts[n - 1], e.tans && e.tans[n - 1]);
      else add(fc.pt(tb), tanAt(tb));
      // a cut end's speed: the original's over the part of its span kept, per the new chord (so the redrawn span leaves
      // the cut exactly as the original did)
      var m = fc.g.bez.length;
      var hOf = function (t) { var j = Math.floor((fc.closed ? ((t % m) + m) % m : t) + 1e-12); j = Math.min(m - 1, Math.max(0, j)); return fc.g.knots[j + 1] - fc.g.knots[j]; };   // (rfAX: an open curve's carried-on ends use their end span)
      var scaleTan = function (i, tc, tn) { var L = len(sub(pts[i === 0 ? 1 : pts.length - 2], pts[i])); if (tans[i] && L > 1e-12) tans[i][1] = r6(tans[i][1] * Math.abs(tn - tc) * hOf(Math.min(tc, tn) + 1e-9) / L); };
      if (!startOrig && pts.length > 1) scaleTan(0, ta, inner.length ? inner[0] : tb);
      if (!endOrig && pts.length > 1) scaleTan(pts.length - 1, tb, inner.length ? inner[inner.length - 1] : ta);
      // rfAK: the original point next to a cut keeps its speed into the whole span on its far side and gets the cut span's
      // own (asymmetric weighting, [angle, weight, weightIn]): the chord of a cut span is not its share of the original
      // parameter, so one speed for both spans redrew the cut span (up to 0.6 % of its length off the original)
      var spanScale = function (i, j, tc, tn) { var L = len(sub(pts[j], pts[i])); return L > 1e-12 ? Math.abs(tn - tc) * hOf(Math.min(tc, tn) + 1e-9) / L : 1; };
      // rfBC: a kept point's curvature control (tg[3], signed 1 / R) stays on the piece; a cut end gets none
      var curvOf = function (tg) { return tg && tg[3] != null && isFinite(+tg[3]) ? [+tg[3]] : []; };
      if (inner.length) {
        var i1 = 1, iL = pts.length - 2, w0;
        if (!startOrig && tans[i1]) { w0 = +(tans[i1][1] == null ? 1 : tans[i1][1]); var wi = tans[i1][2] != null ? +tans[i1][2] : w0; tans[i1] = [tans[i1][0], w0, r6(wi * spanScale(0, i1, ta, inner[0]))].concat(curvOf(tans[i1])); }
        if (!endOrig && tans[iL]) { w0 = +(tans[iL][1] == null ? 1 : tans[iL][1]); var wiL = tans[iL][2] != null ? +tans[iL][2] : w0; tans[iL] = [tans[iL][0], r6(w0 * spanScale(iL, iL + 1, inner[inner.length - 1], tb)), wiL].concat(curvOf(tans[iL])); }
      }
      tans = tans.map(function (tg) {
        if (!tg || tg.length <= 2) return tg;
        var k = curvOf(tg), sym = tg[2] == null || +tg[2] === +tg[1];
        return k.length ? [tg[0], tg[1], sym ? null : tg[2], k[0]] : sym ? tg.slice(0, 2) : tg.slice(0, 3);
      });
      o = { t: 'spline', pts: pts };
      if (any) o.tans = tans;
      if (e.local) o.local = true;
      if (e.showCurvature) o.showCurvature = true;
      if (e.showMinRadius) o.showMinRadius = true;   // lane CV
    }
    if (e.construction) o.construction = true;
    if (e.layer != null) o.layer = e.layer;
    return o;
  }
  // Trim to closest on a spline / ellipse: the span at uv goes, the pieces left keep the relations that still hold on
  // them (their points, a point lying on them), the new ends get a Coincident with what they were cut at, an ellipse's
  // radius dimensions go to its first piece. ctx as trimAt's. Returns { ok, error }.
  function freeTrim(sketch, idx, uv, ctx) {
    var sp = freeSpan(sketch, idx, uv);
    if (!sp) return { ok: false, error: 'That curve cannot be trimmed.' };
    var fc = sp.fc, e = sketch.entities[idx], keep = ctx && ctx.keepConstruction && !e.construction;
    if (keep && sp.whole) { e.construction = true; if (ctx) { ctx.analysis = analyze(sketch); ctx.conflicts = ctx.analysis.conflicts; ctx.redundant = ctx.analysis.redundant; } return { ok: true, kept: true }; }
    var pieces = [];
    if (!sp.whole) {
      if (fc.closed) pieces.push(freePiece(fc, sp.hi, sp.lo + fc.per));
      else {
        if (sp.lo > fc.t0 + 1e-9) pieces.push(freePiece(fc, fc.t0, sp.lo));
        if (sp.hi < fc.t1 - 1e-9) pieces.push(freePiece(fc, sp.hi, fc.t1));
      }
    }
    var before = sketch.entities.slice(), an0 = ctx && ctx.conflicts != null && ctx.redundant != null ? { conflicts: ctx.conflicts, redundant: ctx.redundant } : analyze(sketch);
    sketch.entities = before.slice(0, idx).concat(pieces, before.slice(idx + 1));
    freeAfterTrim(sketch, before, idx, pieces.length, an0, ctx);
    if (keep) {
      var kp = freePiece(fc, sp.lo, sp.hi);
      kp.construction = true;
      var E = sketch.entities, k = E.length, made = [], ka = analyze(sketch);
      E.push(kp);
      ['p1', 'p2'].forEach(function (end) {
        var p = refPoint(E, parseRef(k + '.' + end)), hit = null;
        for (var j = 0; j < k && !hit; j++) pointRefs(sketch, j).forEach(function (q) { if (!hit && !/\.(mid|c)$/.test(q.ref) && len(sub(q.pt, p)) < 1e-6 * Math.max(1, Math.abs(p[0]), Math.abs(p[1]))) hit = q.ref; });
        if (hit) { var rel = { type: 'coincident', refs: [k + '.' + end, hit] }; (sketch.rels = sketch.rels || []).push(rel); made.push(rel); }
      });
      solve(sketch);
      var an = made.length ? dropRedundant(sketch, made, ka) : analyze(sketch);
      if (ctx) { ctx.analysis = an; ctx.conflicts = an.conflicts; ctx.redundant = an.redundant; }
    }
    return { ok: true };
  }
  // rfAK: Split Entities on a spline (a style spline too) at the points pts: an open one at one or more points, a closed
  // one at two or more (as a circle). The pieces are freePiece's (a style spline's exactly its own Bézier sub-spans; a
  // spline's through its own points, each cut end leaving along the original curve: both exactly the curve it was), in
  // order along the curve at idx, idx + 1, …; the relations and dimensions follow them as Trim keeps them
  // (freeAfterTrim), and consecutive pieces meet end to end with Coincident. The join stays smooth as SolidWorks keeps
  // it: style spline pieces get a Tangent (their end legs line up as the vertices move); a spline's pieces leave the
  // split point with one driving tangent each, the same angle (a Tangent there would only repeat it: redundant). On a
  // failure the sketch is exactly as it was. Returns { ok, pieces: [indices], error }.
  function freeSplit(sketch, idx, pts) {
    var E0 = sketch.entities, e = E0[idx], fc = e && e.t === 'spline' ? freeCurve(e) : null;
    if (!fc) return { ok: false, error: 'Split Entities splits lines, arcs, circles and splines.' };
    var span = fc.t1 - fc.t0, tol = 1e-6 * span, ts = [];
    (pts || []).forEach(function (p) {
      var t = freeClosest(fc, p).t;
      if (fc.closed) t = fc.t0 + ((((t - fc.t0) % fc.per) + fc.per) % fc.per);
      else if (t <= fc.t0 + tol || t >= fc.t1 - tol) return;   // at an open end: nothing to split
      if (!ts.some(function (q) { var d = Math.abs(q - t); return d < tol || (fc.closed && fc.per - d < tol); })) ts.push(t);
    });
    ts.sort(function (a, b) { return a - b; });
    if (fc.closed ? ts.length < 2 : !ts.length) return { ok: false, error: fc.closed ? 'A closed spline is split at two points: click a second point on it.' : 'Click inside the spline, away from its ends.' };
    var saved = JSON.stringify({ entities: sketch.entities, rels: sketch.rels || null, dims: sketch.dims || null }), an0 = analyze(sketch), pieces = [], k;
    try {
      var bounds = fc.closed ? ts.concat([ts[0] + fc.per]) : [fc.t0].concat(ts, [fc.t1]);
      for (k = 0; k + 1 < bounds.length; k++) pieces.push(freePiece(fc, bounds[k], bounds[k + 1]));
      var before = E0.slice();
      sketch.entities = before.slice(0, idx).concat(pieces, before.slice(idx + 1));
      freeAfterTrim(sketch, before, idx, pieces.length, an0, null);
      var made = [], idxs = pieces.map(function (q, j) { return idx + j; });
      sketch.rels = sketch.rels || [];
      for (k = 0; k < idxs.length; k++) {
        if (k + 1 === idxs.length && !fc.closed) break;
        var a = idxs[k], b = idxs[(k + 1) % idxs.length];
        // freeAfterTrim may have tied the new ends to something there already: the join is still made explicit
        var co = { type: 'coincident', refs: [a + '.p2', b + '.p1'] }, tg = { type: 'tangent', refs: [String(a), String(b)] };
        sketch.rels.push(co); made.push(co);
        if (e.style && relEquation(sketch.entities, tg, sketch.rels)) { sketch.rels.push(tg); made.push(tg); }
      }
      solve(sketch);
      var an = analyze(sketch);
      // what the split made that over-defines the sketch (a Coincident freeAfterTrim's ties repeat) goes, last first
      for (k = made.length - 1; k >= 0 && (an.redundant > an0.redundant || an.conflicts > an0.conflicts); k--) {
        var at = sketch.rels.indexOf(made[k]);
        if (at < 0) continue;
        sketch.rels.splice(at, 1);
        var a2 = analyze(sketch);
        if (a2.redundant < an.redundant || a2.conflicts < an.conflicts) an = a2; else sketch.rels.splice(at, 0, made[k]);
      }
      if (!sketch.rels.length) delete sketch.rels;
      if (an.conflicts > an0.conflicts) throw new Error('Splitting there would leave the sketch unsolvable: nothing was split.');
    } catch (er) {
      var o = JSON.parse(saved);
      sketch.entities = o.entities; if (o.rels) sketch.rels = o.rels; else delete sketch.rels; if (o.dims) sketch.dims = o.dims; else delete sketch.dims;
      return { ok: false, error: er.message || String(er) };
    }
    return { ok: true, pieces: pieces.map(function (q, j) { return idx + j; }) };
  }
  // the relations and dimensions of free entity idx of `before` follow its nPieces pieces (now at idx …)
  function freeAfterTrim(sketch, before, idx, nPieces, an0, ctx) {
    var E = sketch.entities, old = before[idx], pieces = [];
    for (var q = 0; q < nPieces; q++) pieces.push(idx + q);
    var shift = nPieces - 1;
    function mapIdx(j) { return j < idx ? j : j > idx ? j + shift : -1; }
    function tolOf(p) { return 1e-6 * Math.max(1, Math.abs(p[0]), Math.abs(p[1])); }
    // a point of the old curve: the same point on a piece
    function onPiece(r) {
      var P = refPoint(before, r);
      if (!P) return null;
      for (var a = 0; a < pieces.length; a++) {
        var prs = pointRefs(sketch, pieces[a]);
        for (var b = 0; b < prs.length; b++) if (!/\.mid$/.test(prs[b].ref) && len(sub(prs[b].pt, P)) < tolOf(P) && (r.s !== 'c' || /\.c$/.test(prs[b].ref))) return prs[b].ref;
      }
      return null;
    }
    // the piece a point lies on (within its extent), for a point-on-curve Coincident
    function pieceUnder(P) {
      for (var a = 0; a < pieces.length; a++) { var fp = freeCurve(E[pieces[a]]), c = fp && freeClosest(fp, P); if (c && !c.end && c.d < 1e-5 * Math.max(1, Math.abs(P[0]), Math.abs(P[1]))) return String(pieces[a]); }
      return null;
    }
    var rels = [], moved = [];
    (sketch.rels || []).forEach(function (rel) {
      var ok = true, touches = false;
      var refs = rel.refs.map(function (r) {
        var p = parseRef(r);
        if (!p || p.o) return r;
        if (p.e !== idx) return String(mapIdx(p.e)) + String(r).slice(String(p.e).length);
        touches = true;
        if (p.s !== null) { var on = onPiece(p); if (!on) ok = false; return on; }
        // the whole curve: only a point lying on it keeps its relation, on the piece it lies on
        if (rel.type !== 'coincident' || rel.refs.length !== 2) { ok = false; return null; }
        var other = rel.refs[0] === r ? rel.refs[1] : rel.refs[0], op = parseRef(other), P = op && refPoint(before, op);
        var pu = P ? pieceUnder(P) : null;
        if (!pu) ok = false;
        return pu;
      });
      if (!ok) return;
      var nr = clone(rel); nr.refs = refs;
      rels.push(nr);
      if (touches) moved.push(nr);
    });
    // the new ends: Coincident with what they were cut at (an end point there, or the cutting curve)
    pieces.forEach(function (pi) {
      [1, 2].forEach(function (k) {
        var pt = refPoint(E, { e: pi, s: 'p', k: k });
        if (!pt) return;
        var was = [1, 2].some(function (k0) { var q0 = refPoint(before, { e: idx, s: 'p', k: k0 }); return q0 && len(sub(q0, pt)) < tolOf(pt); });
        if (was) return;
        var hit = null;
        for (var j = 0; j < E.length && !hit; j++) {
          if (pieces.indexOf(j) >= 0) continue;
          pointRefs(sketch, j).forEach(function (pr) { if (!hit && !/\.(mid|c)$/.test(pr.ref) && len(sub(pr.pt, pt)) < 1e-6 * Math.max(1, Math.abs(pt[0]), Math.abs(pt[1]))) hit = pr.ref; });
        }
        var on = hit || onCurveRef(sketch, -1, pt, 1e-6 * Math.max(1, Math.abs(pt[0]), Math.abs(pt[1])), pieces);
        if (!on) return;
        var ce = { type: 'coincident', refs: [pi + '.p' + k, on] };
        rels.push(ce); moved.push(ce);
      });
    });
    sketch.rels = rels;
    if (!rels.length) delete sketch.rels;
    if (sketch.dims) {
      sketch.dims = sketch.dims.filter(function (d) {
        if (d.e !== idx) { var m = mapIdx(d.e); if (m < 0) return false; d.e = m; return true; }
        if ((d.k === 'rx' || d.k === 'ry') && pieces.length && E[pieces[0]].t === 'pellipse') { d.e = pieces[0]; return true; }
        return false;
      });
      if (!sketch.dims.length) delete sketch.dims;
    }
    clean(sketch);
    var an1 = analyze(sketch);
    if (an1.conflicts > an0.conflicts || an1.redundant > an0.redundant) {
      // what the trim moved or made that over-defines the sketch goes, last first
      for (var m = moved.length - 1; m >= 0 && (an1.conflicts > an0.conflicts || an1.redundant > an0.redundant); m--) {
        var at = sketch.rels ? sketch.rels.indexOf(moved[m]) : -1;
        if (at < 0) continue;
        sketch.rels.splice(at, 1);
        an1 = analyze(sketch);
      }
      if (sketch.rels && !sketch.rels.length) delete sketch.rels;
    }
    solve(sketch);
    an1 = analyze(sketch);
    if (ctx) { ctx.analysis = an1; ctx.conflicts = an1.conflicts; ctx.redundant = an1.redundant; }
  }
  // Extend Entities on a partial ellipse or an open spline: the end nearest uv runs on to the first entity in its way
  // (a partial ellipse round its ellipse; a spline along its end span carried on, the point where it lands becoming
  // its new end point). { end, from, to, a (partial ellipse: the new end angle, degrees) } or null.
  function freeExtendTarget(sketch, i, uv) {
    var E = sketch.entities, e = E[i];
    if (!e || (e.t !== 'spline' && e.t !== 'pellipse') || (e.t === 'spline' && e.closed)) return null;
    var fc = freeCurve(e);
    if (!fc) return null;
    var q1 = refPoint(E, { e: i, s: 'p', k: 1 }), q2 = refPoint(E, { e: i, s: 'p', k: 2 });
    var end = len(sub(uv, q1)) <= len(sub(uv, q2)) ? 'p1' : 'p2', from = end === 'p1' ? q1 : q2;
    // the carried-on curve: a whole turn of the ellipse, or the end span run on three times its length
    var ext;
    if (e.t === 'pellipse') {
      var sw = fc.t1 - fc.t0, rest = 2 * Math.PI - sw;
      if (rest < 1e-9) return null;
      ext = end === 'p2' ? { t0: fc.t1, t1: fc.t1 + rest } : { t0: fc.t0 - rest, t1: fc.t0 };
    } else { var rch = fc.reach || 3; ext = end === 'p2' ? { t0: fc.t1, t1: fc.t1 + rch } : { t0: fc.t0 - rch, t1: fc.t0 }; }
    var xc = { e: e, t0: ext.t0, t1: ext.t1, closed: false, per: fc.per, n: 96, pt: fc.pt, d1: fc.d1 }, sm = freeSamples(xc), best = null;
    E.forEach(function (o, j) {
      if (j === i || !o || o.t === 'point' || tSkipped(o)) return;
      freeCutters(o).forEach(function (q) {
        freeHits(xc, q, sm).forEach(function (t) {
          var d = end === 'p2' ? t - ext.t0 : ext.t1 - t;
          if (d > 1e-9 && (!best || d < best.d)) best = { d: d, t: t };
        });
      });
    });
    if (!best) return null;
    var to = fc.pt(best.t), out = { end: end, from: from, to: to, t: best.t };
    if (e.t === 'pellipse') out.a = best.t / D2R;
    return out;
  }
  function freeExtend(sketch, i, uv) {
    var E = sketch.entities, e = E[i], tg = freeExtendTarget(sketch, i, uv);
    if (!tg) return { ok: false, error: 'Nothing to extend to in that direction.' };
    var endRef = i + '.' + tg.end;
    if (endJoined(sketch, endRef)) return { ok: false, error: 'That end is joined to other geometry: only a free end can be extended.' };
    var saved = tSave(sketch), before = analyze(sketch);
    dropEndCoincidents(sketch, [endRef]);
    if (e.t === 'pellipse') { if (tg.end === 'p2') e.a1 = tg.a; else e.a0 = tg.a; normArc(e); }
    else if (e.style) styleRegrow(sketch, i, tg.end === 'p2' ? 0 : tg.t, tg.end === 'p2' ? tg.t : 1, tg.end);   // rfAH
    else {
      // the old end stays as a spline point; its relations stay on it (renumbered when the new point goes first)
      var P = [Math.round(tg.to[0] * 1e6) / 1e6, Math.round(tg.to[1] * 1e6) / 1e6];
      if (tg.end === 'p2') { e.pts.push(P); if (e.tans) e.tans.push(null); }
      else {
        e.pts.unshift(P); if (e.tans) e.tans.unshift(null);
        (sketch.rels || []).forEach(function (rel) { rel.refs = rel.refs.map(function (r) { var p = parseRef(r); return p && !p.o && p.e === i && p.s === 'v' ? i + '.v' + (p.k + 1) : r; }); });
      }
      var n = e.pts.length;
      (sketch.rels || []).forEach(function (rel) { rel.refs = rel.refs.map(function (r) { return r === i + '.' + (tg.end === 'p2' ? 'p2' : 'p1') ? i + '.v' + (tg.end === 'p2' ? n - 2 : 1) : r; }); });
    }
    var to = refPoint(sketch.entities, parseRef(endRef)), tol = 1e-6 * Math.max(1, Math.abs(to[0]), Math.abs(to[1])), at = null;
    for (var j = 0; j < sketch.entities.length && !at; j++) {
      if (j === i) continue;
      pointRefs(sketch, j).forEach(function (pr) { if (!at && !/\.(mid|c)$/.test(pr.ref) && len(sub(pr.pt, to)) < tol) at = pr.ref; });
    }
    at = at || onCurveRef(sketch, i, to, tol);
    if (at) {
      (sketch.rels = sketch.rels || []).push({ type: 'coincident', refs: [endRef, at] });
      if (analyze(sketch).rels[sketch.rels.length - 1] !== 'ok') { sketch.rels.pop(); if (!sketch.rels.length) delete sketch.rels; at = null; }
    }
    var res = solve(sketch), an = analyze(sketch);
    if (!res.ok || an.conflicts > before.conflicts) { tRestore(sketch, saved); return { ok: false, error: 'Extending conflicts with the sketch\'s relations or dimensions.' }; }
    return { ok: true, end: tg.end, to: tg.to, at: at };
  }

  // Offset Entities on a spline or an ellipse (sketch-refine): the offset curve is no spline or ellipse, so the copy is a
  // spline through the offset points of the curve (four to a span, or 24 round an
  // ellipse), within about a hundredth of the true offset for offsets well under the curve's radius. d > 0 goes out: away
  // from what a closed curve encloses, or what an open one bends round (as Offset Entities' chains). null when the
  // offset folds over (the distance is more than the curve's radius somewhere).
  function freeOffset(e, d) {
    var fc = freeCurve(e);
    if (!fc) return null;
    var ts = [], k, n = e.t === 'spline' ? (fc.style ? 4 * Math.max(4, e.pts.length) : fc.t1 * 4) : 24;   // rfAH: a style spline: 4 per control vertex
    for (k = 0; k <= n; k++) ts.push(fc.t0 + (fc.t1 - fc.t0) * k / n);
    if (fc.closed) ts.pop();
    var sm = freeSamples(fc), area = 0;
    for (k = 0; k < sm.length; k++) { var p = sm[k].p, q = sm[(k + 1) % sm.length].p; area += p[0] * q[1] - q[0] * p[1]; }
    var side = area > 0 ? -1 : 1, pts = [];
    for (k = 0; k < ts.length; k++) {
      var P = fc.pt(ts[k]), u = unit(fc.d1(ts[k]));
      if (!(len(u) > 0.5)) return null;
      pts.push([Math.round((P[0] - u[1] * side * d) * 1e6) / 1e6, Math.round((P[1] + u[0] * side * d) * 1e6) / 1e6]);
    }
    // folded over: an offset chord running against the curve
    for (k = 0; k + 1 < ts.length; k++) if (dot(sub(pts[k + 1], pts[k]), sub(fc.pt(ts[k + 1]), fc.pt(ts[k]))) <= 0) return null;
    var o = { t: 'spline', pts: pts };
    if (fc.closed) o.closed = true;
    if (e.construction) o.construction = true;
    return o;
  }

  // ------------------------------------------------------------------ r13/trim13: Trim Entities modes (SolidWorks)
  // Power trim (a trail dragged across entities, an end dragged to extend), Corner, Trim away inside / outside and Trim
  // to closest. The intersection maths is Kernel.trimEntity's (same primitives, same tolerances), so the span a hover
  // highlights is the span a click or a crossing removes.
  var TAU = 2 * Math.PI;
  function tAngIn(a, a0, a1) {
    var t = a;
    while (t < a0 - 1e-9) t += TAU;
    while (t >= a0 + TAU - 1e-9) t -= TAU;
    return t <= a1 + 1e-9 ? t : null;
  }
  // parameters on primitive p (a segment: t in [0, 1]; an arc: the angle) where primitive q crosses it
  function tPrimHits(p, q) {
    var out = [], eps = 1e-9;
    if (p.kind === 'seg' && q.kind === 'seg') {
      var d1 = sub(p.b, p.a), d2 = sub(q.b, q.a), den = crs(d1, d2);
      if (Math.abs(den) < eps) return out;
      var w = sub(q.a, p.a), t = crs(w, d2) / den, u = crs(w, d1) / den;
      if (t > -eps && t < 1 + eps && u > -eps && u < 1 + eps) out.push(t);
      return out;
    }
    if (p.kind === 'seg') {
      var d = sub(p.b, p.a), f = sub(p.a, q.c), A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - q.r * q.r, disc = B * B - 4 * A * C;
      if (A < eps) return out;
      // r15/trimtan15: a line tangent to the circle touches it at one point. Its discriminant comes out within
      // rounding of zero, often slightly negative (two lines drawn tangent to a circle found no crossing, so nothing
      // split the circle and a trim deleted all of it): a line within 1e-7 of touching counts as touching, once.
      if (disc < 0) { if (Math.sqrt(q.r * q.r - disc / (4 * A)) - q.r < 1e-7 * Math.max(1, q.r)) disc = 0; else return out; }
      var sq = Math.sqrt(disc);
      (sq / (2 * A) < 1e-9 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]).forEach(function (t) {
        if (t < -eps || t > 1 + eps) return;
        var x = p.a[0] + d[0] * t, y = p.a[1] + d[1] * t;
        if (tAngIn(Math.atan2(y - q.c[1], x - q.c[0]), q.a0, q.a1) != null) out.push(t);
      });
      return out;
    }
    if (q.kind === 'seg') {
      tPrimHits(q, p).forEach(function (t) {
        var x = q.a[0] + (q.b[0] - q.a[0]) * t, y = q.a[1] + (q.b[1] - q.a[1]) * t, a = tAngIn(Math.atan2(y - p.c[1], x - p.c[0]), p.a0, p.a1);
        if (a != null) out.push(a);
      });
      return out;
    }
    var dx = q.c[0] - p.c[0], dy = q.c[1] - p.c[1], D = Math.hypot(dx, dy);
    if (D < eps || D > p.r + q.r + eps || D < Math.abs(p.r - q.r) - eps) return out;
    var a2 = (p.r * p.r - q.r * q.r + D * D) / (2 * D), h = Math.sqrt(Math.max(0, p.r * p.r - a2 * a2));
    var mx = p.c[0] + dx / D * a2, my = p.c[1] + dy / D * a2;
    [[mx - h * dy / D, my + h * dx / D], [mx + h * dy / D, my - h * dx / D]].forEach(function (pt, i) {
      if (i === 1 && h < eps) return;
      if (tAngIn(Math.atan2(pt[1] - q.c[1], pt[0] - q.c[0]), q.a0, q.a1) == null) return;
      var a = tAngIn(Math.atan2(pt[1] - p.c[1], pt[0] - p.c[0]), p.a0, p.a1);
      if (a != null) out.push(a);
    });
    return out;
  }
  function tPrimAt(p, uv) {
    if (p.kind === 'seg') {
      var d = sub(p.b, p.a), L2 = dot(d, d), t = L2 > 1e-12 ? Math.max(0, Math.min(1, dot(sub(uv, p.a), d) / L2)) : 0;
      return { t: t, dist: Math.hypot(uv[0] - p.a[0] - d[0] * t, uv[1] - p.a[1] - d[1] * t) };
    }
    var a = tAngIn(Math.atan2(uv[1] - p.c[1], uv[0] - p.c[0]), p.a0, p.a1);
    if (a == null) {
      var e0 = tPrimPt(p, p.a0), e1 = tPrimPt(p, p.a1), d0 = len(sub(uv, e0)), d1 = len(sub(uv, e1));
      return d0 < d1 ? { t: p.a0, dist: d0 } : { t: p.a1, dist: d1 };
    }
    return { t: a, dist: Math.abs(len(sub(uv, p.c)) - p.r) };
  }
  function tPrimPt(p, t) { return p.kind === 'seg' ? [p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t] : [p.c[0] + p.r * Math.cos(t), p.c[1] + p.r * Math.sin(t)]; }
  // sketch points along primitive p from parameter lo to hi (a segment: its two ends; an arc: about every 4 degrees)
  function tPrimPts(p, lo, hi) {
    if (p.kind === 'seg') return [tPrimPt(p, lo), tPrimPt(p, hi)];
    var n = Math.max(2, Math.ceil(Math.abs(hi - lo) / (4 * D2R))), out = [];
    for (var k = 0; k <= n; k++) out.push(tPrimPt(p, lo + (hi - lo) * k / n));
    return out;
  }
  function tPrims(e) { if (e && e.t === 'line' && e.infinite) { var cs = carrierSeg(e); return [{ kind: 'seg', a: cs.a, b: cs.b }]; } return e && e.t !== 'point' && K && K.entityPrimitives ? K.entityPrimitives(e) : []; }
  // sketch-refine: the segment that stands for a line in intersections: the line itself, or for an infinite line a
  // segment a million times its defining length (and at least 10⁶) each way, through its two points
  function carrierSeg(e) {
    var a = [e.x1, e.y1], b = [e.x2, e.y2];
    if (!e.infinite) return { a: a, b: b };
    var d = sub(b, a), L = len(d), sd = infSides(e);
    if (L < 1e-15) return { a: a, b: b };
    var R = Math.max(1e6, 1e6 * L, 1e3 * Math.max(Math.abs(a[0]), Math.abs(a[1]))) / L;
    return { a: sd.p1 ? [a[0] - d[0] * R, a[1] - d[1] * R] : a, b: sd.p2 ? [b[0] + d[0] * R, b[1] + d[1] * R] : b };
  }
  // the largest coordinate of the sketch's points (1 at least): the trim tolerances follow it
  function tSize(sketch) {
    var m = 1;
    sketch.entities.forEach(function (e, i) { pointRefs(sketch, i).forEach(function (pr) { m = Math.max(m, Math.abs(pr.pt[0]), Math.abs(pr.pt[1])); }); });
    return m;
  }
  // the entity list as Kernel.trimEntity / trimCuts see it: an infinite line (or a ray) stands as the long segment it
  // is drawn as (carrierSeg), marked __for its index, so it cuts along its whole length (sketch-refine)
  // Lane DE: a spline / ellipse other than idx stands as a cut-nothing point: its true crossings and end junctions come
  // in through junctionOpts' cuts (freeJunctions), not through its facets (a line trimmed at a spline ended up to
  // 0.02 in off the curve, then the solve bent it onto the curve)
  function standIn(E, idx) {
    return E.map(function (o, j) {
      if (j !== idx && isFree(o) && freeCurve(o)) return { t: 'point', x: 0, y: 0, __for: j };
      if (j === idx || !o || o.t !== 'line' || !o.infinite) return o; var cs = carrierSeg(o); return { t: 'line', x1: cs.a[0], y1: cs.a[1], x2: cs.b[0], y2: cs.b[1], __for: j };
    });
  }
  // Lane DE: the exact points where the splines / ellipses (other than idx; only those listed) cross entity idx, and
  // their open ends that lie on it within tol (T-junctions)
  function freeJunctions(sketch, idx, tol, only) {
    var E = sketch.entities, prims = tPrims(E[idx]), out = [];
    if (isFree(E[idx]) || !prims.length) return out;
    E.forEach(function (o, j) {
      if (j === idx || !isFree(o) || (only && only.indexOf(j) < 0)) return;
      var fc = freeCurve(o);
      if (!fc) return;
      var sm = freeSamples(fc);
      prims.forEach(function (p) { freeHits(fc, p, sm).forEach(function (t) { out.push(fc.pt(t)); }); });
      if (!fc.closed) [fc.pt(fc.t0), fc.pt(fc.t1)].forEach(function (q) { if (prims.some(function (p) { return tPrimAt(p, q).dist <= tol; })) out.push(q); });
    });
    return out;
  }
  // rfCH: the T-junction options of Kernel.trimCuts for entity idx: tol (floating-point noise: 1e-9 of the sketch's
  // size) and cuts, the points of other entities' ends (and corners) a Coincident holds on the entity: a junction the
  // sketch declares cuts the entity there even when the end is off it by more than noise (an unsolved relation).
  function junctionOpts(sketch, idx, only) {
    var E = sketch.entities, cuts = [], me = String(idx);
    (sketch.rels || []).forEach(function (rel) {
      if (rel.type !== 'coincident' || rel.refs.indexOf(me) < 0) return;
      rel.refs.forEach(function (r) {
        var p = parseRef(r);
        if (!p || p.o || p.e === idx || p.s === null || /^(mid|c)$/.test(p.s) || !E[p.e] || isSlotCentre(E[p.e], p.s) || (only && only.indexOf(p.e) < 0)) return;
        var pt = refPoint(E, p);
        if (pt) cuts.push(pt);
      });
    });
    var o = { tol: 1e-9 * tSize(sketch), cuts: cuts };
    freeJunctions(sketch, idx, o.tol, only).forEach(function (q) { cuts.push(q); });   // lane DE
    if (only) o.only = only;
    return o;
  }
  // rfCK: a slot's (or arc slot's) 'p1' / 'p2' are its cap-arc centres (refPoint: the ends of its centreline), not
  // points on its outline: no end of anything, so no T-junction on an entity through them (a slot has no ends at all).
  // Before, a line through a slot centre (a centreline, or one a Coincident held there) was cut at the centre.
  function isSlotCentre(e, s) { return !!e && (e.t === 'slot' || e.t === 'aslot') && s === 'p'; }
  // rfCH: the end (and corner) refs of other entities that lie on entity idx within tol, away from its own ends: the
  // true T-junctions on it (an end at its end is a corner, not a junction; a sketch point or a text is no end)
  function endsOn(sketch, idx, tol) {
    var E = sketch.entities, e = E[idx], prims = tPrims(e), out = [];
    var own = [refPoint(E, { e: idx, s: 'p', k: 1 }), refPoint(E, { e: idx, s: 'p', k: 2 })].filter(Boolean);
    E.forEach(function (o, j) {
      if (j === idx || !o || o.t === 'point' || o.t === 'text') return;
      pointRefs(sketch, j).forEach(function (pr) {
        if (/\.(mid|c)$/.test(pr.ref) || (isFree(o) && /\.v\d+$/.test(pr.ref)) || (isSlotCentre(o, 'p') && /\.p[12]$/.test(pr.ref))) return;
        if (own.some(function (q) { return len(sub(q, pr.pt)) <= tol; })) return;
        if (prims.some(function (p) { return tPrimAt(p, pr.pt).dist <= tol; })) out.push(pr.ref);
      });
    });
    return out;
  }
  // parameters on primitive k of entity idx where the other entities cut it (only those listed in `only`, if given):
  // where they cross it and, rfCH, where an end of theirs lies on it (Kernel.trimCuts). rfCK: `ends` keeps a crossing at
  // the entity's own end (Trim away inside / outside: a bound through the end is an L corner the entity does meet).
  function tCuts(sketch, idx, k, prim, only, ends) {
    if (!K || !K.trimCuts) return [];
    var o = junctionOpts(sketch, idx, only);
    if (ends) o.ends = true;
    return K.trimCuts(standIn(sketch.entities, idx), idx, k, prim, o);
  }
  // The part of entity idx that Trim to closest removes at uv: { prim, lo, hi (parameters on the primitive), whole }.
  function spanOf(sketch, idx, uv) {
    var E = sketch.entities, e = E[idx], prims = tPrims(e), k = -1, kd = Infinity, kt = 0;
    prims.forEach(function (p, i) { var q = tPrimAt(p, uv); if (q.dist < kd) { kd = q.dist; k = i; kt = q.t; } });
    if (k < 0) return null;
    var prim = prims[k], params = tCuts(sketch, idx, k, prim), lo = null, hi = null;
    params.forEach(function (t) {
      if (t < kt - 1e-7 && (lo == null || t > lo)) lo = t;
      if (t > kt + 1e-7 && (hi == null || t < hi)) hi = t;
    });
    if (prim.full) {
      if (params.length < 2) return { prim: prim, whole: true, lo: 0, hi: TAU };
      if (lo == null) lo = Math.max.apply(null, params) - TAU;
      if (hi == null) hi = Math.min.apply(null, params) + TAU;
      return { prim: prim, whole: false, lo: lo, hi: hi };
    }
    var start = prim.kind === 'arc' ? prim.a0 : 0, end = prim.kind === 'arc' ? prim.a1 : 1, tiny = (end - start) * 1e-6;
    if (lo == null) lo = start;
    if (hi == null) hi = end;
    return { prim: prim, whole: prims.length === 1 && lo - start <= tiny && end - hi <= tiny, lo: lo, hi: hi };
  }
  // The part of entity idx that Trim to closest removes at uv: { idx, pts: sketch points along it, whole }, or null.
  function trimSpan(sketch, idx, uv) {
    if (isFree(sketch.entities[idx])) { var fs = freeSpan(sketch, idx, uv); return fs ? { idx: idx, whole: fs.whole, pts: freePts(fs.fc, fs.lo, fs.hi) } : null; }   // sketch-refine
    var s = spanOf(sketch, idx, uv);
    return s ? { idx: idx, whole: s.whole, pts: tPrimPts(s.prim, s.lo, s.hi) } : null;
  }
  function tRound(e) {
    if (e.t === 'polyline' || e.t === 'spline') e.pts = e.pts.map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; });
    else Object.keys(e).forEach(function (k) { if (typeof e[k] === 'number') e[k] = Math.round(e[k] * 1e4) / 1e4; });
    return e;
  }
  function segDistPt(p, a, b) {
    var d = sub(b, a), L2 = dot(d, d), t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / L2)) : 0;
    return len(sub(p, [a[0] + d[0] * t, a[1] + d[1] * t]));
  }
  // Trim to closest at uv on entity idx (Kernel.trimEntity), a rectangle first becoming four lines; relations and
  // dimensions follow the pieces (afterTrim). Returns { ok, error }.
  // ctx (sketch tools) may also carry the Trim Entities options: keepConstruction (Keep trimmed entities as
  // construction geometry: the part removed stays, as construction) and ignoreConstruction (Ignore trimming of
  // construction geometry: construction entities are left alone; they still cut the others).
  // sketch-refine: Trim on an infinite line (or a ray). The span clicked, between the crossings either side of the click,
  // goes; what is left is a finite line between two crossings, or a ray running on from a crossing (infinite: 'p1' /
  // 'p2', the side it runs on past). A line nothing crosses is deleted. The pieces keep the relations that hold on
  // them (afterTrim: Collinear between two pieces, a point on the line goes with the piece it lies on, Coincident at
  // the new ends). Returns { ok }.
  function infiniteTrim(sketch, idx, uv, ctx) {
    var E = sketch.entities, e = E[idx], side = infSides(e);
    var a = [e.x1, e.y1], d0 = sub([e.x2, e.y2], a), L = len(d0);
    if (L < 1e-15) return { ok: false, error: 'That line has no direction.' };
    var d = [d0[0] / L, d0[1] / L], lo0 = side.p1 ? -Infinity : 0, hi0 = side.p2 ? Infinity : L;
    var hits = (extendTarget(sketch, idx, uv, true) || []).map(function (h) { return dot(sub(h, a), d); })
      .filter(function (t) { return t > lo0 + 1e-9 * L && t < hi0 - 1e-9 * L; }).sort(function (x, y) { return x - y; });
    var su = dot(sub(uv, a), d), lo = lo0, hi = hi0;
    hits.forEach(function (t) { if (t < su && t > lo) lo = t; if (t > su && t < hi) hi = t; });
    function at(t) { return [a[0] + d[0] * t, a[1] + d[1] * t]; }
    function piece(t0, t1) {
      var o;
      if (t0 === -Infinity) { var q = at(t1), r = at(t1 - L); o = { t: 'line', x1: r[0], y1: r[1], x2: q[0], y2: q[1], infinite: 'p1' }; }
      else if (t1 === Infinity) { var q2 = at(t0), r2 = at(t0 + L); o = { t: 'line', x1: q2[0], y1: q2[1], x2: r2[0], y2: r2[1], infinite: 'p2' }; }
      else { var A = at(t0), B = at(t1); o = { t: 'line', x1: A[0], y1: A[1], x2: B[0], y2: B[1] }; }
      if (e.construction) o.construction = true;
      if (e.layer != null) o.layer = e.layer;
      return tRound(o);
    }
    var pieces = [];
    if (lo !== lo0) pieces.push(piece(lo0, lo));
    if (hi !== hi0) pieces.push(piece(hi, hi0));
    var before = E.slice();
    sketch.entities = before.slice(0, idx).concat(pieces, before.slice(idx + 1));
    afterTrim(sketch, before, idx, ctx);
    // the two parts of a line cut in two stay on one line (Collinear), unless that over-defines the sketch
    if (pieces.length === 2 && !(sketch.rels || []).some(function (r) { return r.type === 'collinear' && r.refs.indexOf(String(idx)) >= 0 && r.refs.indexOf(String(idx + 1)) >= 0; })) {
      var an0 = analyze(sketch), col = { type: 'collinear', refs: [String(idx), String(idx + 1)] };
      (sketch.rels = sketch.rels || []).push(col);
      var an1 = analyze(sketch);
      if (an1.redundant > an0.redundant || an1.conflicts > an0.conflicts) { sketch.rels.pop(); if (!sketch.rels.length) delete sketch.rels; an1 = an0; }
      if (ctx) { ctx.analysis = an1; ctx.conflicts = an1.conflicts; ctx.redundant = an1.redundant; }
    }
    return { ok: true };
  }
  // which sides of line e run on for ever: { p1, p2 } (an infinite line: both; a ray: one), or null for a finite line
  function infSides(e) {
    if (!e || e.t !== 'line' || !e.infinite) return null;
    return e.infinite === 'p1' ? { p1: true, p2: false } : e.infinite === 'p2' ? { p1: false, p2: true } : { p1: true, p2: true };
  }
  function trimAt(sketch, idx, uv, ctx) {
    var e = sketch.entities[idx];
    if (!e || e.t === 'point') return { ok: false, error: 'Nothing to trim there.' };
    if (ctx && ctx.ignoreConstruction && e.construction) return { ok: false, ignored: true, error: 'Construction geometry is not trimmed (Ignore trimming of construction geometry).' };
    if (e.t === 'rect' || e.t === 'crect') {
      explodeRect(sketch, idx);
      if (ctx) ctx.conflicts = null;
      var bi = idx, bd = Infinity;
      for (var k = 0; k < 4; k++) { var l = sketch.entities[idx + k], d = segDistPt(uv, [l.x1, l.y1], [l.x2, l.y2]); if (d < bd) { bd = d; bi = idx + k; } }
      idx = bi;
    }
    // rfAF: a slot (straight or arc) a script made is first drawn as SolidWorks draws it (explodeSlot: sides / arcs,
    // construction centerline, relations; its dimensions follow), then the side or end arc picked is trimmed
    if ((e.t === 'slot' || e.t === 'aslot') && explodeSlot(sketch, idx) === idx) {
      if (ctx) ctx.conflicts = null;
      var si = idx, sd = Infinity;
      for (var q = 0; q < 4; q++) { var pe = sketch.entities[idx + q], pd = tPrims(pe).reduce(function (m, p) { return Math.min(m, tPrimAt(p, uv).dist); }, Infinity); if (pd < sd) { sd = pd; si = idx + q; } }
      idx = si;
    }
    if (isFree(sketch.entities[idx])) return freeTrim(sketch, idx, uv, ctx);   // sketch-refine
    if (infSides(sketch.entities[idx])) return infiniteTrim(sketch, idx, uv, ctx);   // sketch-refine
    var keep = ctx && ctx.keepConstruction && !sketch.entities[idx].construction ? spanOf(sketch, idx, uv) : null;
    if (keep && sketch.entities[idx].layer != null) keep.layer = sketch.entities[idx].layer;
    // a whole entity (nothing crosses it) becomes construction, keeping its relations and dimensions
    if (keep && keep.whole) { sketch.entities[idx].construction = true; if (ctx) { ctx.analysis = analyze(sketch); ctx.conflicts = ctx.analysis.conflicts; ctx.redundant = ctx.analysis.redundant; } return { ok: true, kept: true }; }
    var before = sketch.entities.slice(), out;
    // sketch-refine: infinite lines cut as the lines they are (Kernel.trimEntity sees the segment between their points);
    // rfCH: an end another entity has on this one (held there, or on it within noise) cuts it too (junctionOpts)
    var jx = junctionOpts(sketch, idx), jEnds = endsOn(sketch, idx, jx.tol);
    try { out = K.trimEntity(standIn(sketch.entities, idx), idx, uv, jx); } catch (err) { return { ok: false, error: err.message }; }
    out = out.map(function (o) { return o && o.__for != null ? before[o.__for] : o; });
    sketch.entities = out.map(tRound);
    afterTrim(sketch, before, idx, ctx, jEnds);
    if (keep) keptPiece(sketch, keep, ctx);
    return { ok: true };
  }
  // The trimmed-off span as a construction line / arc, its ends Coincident with the points left where it was cut.
  function spanEntity(prim, lo, hi) {
    if (prim.kind === 'seg') { var a = tPrimPt(prim, lo), b = tPrimPt(prim, hi); return { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; }
    return normArc({ t: 'arc', cx: prim.c[0], cy: prim.c[1], r: prim.r, a0: lo / D2R, a1: hi / D2R });
  }
  function keptPiece(sketch, sp, ctx) {
    var o = tRound(spanEntity(sp.prim, sp.lo, sp.hi)), E = sketch.entities, an0 = analyze(sketch), made = [];
    o.construction = true;
    if (sp.layer != null) o.layer = sp.layer;
    E.push(o);
    var k = E.length - 1;
    ['p1', 'p2'].forEach(function (end) {
      var p = endOf(o, end), hit = null, bd = 1e-3;
      for (var j = 0; j < k; j++) pointRefs(sketch, j).forEach(function (q) { var dd = len(sub(q.pt, p)); if (!/\.(mid|c)$/.test(q.ref) && dd < bd) { bd = dd; hit = q.ref; } });
      if (hit) { var rel = { type: 'coincident', refs: [k + '.' + end, hit] }; (sketch.rels = sketch.rels || []).push(rel); made.push(rel); }
    });
    solve(sketch);
    var an = made.length ? dropRedundant(sketch, made, an0) : analyze(sketch);
    if (ctx) { ctx.analysis = an; ctx.conflicts = an.conflicts; ctx.redundant = an.redundant; }
    return k;
  }
  // rfCY: withSkip(skip, fn) runs fn with skip(entity) -> true leaving entities out of Power trim's trail (trailHits)
  // and out of Extend's targets (extendTarget, freeExtendTarget): the sketch UI passes "on a hidden layer", which the
  // user cannot see. Outside withSkip nothing is left out.
  var tSkip = null;
  function tSkipped(e) { return !!(tSkip && e && tSkip(e)); }
  function withSkip(skip, fn) { var s0 = tSkip; tSkip = typeof skip === 'function' ? skip : null; try { return fn(); } finally { tSkip = s0; } }
  // The entities the straight trail a -> b crosses, the first crossing of each, nearest a first: [{ i, t, pt }].
  function trailHits(sketch, a, b) {
    var seg = { kind: 'seg', a: a, b: b }, out = [];
    var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    sketch.entities.forEach(function (e, i) {
      if (!e || e.t === 'point' || tSkipped(e)) return;   // (rfCY: a hidden layer's entities are not trimmed by the trail)
      // a cheap box test first: most entities are nowhere near one mouse move's worth of trail
      if (e.t === 'line' && (Math.max(e.x1, e.x2) < x0 || Math.min(e.x1, e.x2) > x1 || Math.max(e.y1, e.y2) < y0 || Math.min(e.y1, e.y2) > y1)) return;
      if ((e.t === 'circle' || e.t === 'arc') && (e.cx + e.r < x0 || e.cx - e.r > x1 || e.cy + e.r < y0 || e.cy - e.r > y1)) return;
      var best = null;
      tPrims(e).forEach(function (q) { tPrimHits(seg, q).forEach(function (t) { if (best == null || t < best) best = t; }); });
      if (best != null) out.push({ i: i, t: best, pt: tPrimPt(seg, best) });
    });
    out.sort(function (p, q) { return p.t - q.t; });
    return out;
  }
  // Power trim: each entity segment the trail a -> b crosses is trimmed away at its neighbouring intersections (Trim to
  // closest at the crossing), in the order the trail meets them; an entity nothing else crosses is deleted. onFirst()
  // runs before the first change (the caller's undo step). Returns how many segments went.
  function powerTrim(sketch, a, b, onFirst, ctx) {
    var n = 0, s = a, started = false, tiny = 1e-9 * Math.max(1, Math.abs(a[0]), Math.abs(a[1]), Math.abs(b[0]), Math.abs(b[1]));
    for (var guard = 0; guard < 64; guard++) {
      var L = len(sub(b, s));
      if (L <= tiny) break;
      var hs = trailHits(sketch, s, b), h = null;
      // (sketch tools) Ignore trimming of construction geometry: the trail passes over construction entities
      for (var k = 0; k < hs.length && !h; k++) if (hs[k].t * L > tiny && !(ctx && ctx.ignoreConstruction && sketch.entities[hs[k].i].construction)) h = hs[k];
      if (!h) break;
      if (!started && onFirst) onFirst();
      started = true;
      if (trimAt(sketch, h.i, h.pt, ctx).ok) n++;
      s = h.pt;
    }
    return n;
  }
  // Is the end endRef ('3.p2') joined to another sketch point (a Coincident with a point, not a point-on-curve one)?
  function endJoined(sketch, endRef, except) {
    return (sketch.rels || []).some(function (rel) {
      return rel.type === 'coincident' && rel.refs.indexOf(endRef) >= 0 && rel.refs.some(function (r) { return r !== endRef && r !== except && refKind(sketch.entities, parseRef(r)) === 'point'; });
    });
  }
  function dropEndCoincidents(sketch, refs) {
    if (!sketch.rels) return;
    sketch.rels = sketch.rels.filter(function (rel) { return !(rel.type === 'coincident' && refs.some(function (r) { return rel.refs.indexOf(r) >= 0; })); });
    if (!sketch.rels.length) delete sketch.rels;
  }
  function tSave(sketch) { return { entities: clone(sketch.entities), rels: sketch.rels ? clone(sketch.rels) : null, dims: sketch.dims ? clone(sketch.dims) : null }; }
  function tRestore(sketch, s) {
    sketch.entities = s.entities;
    if (s.rels) sketch.rels = s.rels; else delete sketch.rels;
    if (s.dims) sketch.dims = s.dims; else delete sketch.dims;
  }
  // Power trim's extend: the free end of line or arc i that is near the press. Begin it with extendBegin (the end's
  // point-on-curve Coincidents go, it leaves that curve), move it with extendMove, and finish with extendEnd, which adds
  // a Coincident where it lands on another entity and solves (everything goes back on a conflict).
  function extendBegin(sketch, i, end) {
    var e = sketch.entities[i], endRef = i + '.' + end;
    if (!e || (e.t !== 'line' && e.t !== 'arc') || (infSides(e) && infSides(e)[end]) || endJoined(sketch, endRef)) return null;
    var st = { i: i, end: end, endRef: endRef, saved: tSave(sketch), conflicts: analyze(sketch).conflicts, sweep: e.a1 - e.a0, ang: null, hits: extendTarget(sketch, i, [0, 0], true) || [] };
    if (e.t === 'arc') st.ang = end === 'p2' ? e.a1 : e.a0;
    dropEndCoincidents(sketch, [endRef]);
    return st;
  }
  // move the end towards uv (a line along its direction, an arc round its circle); snap: a carrier crossing to land
  // on exactly (from st.hits), or null. Returns the end's new point.
  function extendMove(sketch, st, uv, snap) {
    var e = sketch.entities[st.i];
    if (e.t === 'line') {
      var fix = st.end === 'p1' ? [e.x2, e.y2] : [e.x1, e.y1], mv = st.end === 'p1' ? [e.x1, e.y1] : [e.x2, e.y2], d = sub(mv, fix), L = len(d);
      if (L < 1e-12) return mv;
      d = [d[0] / L, d[1] / L];
      var t = Math.max(dot(sub(snap || uv, fix), d), 1e-3 * Math.max(1, Math.abs(fix[0]), Math.abs(fix[1])));
      var p = [fix[0] + d[0] * t, fix[1] + d[1] * t];
      if (st.end === 'p1') { e.x1 = p[0]; e.y1 = p[1]; } else { e.x2 = p[0]; e.y2 = p[1]; }
      return p;
    }
    // an arc: follow the way the cursor sweeps round the centre (no jump where the angle wraps)
    var q = snap || uv, a = Math.atan2(q[1] - e.cy, q[0] - e.cx) / D2R, dA = ((a - st.ang) % 360 + 540) % 360 - 180;
    var sign = st.end === 'p2' ? 1 : -1, sw = Math.max(0.5, Math.min(359.5, st.sweep + sign * dA));
    st.sweep = sw;
    if (st.end === 'p2') e.a1 = e.a0 + sw; else e.a0 = e.a1 - sw;
    st.ang = st.end === 'p2' ? e.a1 : e.a0;
    return [e.cx + e.r * Math.cos(st.ang * D2R), e.cy + e.r * Math.sin(st.ang * D2R)];
  }
  function extendEnd(sketch, st, landed) {
    var E = sketch.entities, e = E[st.i], at = null;
    if (landed) {
      var to = refPoint(E, parseRef(st.endRef)), tol = 1e-7 * Math.max(1, Math.abs(to[0]), Math.abs(to[1]));
      for (var j = 0; j < E.length && !at; j++) {
        if (j === st.i) continue;
        pointRefs(sketch, j).forEach(function (pr) { if (!at && !/\.(mid|c)$/.test(pr.ref) && Math.abs(pr.pt[0] - to[0]) < tol && Math.abs(pr.pt[1] - to[1]) < tol) at = pr.ref; });
      }
      at = at || onCurveRef(sketch, st.i, to, 1e-6 * Math.max(1, Math.abs(to[0]), Math.abs(to[1])));
      if (at) {
        (sketch.rels = sketch.rels || []).push({ type: 'coincident', refs: [st.endRef, at] });
        if (analyze(sketch).rels[sketch.rels.length - 1] !== 'ok') { sketch.rels.pop(); if (!sketch.rels.length) delete sketch.rels; at = null; }
      }
    }
    var p0 = refPoint(sketch.entities, parseRef(st.endRef)), res = solve(sketch), an = analyze(sketch);
    if (!res.ok || an.conflicts > st.conflicts) { tRestore(sketch, st.saved); return { ok: false, error: 'Extending conflicts with the sketch\'s relations or dimensions.' }; }
    var p1 = refPoint(sketch.entities, parseRef(st.endRef));
    // held: a dimension or relation pulled the end back from where it was dropped
    return { ok: true, at: at, held: len(sub(p1, p0)) > 1e-4 * Math.max(1, Math.abs(p0[0]), Math.abs(p0[1])) };
  }
  // ---- Corner: two lines / arcs are extended or trimmed until they meet, each keeping the side that was clicked
  function tCarrier(e) { return e.t === 'line' ? { kind: 'line', a: [e.x1, e.y1], b: [e.x2, e.y2] } : { kind: 'circle', c: [e.cx, e.cy], r: e.r }; }
  function carrierMeet(A, B) {
    if (A.kind === 'circle' && B.kind === 'line') return carrierMeet(B, A);
    var out = [];
    if (A.kind === 'line' && B.kind === 'line') {
      var d1 = sub(A.b, A.a), d2 = sub(B.b, B.a), den = crs(d1, d2);
      if (Math.abs(den) < 1e-12 * len(d1) * len(d2)) return out;
      var t = crs(sub(B.a, A.a), d2) / den;
      out.push([A.a[0] + d1[0] * t, A.a[1] + d1[1] * t]);
      return out;
    }
    if (A.kind === 'line') {
      var d = sub(A.b, A.a), L = len(d); if (L < 1e-12) return out;
      var u = [d[0] / L, d[1] / L], f = sub(A.a, B.c), b = dot(f, u), c = dot(f, f) - B.r * B.r, disc = b * b - c;
      if (disc < -1e-12 * B.r * B.r) return out;
      var sq = Math.sqrt(Math.max(0, disc));
      [-b - sq, -b + sq].forEach(function (s, i) { if (i === 0 || sq > 1e-12) out.push([A.a[0] + u[0] * s, A.a[1] + u[1] * s]); });
      return out;
    }
    var dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1], D = Math.hypot(dx, dy);
    if (D < 1e-12 || D > A.r + B.r + 1e-9 || D < Math.abs(A.r - B.r) - 1e-9) return out;
    var al = (A.r * A.r - B.r * B.r + D * D) / (2 * D), h = Math.sqrt(Math.max(0, A.r * A.r - al * al)), mx = A.c[0] + dx * al / D, my = A.c[1] + dy * al / D;
    out.push([mx - dy * h / D, my + dx * h / D]);
    if (h > 1e-12) out.push([mx + dy * h / D, my - dx * h / D]);
    return out;
  }
  function tEnds(e) {
    if (e.t === 'line') return [[e.x1, e.y1], [e.x2, e.y2]];
    return [[e.cx + e.r * Math.cos(e.a0 * D2R), e.cy + e.r * Math.sin(e.a0 * D2R)], [e.cx + e.r * Math.cos(e.a1 * D2R), e.cy + e.r * Math.sin(e.a1 * D2R)]];
  }
  // how entity e changes to end at P keeping the side clicked at uv: { end: 'p1' | 'p2', x/y or a }, or null
  function cornerSide(e, P, uv) {
    if (e.t === 'line') {
      var A = [e.x1, e.y1], d = sub([e.x2, e.y2], A), L2 = dot(d, d);
      if (L2 < 1e-18) return null;
      var tP = dot(sub(P, A), d) / L2, tc = dot(sub(uv, A), d) / L2, end = tc <= tP ? 'p2' : 'p1';
      var keep = end === 'p2' ? 0 : 1;
      if (Math.abs(tP - keep) * Math.sqrt(L2) < 1e-9 * Math.max(1, Math.abs(P[0]), Math.abs(P[1]))) return null;
      return { end: end, pt: P };
    }
    var aP = Math.atan2(P[1] - e.cy, P[0] - e.cx) / D2R, ac = Math.atan2(uv[1] - e.cy, uv[0] - e.cx) / D2R;
    function m(x) { return ((x % 360) + 360) % 360; }
    var na1 = e.a0 + m(aP - e.a0), na0 = e.a1 - m(e.a1 - aP), c = [];
    if (na1 - e.a0 > 1e-6) c.push({ end: 'p2', a: na1, keeps: m(ac - e.a0) <= na1 - e.a0 + 1e-9, change: Math.abs(na1 - e.a1) });
    if (e.a1 - na0 > 1e-6) c.push({ end: 'p1', a: na0, keeps: m(ac - na0) <= e.a1 - na0 + 1e-9, change: Math.abs(na0 - e.a0) });
    c.sort(function (p, q) { return (q.keeps - p.keeps) || (p.change - q.change); });
    return c.length ? { end: c[0].end, a: c[0].a, pt: P } : null;
  }
  // { ok, pt, sides: [side of i, side of j] } or { ok: false, error }: what Corner would do (also the hover preview)
  function cornerPlan(sketch, i, uvi, j, uvj) {
    var E = sketch.entities, a = E[i], b = E[j];
    if (i === j) return { ok: false, error: 'Select two different entities.' };
    if (cornerFree(E, i, j)) return freeCornerPlan(sketch, i, uvi, j, uvj);   // sketch-tools2: a spline
    if (!a || !b || (a.t !== 'line' && a.t !== 'arc') || (b.t !== 'line' && b.t !== 'arc')) return { ok: false, error: 'Corner works on lines and arcs.' };
    var pts = carrierMeet(tCarrier(a), tCarrier(b));
    if (!pts.length) return { ok: false, error: 'Those entities cannot meet (parallel, or the circles do not cross).' };
    var ea = tEnds(a), eb = tEnds(b), P = null, bd = Infinity;
    pts.forEach(function (p) {
      var d = Math.min(len(sub(p, ea[0])), len(sub(p, ea[1]))) + Math.min(len(sub(p, eb[0])), len(sub(p, eb[1])));
      if (d < bd) { bd = d; P = p; }
    });
    var si = cornerSide(a, P, uvi), sj = cornerSide(b, P, uvj);
    if (!si || !sj) return { ok: false, error: 'The corner would leave an entity with no length.' };
    return { ok: true, pt: P, sides: [si, sj] };
  }
  function applySide(e, s) {
    if (e.t === 'line') { if (s.end === 'p1') { e.x1 = s.pt[0]; e.y1 = s.pt[1]; } else { e.x2 = s.pt[0]; e.y2 = s.pt[1]; } }
    else if (s.end === 'p1') e.a0 = s.a; else e.a1 = s.a;
    if (e.t === 'arc') { while (e.a0 >= 360) { e.a0 -= 360; e.a1 -= 360; } while (e.a0 < 0) { e.a0 += 360; e.a1 += 360; } }
  }
  // the geometry Corner would give (line / arc copies), for the preview
  function cornerPreview(sketch, i, uvi, j, uvj) {
    var pl = cornerPlan(sketch, i, uvi, j, uvj);
    if (!pl.ok) return null;
    return [i, j].map(function (k, n) { var c = clone(sketch.entities[k]); if (pl.sides[n].free) return freeSideEntity(c, pl.sides[n]); applySide(c, pl.sides[n]); return c; });
  }
  function cornerTrim(sketch, i, uvi, j, uvj) {
    if (cornerFree(sketch.entities, i, j) && i !== j) return freeCornerTrim(sketch, i, uvi, j, uvj);   // sketch-tools2: a spline
    var pl = cornerPlan(sketch, i, uvi, j, uvj);
    if (!pl.ok) return pl;
    var ri = i + '.' + pl.sides[0].end, rj = j + '.' + pl.sides[1].end;
    if (endJoined(sketch, ri, rj) || endJoined(sketch, rj, ri)) return { ok: false, error: 'That end is joined to other geometry: only free ends can make the corner.' };
    var saved = tSave(sketch), c0 = analyze(sketch).conflicts;
    dropEndCoincidents(sketch, [ri, rj]);
    applySide(sketch.entities[i], pl.sides[0]);
    applySide(sketch.entities[j], pl.sides[1]);
    (sketch.rels = sketch.rels || []).push({ type: 'coincident', refs: [ri, rj] });
    var res = solve(sketch), an = analyze(sketch);
    if (!res.ok || an.conflicts > c0) { tRestore(sketch, saved); return { ok: false, error: 'The corner conflicts with the sketch\'s relations or dimensions.' }; }
    return { ok: true, pt: pl.pt };
  }
  // ---- sketch-tools2: Corner with a spline. An open spline's end is cut back to where it meets the other entity, or
  // carried on along its end span to it (as Extend Entities carries a spline: the point where it lands becomes its new
  // end point, the old end stays a spline point); the other entity is a line, an arc or another open spline. Each
  // keeps the side clicked, and the two ends are joined (Coincident).
  // (lane DE: a partial ellipse too: cut back, or run on round its ellipse, as Extend Entities runs it)
  function cornerFree(E, i, j) { return !!((E[i] && (E[i].t === 'spline' || E[i].t === 'pellipse')) || (E[j] && (E[j].t === 'spline' || E[j].t === 'pellipse'))); }
  // the curve Corner follows along an open spline: the spline carried on three spans past each end (a partial
  // ellipse: its whole ellipse, same parameter)
  function cornerReach(fc) {
    if (fc.e.t === 'pellipse') { var w = fc.e; return freeCurve({ t: 'ellipse', cx: w.cx, cy: w.cy, rx: w.rx, ry: w.ry, rot: w.rot }); }
    var r = fc.reach || 3; return { e: fc.e, t0: fc.t0 - r, t1: fc.t1 + r, closed: false, per: fc.per, n: fc.style ? 3 * fc.n : Math.ceil(24 * (fc.t1 - fc.t0 + 6)), pt: fc.pt, d1: fc.d1 }; }
  function freeCornerPlan(sketch, i, uvi, j, uvj) {
    var E = sketch.entities, a = E[i], b = E[j];
    function usable(e) { return !!e && (e.t === 'line' || e.t === 'arc' || e.t === 'pellipse' || (e.t === 'spline' && !e.closed)); }
    if (!usable(a) || !usable(b)) return { ok: false, error: (a && a.t === 'spline' && a.closed) || (b && b.t === 'spline' && b.closed) ? 'A closed spline has no end to make a corner with.' : 'Corner works on lines, arcs, partial ellipses and open splines.' };
    function fr(e) { return e.t === 'spline' || e.t === 'pellipse'; }
    var fa = fr(a) ? freeCurve(a) : null, fb = fr(b) ? freeCurve(b) : null;
    if ((fr(a) && !fa) || (fr(b) && !fb)) return { ok: false, error: 'That curve cannot make a corner.' };
    // where the two meet: a spline carried on past its ends, a line's whole line, an arc's whole circle
    var pts = [], A = fa ? cornerReach(fa) : null, B = fb ? cornerReach(fb) : null;
    if (A && B) freeHits(A, { fc: B }).forEach(function (t) { pts.push(A.pt(t)); });
    else { var F = A || B, o = A ? b : a; freeHits(F, tCarrier(o)).forEach(function (t) { pts.push(F.pt(t)); }); }
    if (!pts.length) return { ok: false, error: 'Those entities cannot meet: the spline carried on along its end span never reaches the other entity.' };
    function ends(e) { return e.t === 'spline' ? [e.pts[0], e.pts[e.pts.length - 1]] : e.t === 'pellipse' ? [refPoint(E, { e: e === a ? i : j, s: 'p', k: 1 }), refPoint(E, { e: e === a ? i : j, s: 'p', k: 2 })] : tEnds(e); }
    var ea = ends(a), eb = ends(b), P = null, bd = Infinity;
    pts.forEach(function (p) {
      var d = Math.min(len(sub(p, ea[0])), len(sub(p, ea[1]))) + Math.min(len(sub(p, eb[0])), len(sub(p, eb[1])));
      if (d < bd) { bd = d; P = p; }
    });
    function side(e, fc, uv) {
      if (!fc) return cornerSide(e, P, uv);
      if (e.t === 'pellipse') {
        // lane DE: P on the ellipse at angle w (from t0 round): inside the arc cuts it back on the side away from the
        // click; past its ends the nearer end runs on round the ellipse to it
        var full = cornerReach(fc), w = fc.t0 + ((((freeClosest(full, P).t - fc.t0) % TAU) + TAU) % TAU), etol = 1e-9;
        if (w <= fc.t1 + etol) {
          var tcl = freeClosest(fc, uv).t, en = tcl <= w ? 'p2' : 'p1';
          if (en === 'p2' ? w <= fc.t0 + etol : w >= fc.t1 - etol) return null;
          var sm = Math.abs(w - (en === 'p2' ? fc.t1 : fc.t0)) <= etol;
          return { free: true, end: en, t: w, pt: P, same: sm, cut: !sm };
        }
        return w - fc.t1 <= fc.t0 + TAU - w ? { free: true, end: 'p2', t: w, pt: P, same: false, cut: false } : { free: true, end: 'p1', t: w - TAU, pt: P, same: false, cut: false };
      }
      var tP = freeClosest(cornerReach(fc), P).t, tc = freeClosest(fc, uv).t, end = tc <= tP ? 'p2' : 'p1', tol = 1e-7 * (fc.t1 - fc.t0);
      if (end === 'p2' ? tP <= fc.t0 + tol : tP >= fc.t1 - tol) return null;   // nothing would be left
      var same = Math.abs(tP - (end === 'p2' ? fc.t1 : fc.t0)) <= tol;
      return { free: true, end: end, t: tP, pt: P, same: same, cut: !same && tP > fc.t0 + tol && tP < fc.t1 - tol };
    }
    var si = side(a, fa, uvi), sj = side(b, fb, uvj);
    if (!si || !sj) return { ok: false, error: 'The corner would leave an entity with no length.' };
    return { ok: true, pt: P, sides: [si, sj] };
  }
  // the spline e as Corner leaves it (a copy, or e itself when its end is already there)
  function freeSideEntity(e, s) {
    if (s.same) return e;
    var fc = freeCurve(e);
    if (s.cut || fc.style) return freePiece(fc, s.end === 'p2' ? fc.t0 : s.t, s.end === 'p2' ? s.t : fc.t1);   // rfAH: a style spline carried on is its own Bézier, longer
    if (e.t === 'pellipse') { var pe = clone(e); if (s.end === 'p2') pe.a1 = s.t / D2R; else pe.a0 = s.t / D2R; return normArc(pe); }   // lane DE
    var o = clone(e), P = [Math.round(s.pt[0] * 1e6) / 1e6, Math.round(s.pt[1] * 1e6) / 1e6];
    if (s.end === 'p2') { o.pts.push(P); if (o.tans) o.tans.push(null); } else { o.pts.unshift(P); if (o.tans) o.tans.unshift(null); }
    return o;
  }
  // apply a spline's side in the sketch: cut back as Trim cuts a spline (freeAfterTrim keeps the relations that still
  // hold and joins the new end to what is there), or carried on as Extend Entities does
  function freeSideApply(sketch, k, s, an0) {
    var E = sketch.entities, e = E[k];
    if (s.same) return;
    if (s.cut) {
      var before = E.slice();
      sketch.entities = before.slice(0, k).concat([freeSideEntity(e, s)], before.slice(k + 1));
      freeAfterTrim(sketch, before, k, 1, an0, null);
      return;
    }
    if (e.style) { styleRegrow(sketch, k, s.end === 'p2' ? 0 : s.t, s.end === 'p2' ? s.t : 1, s.end); return; }   // rfAH
    if (e.t === 'pellipse') { if (s.end === 'p2') e.a1 = s.t / D2R; else e.a0 = s.t / D2R; normArc(e); return; }   // lane DE
    var P = [Math.round(s.pt[0] * 1e6) / 1e6, Math.round(s.pt[1] * 1e6) / 1e6];
    if (s.end === 'p2') { e.pts.push(P); if (e.tans) e.tans.push(null); }
    else {
      e.pts.unshift(P); if (e.tans) e.tans.unshift(null);
      (sketch.rels || []).forEach(function (rel) { rel.refs = rel.refs.map(function (r) { var p = parseRef(r); return p && !p.o && p.e === k && p.s === 'v' ? k + '.v' + (p.k + 1) : r; }); });
    }
    var n = e.pts.length;
    (sketch.rels || []).forEach(function (rel) { rel.refs = rel.refs.map(function (r) { return r === k + '.' + s.end ? k + '.v' + (s.end === 'p2' ? n - 2 : 1) : r; }); });
  }
  // rfAH: a style spline carried on (Extend, Corner) to its Bézier from a to b (one of them past [0, 1]): its control
  // vertices are redrawn, so the relations on its inner vertices and on the end that moved go (the other end, a point
  // lying on the curve and its dimensions stay)
  function styleRegrow(sketch, i, a, b, end) {
    var e = sketch.entities[i];
    e.pts = K.bzSub(e.pts, a, b).map(function (q) { return [Math.round(q[0] * 1e6) / 1e6, Math.round(q[1] * 1e6) / 1e6]; });
    if (!sketch.rels) return;
    sketch.rels = sketch.rels.filter(function (rel) {
      return !rel.refs.some(function (r) { var p = parseRef(r); return p && !p.o && p.e === i && (p.s === 'v' || (p.s === 'p' && (end === 'p2' ? p.k === 2 : p.k === 1))); });
    });
    if (!sketch.rels.length) delete sketch.rels;
  }
  function freeCornerTrim(sketch, i, uvi, j, uvj) {
    var pl = freeCornerPlan(sketch, i, uvi, j, uvj);
    if (!pl.ok) return pl;
    var ri = i + '.' + pl.sides[0].end, rj = j + '.' + pl.sides[1].end;
    if (endJoined(sketch, ri, rj) || endJoined(sketch, rj, ri)) return { ok: false, error: 'That end is joined to other geometry: only free ends can make the corner.' };
    var saved = tSave(sketch), an0 = analyze(sketch);
    try {
      dropEndCoincidents(sketch, [ri, rj]);
      // lines and arcs first, so a spline cut back finds the other entity's end where it lands
      [0, 1].forEach(function (n) { if (!pl.sides[n].free) applySide(sketch.entities[n ? j : i], pl.sides[n]); });
      [0, 1].forEach(function (n) { if (pl.sides[n].free) freeSideApply(sketch, n ? j : i, pl.sides[n], an0); });
      var joined = (sketch.rels || []).some(function (rel) { return rel.type === 'coincident' && rel.refs.indexOf(ri) >= 0 && rel.refs.indexOf(rj) >= 0; });
      if (!joined) (sketch.rels = sketch.rels || []).push({ type: 'coincident', refs: [ri, rj] });
      var res = solve(sketch), an = analyze(sketch);
      if (!res.ok || an.conflicts > an0.conflicts) { tRestore(sketch, saved); return { ok: false, error: 'The corner conflicts with the sketch\'s relations or dimensions.' }; }
    } catch (err) { tRestore(sketch, saved); return { ok: false, error: 'The corner could not be made: ' + err.message }; }
    return { ok: true, pt: pl.pt };
  }
  // ---- Trim away inside / outside: entity idx is cut where it crosses the two bounding entities; inside removes the
  // part between them, outside keeps only that part. { idx, prim, keep: [[lo, hi]], remove: [[lo, hi]] } or { error }.
  function betweenPlan(sketch, idx, uv, bounds, outside) {
    var E = sketch.entities, e = E[idx];
    if (isFree(e) && bounds.indexOf(idx) < 0) return freeBetweenPlan(sketch, idx, uv, bounds, outside);   // sketch-refine
    if (!e || (e.t !== 'line' && e.t !== 'arc' && e.t !== 'circle')) return { error: 'Trim away ' + (outside ? 'outside' : 'inside') + ' works on lines, arcs and circles.' };
    if (bounds.indexOf(idx) >= 0) return { error: 'That is one of the bounding entities.' };
    var prim = tPrims(e)[0], kt = tPrimAt(prim, uv).t, hits = [];
    for (var b = 0; b < bounds.length; b++) {
      // rfCK: a bound through the entity's own end (an L corner) counts: the rest span there is empty (tiny, below)
      var ps = tCuts(sketch, idx, 0, prim, [bounds[b]], true);
      if (!ps.length) return { error: 'The entity has to cross both bounding entities.' };
      var dist = function (t) { var d = Math.abs(t - kt); return prim.full ? Math.min(d, TAU - d) : d; };   // round a circle either way
      ps.sort(function (p, q) { return dist(p) - dist(q); });
      hits.push(ps[0]);
    }
    var lo = Math.min(hits[0], hits[1]), hi = Math.max(hits[0], hits[1]), mid = [[lo, hi]], rest;
    if (hi - lo < 1e-9) return { error: 'The bounding entities cross it at the same point.' };
    if (prim.full) {
      var other = [[hi, lo + TAU]];
      if (!(kt >= lo && kt <= hi)) { rest = mid; mid = other; } else rest = other;
      // a circle: "between" is the arc on the side clicked
    } else {
      var start = prim.kind === 'arc' ? prim.a0 : 0, end = prim.kind === 'arc' ? prim.a1 : 1, tiny = (end - start) * 1e-6;
      rest = [];
      if (lo - start > tiny) rest.push([start, lo]);
      if (end - hi > tiny) rest.push([hi, end]);
    }
    return outside ? { idx: idx, prim: prim, keep: mid, remove: rest } : { idx: idx, prim: prim, keep: rest, remove: mid };
  }
  // sketch-refine: Trim away inside / outside on a spline or an ellipse: { fc, keep, remove } as betweenPlan's
  function freeBetweenPlan(sketch, idx, uv, bounds, outside) {
    var fc = freeCurve(sketch.entities[idx]);
    if (!fc) return { error: 'That curve cannot be trimmed.' };
    var kt = freeClosest(fc, uv).t, hits = [];
    function dist(t) { var d = Math.abs(t - kt); return fc.closed ? Math.min(d % fc.per, fc.per - d % fc.per) : d; }
    for (var b = 0; b < bounds.length; b++) {
      var ps = freeCuts(sketch, idx, fc, [bounds[b]]);
      if (!ps.length) return { error: 'The entity has to cross both bounding entities.' };
      ps.sort(function (p, q) { return dist(p) - dist(q); });
      hits.push(ps[0]);
    }
    var lo = Math.min(hits[0], hits[1]), hi = Math.max(hits[0], hits[1]), mid = [[lo, hi]], rest;
    if (hi - lo < 1e-9) return { error: 'The bounding entities cross it at the same point.' };
    if (fc.closed) {
      var other = [[hi, lo + fc.per]];
      if (!(kt >= lo && kt <= hi)) { rest = mid; mid = other; } else rest = other;
    } else {
      rest = [];
      if (lo - fc.t0 > 1e-9) rest.push([fc.t0, lo]);
      if (fc.t1 - hi > 1e-9) rest.push([hi, fc.t1]);
    }
    return outside ? { idx: idx, fc: fc, keep: mid, remove: rest } : { idx: idx, fc: fc, keep: rest, remove: mid };
  }
  function betweenSpans(sketch, idx, uv, bounds, outside) {
    var pl = betweenPlan(sketch, idx, uv, bounds, outside);
    if (pl.fc) return pl.remove.map(function (r) { return freePts(pl.fc, r[0], r[1]); });   // sketch-refine
    return pl.error ? null : pl.remove.map(function (r) { return tPrimPts(pl.prim, r[0], r[1]); });
  }
  function trimBetween(sketch, idx, uv, bounds, outside, ctx) {
    var pl = betweenPlan(sketch, idx, uv, bounds, outside);
    if (pl.error) return { ok: false, error: pl.error };
    if (ctx && ctx.ignoreConstruction && sketch.entities[idx].construction) return { ok: false, ignored: true, error: 'Construction geometry is not trimmed (Ignore trimming of construction geometry).' };
    if (pl.fc) {
      // sketch-refine: a spline / ellipse: the kept spans as pieces of the same family (freePiece), relations after them
      var fp = pl.keep.map(function (r) { return freePiece(pl.fc, r[0], r[1]); }), bf = sketch.entities.slice(), a0 = analyze(sketch);
      sketch.entities = bf.slice(0, idx).concat(fp, bf.slice(idx + 1));
      freeAfterTrim(sketch, bf, idx, fp.length, a0, ctx);
      return { ok: true, pieces: fp.length };
    }
    var keepOff = ctx && ctx.keepConstruction && !sketch.entities[idx].construction ? pl.remove.map(function (r) { return { prim: pl.prim, lo: r[0], hi: r[1] }; }) : [];
    var E = sketch.entities, e = E[idx], pieces = pl.keep.map(function (r) {
      var o;
      if (pl.prim.kind === 'seg') { var a = tPrimPt(pl.prim, r[0]), b = tPrimPt(pl.prim, r[1]); o = { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; }
      else {
        o = { t: 'arc', cx: e.cx, cy: e.cy, r: e.r, a0: r[0] / D2R, a1: r[1] / D2R };
        while (o.a0 >= 360) { o.a0 -= 360; o.a1 -= 360; }
        while (o.a0 < 0) { o.a0 += 360; o.a1 += 360; }
      }
      if (e.construction) o.construction = true;
      if (e.layer != null) o.layer = e.layer;
      return tRound(o);
    });
    var before = E.slice();
    sketch.entities = E.slice(0, idx).concat(pieces, E.slice(idx + 1));
    afterTrim(sketch, before, idx);
    keepOff.forEach(function (sp) { keptPiece(sketch, sp, null); });
    return { ok: true, pieces: pieces.length };
  }

  // ------------------------------------------------------------------ sketch tools (ui-sketch-tools.js)
  // Sketch Fillet and Sketch Chamfer on lines and arcs, Offset Entities on chains, Move / Copy / Rotate / Scale /
  // Stretch Entities, Linear and Circular Sketch Pattern. Each is all or nothing: on any failure (a throw part way, a
  // conflict with the sketch's relations or dimensions) the sketch is put back exactly as it was, and a relation a tool
  // moved or made that would over-define the sketch is not kept.
  function normDeg(a) { return ((a % 360) + 360) % 360; }
  function angDiff(a, b) { return ((a - b) % 360 + 540) % 360 - 180; }
  function ccwTan(a) { return [-Math.sin(a), Math.cos(a)]; }   // the unit tangent of a circle at angle a (radians), counter-clockwise
  function otherEnd(s) { return s === 'p1' ? 'p2' : 'p1'; }
  function normArc(e) { while (e.a0 >= 360) { e.a0 -= 360; e.a1 -= 360; } while (e.a0 < 0) { e.a0 += 360; e.a1 += 360; } return e; }
  function endOf(e, end) {
    if (e.t === 'line') return end === 'p1' ? [e.x1, e.y1] : [e.x2, e.y2];
    if (e.t === 'spline') { var q = end === 'p1' ? e.pts[0] : e.pts[e.pts.length - 1]; return [q[0], q[1]]; }   // sketch-fillet2
    var a = (end === 'p1' ? e.a0 : e.a1) * D2R;
    return [e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)];
  }
  function nearPt(a, b, tol) { return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol; }
  function joinTol(p) { return 1e-6 * Math.max(1, Math.abs(p[0]), Math.abs(p[1])); }
  function curveEnt(e) { return !!e && (e.t === 'line' || e.t === 'arc'); }
  // sketch-fillet2: Sketch Fillet also rounds a corner where a line or arc meets an open spline's end, and fillets a
  // circle (it stays whole: the fillet arc ends on it, Tangent) or an open spline (cut back to the tangent point)
  function splineOpen(e) { return !!e && e.t === 'spline' && !e.closed && !!e.pts && e.pts.length >= 2; }
  function cornerEnt(e) { return curveEnt(e) || splineOpen(e); }
  function filletEnt(e) { return cornerEnt(e) || (!!e && e.t === 'circle'); }
  function uniqSorted(list, E) {
    var out = [];
    (list || []).forEach(function (i) { i = +i; if (E[i] && out.indexOf(i) < 0) out.push(i); });
    return out.sort(function (a, b) { return a - b; });
  }
  // The direction an end of a line / arc leaves the entity's end into the entity (for telling a smooth join from a corner).
  function intoDir(e, end) {
    if (e.t === 'line') { var u = unit(sub(endOf(e, otherEnd(end)), endOf(e, end))); return u; }
    if (e.t === 'spline') { var fc = freeCurve(e), d = fc ? unit(fc.d1(end === 'p1' ? fc.t0 : fc.t1)) : [1, 0]; return end === 'p1' ? d : [-d[0], -d[1]]; }
    var t = ccwTan((end === 'p1' ? e.a0 : e.a1) * D2R);
    return end === 'p1' ? t : [-t[0], -t[1]];
  }
  // Relations a tool moved or made (`cands`) that over-define the sketch go again, last first, while they do (dropping a
  // repeat frees nothing: the degrees of freedom stay). Returns the analysis of the result.
  function dropRedundant(sketch, cands, an0) {
    var an1 = analyze(sketch);
    for (var m = cands.length - 1; m >= 0 && an1.redundant > an0.redundant; m--) {
      var at = sketch.rels ? sketch.rels.indexOf(cands[m]) : -1;
      if (at < 0) continue;
      sketch.rels.splice(at, 1);
      var anT = analyze(sketch);
      if (anT.redundant < an1.redundant && anT.dof === an1.dof && anT.conflicts <= an1.conflicts) an1 = anT;
      else sketch.rels.splice(at, 0, cands[m]);
    }
    if (sketch.rels && !sketch.rels.length) delete sketch.rels;
    return an1;
  }

  // ---- corners and Sketch Fillet on lines and arcs
  // The corner nearest uv (within maxDist) where two lines or arcs meet end to end and do not already run on smoothly
  // (tangent): { i, ei, j, ej, at }, or null. Virtual sharps are points, never part of a corner.
  function curveCorner(sketch, uv, maxDist) {
    var E = sketch.entities || [], best = null, bd = maxDist == null ? Infinity : maxDist;
    for (var i = 0; i < E.length; i++) {
      if (!cornerEnt(E[i])) continue;
      for (var j = i + 1; j < E.length; j++) {
        if (!cornerEnt(E[j]) || (splineOpen(E[i]) && splineOpen(E[j]))) continue;   // (two splines: no fillet between them)
        for (var a = 1; a <= 2; a++) for (var b = 1; b <= 2; b++) {
          var ei = 'p' + a, ej = 'p' + b, P = endOf(E[i], ei), Q = endOf(E[j], ej);
          if (!nearPt(P, Q, joinTol(P))) continue;
          var di = intoDir(E[i], ei), dj = intoDir(E[j], ej);
          if (Math.abs(crs(di, dj)) < 1e-6 && dot(di, dj) < 0) continue;   // a smooth join: no corner to round
          var d = len(sub(P, uv));
          if (d < bd) { bd = d; best = { i: i, ei: ei, j: j, ej: ej, at: P.slice() }; }
        }
      }
    }
    return best;
  }
  // Picked entities that share an end are a corner: the shared end nearest the picks is the one rounded.
  function asCorner(E, spec) {
    if (spec.ei) return spec;
    var A = E[spec.i], B = E[spec.j], best = null, bd = Infinity, mid = spec.uvi && spec.uvj ? [(spec.uvi[0] + spec.uvj[0]) / 2, (spec.uvi[1] + spec.uvj[1]) / 2] : null;
    if (!cornerEnt(A) || !cornerEnt(B)) return spec;   // a circle has no ends
    ['p1', 'p2'].forEach(function (ei) {
      ['p1', 'p2'].forEach(function (ej) {
        var P = endOf(A, ei);
        if (!nearPt(P, endOf(B, ej), joinTol(P))) return;
        var d = mid ? len(sub(P, mid)) : 0;
        if (d < bd) { bd = d; best = { i: spec.i, ei: ei, j: spec.j, ej: ej, at: P.slice() }; }
      });
    });
    return best || spec;
  }
  // How line / arc e is cut back or extended to end at T: { move: the end that moves, dir: the direction of travel at T
  // (away from the part kept), pt, a0 / a1 (an arc) }. keepEnd (a corner): the end that stays, and T must lie between
  // it and the corner; otherwise the part kept is the one clicked (uv). null when nothing would be left.
  function reshapeTo(e, T, keepEnd, uv) {
    var tiny = 1e-9 * Math.max(1, Math.abs(T[0]), Math.abs(T[1]));
    if (e.t === 'line') {
      var A = [e.x1, e.y1], B = [e.x2, e.y2], d = sub(B, A), L2 = dot(d, d);
      if (L2 < 1e-24) return null;
      var tT = dot(sub(T, A), d) / L2, move;
      if (keepEnd) {
        move = otherEnd(keepEnd);
        var tK = keepEnd === 'p1' ? tT : 1 - tT;
        if (!(tK > 1e-9 && tK <= 1 + 1e-9)) return null;
      } else if (tT > 1e-9 && tT < 1 - 1e-9) move = dot(sub(uv, A), d) / L2 < tT ? 'p2' : 'p1';
      else move = tT >= 1 - 1e-9 ? 'p2' : 'p1';
      var K0 = move === 'p2' ? A : B, dir = sub(T, K0), l = len(dir);
      if (l <= tiny) return null;
      return { move: move, dir: [dir[0] / l, dir[1] / l], pt: T };
    }
    var aT = Math.atan2(T[1] - e.cy, T[0] - e.cx) / D2R, sw = e.a1 - e.a0, rT = normDeg(aT - e.a0), back = normDeg(e.a1 - aT), mv;
    if (keepEnd) {
      mv = otherEnd(keepEnd);
      if ((mv === 'p2' ? rT : back) > sw + 1e-7) return null;
    } else if (rT <= sw + 1e-9) mv = normDeg(Math.atan2(uv[1] - e.cy, uv[0] - e.cx) / D2R - e.a0) < rT ? 'p2' : 'p1';
    else mv = rT - sw < 360 - rT ? 'p2' : 'p1';
    var na0 = mv === 'p2' ? e.a0 : e.a1 - back, na1 = mv === 'p2' ? e.a0 + rT : e.a1;
    if (na1 - na0 < 1e-6 || na1 - na0 > 360 - 1e-6) return null;
    var tg = ccwTan(aT * D2R);
    return { move: mv, dir: mv === 'p2' ? tg : [-tg[0], -tg[1]], pt: T, a0: na0, a1: na1 };
  }
  function applyReshape(e, s) {
    if (e.t === 'line') { if (s.move === 'p1') { e.x1 = s.pt[0]; e.y1 = s.pt[1]; } else { e.x2 = s.pt[0]; e.y2 = s.pt[1]; } return; }
    e.a0 = s.a0; e.a1 = s.a1; normArc(e);
  }
  // the curves at distance r from line / arc e (both sides of a line; both of a circle when r is under its radius)
  function offsetCarriers(e, r) {
    if (e.t === 'line') {
      var a = [e.x1, e.y1], b = [e.x2, e.y2], u = unit(sub(b, a)), n = [-u[1], u[0]];
      return [1, -1].map(function (s) { return { kind: 'line', a: [a[0] + n[0] * r * s, a[1] + n[1] * r * s], b: [b[0] + n[0] * r * s, b[1] + n[1] * r * s] }; });
    }
    var out = [{ kind: 'circle', c: [e.cx, e.cy], r: e.r + r }];
    if (e.r - r > 1e-9 * Math.max(1, e.r)) out.push({ kind: 'circle', c: [e.cx, e.cy], r: e.r - r });
    return out;
  }
  function footOn(e, C) {
    if (e.t === 'line') { var a = [e.x1, e.y1], d = sub([e.x2, e.y2], a), t = dot(sub(C, a), d) / dot(d, d); return [a[0] + d[0] * t, a[1] + d[1] * t]; }
    var v = sub(C, [e.cx, e.cy]), l = len(v);
    return l < 1e-12 ? null : [e.cx + v[0] / l * e.r, e.cy + v[1] / l * e.r];
  }
  // The fillet of radius r between lines / arcs spec.i and spec.j: the centre is at r from both; each entity is cut
  // back (or extended) to its tangent point keeping the part away from the corner (spec.ei / ej: the corner's ends) or
  // the part clicked (spec.uvi / uvj), and the arc leaves one along its direction of travel and enters the other the
  // same way (smooth both ends). Of the fillets that fit, the one nearest the corner (or the clicks) is taken.
  function filletPlan(E, spec, r) {
    var A = E[spec.i], B = E[spec.j], corner = !!spec.ei, P = corner ? spec.at || endOf(A, spec.ei) : null, best = null, bs = Infinity;
    function consider(C, T1, T2, sa, sb) {
      var a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]), a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]), c1 = dot(sa.dir, ccwTan(a1));
      if (Math.abs(c1) < 1 - 1e-6) return;
      var ccw = c1 > 0, t2 = ccwTan(a2);
      if (!ccw) t2 = [-t2[0], -t2[1]];
      if (dot(t2, sb.dir) > -(1 - 1e-6)) return;
      var d1 = a1 / D2R, d2 = a2 / D2R, arc = ccw ? { a0: d1, a1: d1 + normDeg(d2 - d1) } : { a0: d2, a1: d2 + normDeg(d1 - d2) };
      if (arc.a1 - arc.a0 < 1e-6 || arc.a1 - arc.a0 > 360 - 1e-6) return;
      // nearest the corner (or the clicks); of two fillets as near (a circle can be left either way) the shorter arc
      var s = (corner ? len(sub(T1, P)) + len(sub(T2, P)) : len(sub(T1, spec.uvi)) + len(sub(T2, spec.uvj))) + (arc.a1 - arc.a0) * 1e-7 * Math.max(1, r);
      if (s < bs) { bs = s; best = { C: C, sa: sa, sb: sb, ccw: ccw, arc: { t: 'arc', cx: C[0], cy: C[1], r: r, a0: arc.a0, a1: arc.a1 } }; }
    }
    if (splineOpen(A) || splineOpen(B)) { freeFilletPlan(E, spec, r, consider); return best; }
    offsetCarriers(A, r).forEach(function (oa) {
      offsetCarriers(B, r).forEach(function (ob) {
        carrierMeet(oa, ob).forEach(function (C) {
          var T1 = footOn(A, C), T2 = footOn(B, C);
          if (!T1 || !T2) return;
          var sas = reshapeOpts(A, T1, corner ? otherEnd(spec.ei) : null, spec.uvi), sbs = reshapeOpts(B, T2, corner ? otherEnd(spec.ej) : null, spec.uvj);
          sas.forEach(function (sa) { sbs.forEach(function (sb) { consider(C, T1, T2, sa, sb); }); });
        });
      });
    });
    return best;
  }
  // sketch-fillet2: how entity e meets the fillet at T: a line / arc cut back or extended (reshapeTo); a circle stays
  // whole, and the fillet may leave it either way round
  function reshapeOpts(e, T, keepEnd, uv) {
    if (e.t === 'circle') {
      var tg = ccwTan(Math.atan2(T[1] - e.cy, T[0] - e.cx));
      return [{ move: null, whole: true, dir: tg, pt: T }, { move: null, whole: true, dir: [-tg[0], -tg[1]], pt: T }];
    }
    var s = reshapeTo(e, T, keepEnd, uv);
    return s ? [s] : [];
  }
  // lane C: whether line e's carrier (the line extended both ways) crosses or touches open spline sp within its ends
  function lineMeetsFree(e, sp) {
    var fc = freeCurve(sp);
    if (!fc) return false;
    var L = { a: [e.x1, e.y1], b: [e.x2, e.y2] }, N = Math.max(96, 2 * fc.n), prev = null;
    if (len(sub(L.b, L.a)) < 1e-12) return false;
    for (var k = 0; k <= N; k++) {
      var d = lineDist(fc.pt(fc.t0 + (fc.t1 - fc.t0) * k / N), L);
      if (d === 0 || (prev != null && prev * d < 0)) return true;
      prev = d;
    }
    return false;
  }
  // sketch-fillet2: the fillets of radius r between an open spline and a line, arc or circle: centres at r from the
  // spline (along its normal, either side) that lie on an offset of the other entity, found along the spline by the
  // sign changes of that offset's distance and refined by bisection. The spline keeps its far end (a corner) or the side
  // clicked; each fillet goes to consider(C, Ti, Tj, si, sj) in spec order.
  function freeFilletPlan(E, spec, r, consider) {
    var swap = splineOpen(E[spec.i]), iA = swap ? spec.j : spec.i, iB = swap ? spec.i : spec.j, A = E[iA], fc = freeCurve(E[iB]);
    if (!fc || !filletEnt(A) || splineOpen(A)) return;
    var eA = spec.ei ? (swap ? spec.ej : spec.ei) : null, eB = spec.ei ? (swap ? spec.ei : spec.ej) : null;
    var uvA = swap ? spec.uvj : spec.uvi, tc = !eB && (swap ? spec.uvi : spec.uvj) ? freeClosest(fc, swap ? spec.uvi : spec.uvj).t : null;
    var N = Math.max(96, 2 * fc.n), span = fc.t1 - fc.t0;
    // rfAX: spec.ext { lo, hi } — the spline is carried on past its free start / end (its end span's own polynomial, as
    // Extend Entities carries it, fc.reach spans or 3) and a fillet may touch it there: SolidWorks fillets a line whose
    // extension misses the spline by extending the spline too. Only the carried-on parts are searched then.
    var rch = fc.reach || 3, ranges = [];
    if (spec.ext) {
      if (spec.ext.lo) ranges.push([fc.t0 - rch, fc.t0, 'lo']);
      if (spec.ext.hi) ranges.push([fc.t1, fc.t1 + rch, 'hi']);
    } else ranges.push([fc.t0, fc.t1, null]);
    ranges.forEach(function (rg) { [1, -1].forEach(function (side) { scan(rg, side); }); });
    function scan(rg, side) {
      var r0 = rg[0], rs = rg[1] - rg[0], NN = rg[2] ? 192 : N;
      function centre(t) { var p = fc.pt(t), d = unit(fc.d1(t)); return [p[0] - d[1] * r * side, p[1] + d[0] * r * side]; }
      offsetCarriers(A, r).forEach(function (oa) {
        function g(t) { var C = centre(t); return oa.kind === 'line' ? lineDist(C, oa) : len(sub(C, oa.c)) - oa.r; }
        var tp = r0, gp = g(tp);
        for (var k = 1; k <= NN; k++) {
          var t = r0 + rs * k / NN, gt = g(t);
          if (gp === 0 || gp * gt < 0) {
            var lo = tp, hi = t, flo = gp;
            for (var it = 0; it < 80 && hi - lo > 1e-15 * Math.max(1, Math.abs(lo)); it++) { var m = (lo + hi) / 2, gm = g(m); if (flo * gm <= 0) hi = m; else { lo = m; flo = gm; } }
            take((lo + hi) / 2);
          }
          tp = t; gp = gt;
        }
        function take(t) {
          var keepHi = rg[2] === 'lo' ? true : rg[2] === 'hi' ? false : eB ? eB === 'p1' : tc != null ? tc > t : true;
          if (rg[2] ? (rg[2] === 'lo' ? t >= fc.t0 - 1e-9 * span : t <= fc.t1 + 1e-9 * span) : (keepHi ? t >= fc.t1 - 1e-9 * span : t <= fc.t0 + 1e-9 * span)) return;   // nothing of the spline would be left (rfAX: or nothing carried on)
          var C = centre(t), T2 = fc.pt(t), T1 = footOn(A, C);
          if (!T1 || Math.abs(len(sub(T1, C)) - r) > 1e-7 * Math.max(1, r)) return;
          var d = unit(fc.d1(t)), sb = { move: keepHi ? 'p1' : 'p2', free: true, t: t, keepHi: keepHi, pt: T2, dir: keepHi ? [-d[0], -d[1]] : d, ext: !!rg[2] };
          reshapeOpts(A, T1, eA ? otherEnd(eA) : null, uvA).forEach(function (sa) {
            if (swap) consider(C, T2, T1, sb, sa); else consider(C, T1, T2, sa, sb);
          });
        }
      });
    }
  }
  // sketch-fillet2: entity idx of sketch made to meet the fillet as plan side s says: a line / arc reshaped, a circle
  // left whole, an open spline replaced by its piece from the tangent point (freePiece); its points' refs ('3.v4')
  // follow the piece, those cut away go with their relations, and a point lying on the spline that is no longer on the
  // piece loses that Coincident
  function filletReshape(sketch, idx, s) {
    var e = sketch.entities[idx];
    if (s.whole) return;
    if (!s.free) { applyReshape(e, s); return; }
    var fc = freeCurve(e), n = e.pts.length, base = Math.floor(s.t + 1e-9);
    var piece = s.keepHi ? freePiece(fc, s.t, fc.t1, s.ext) : freePiece(fc, fc.t0, s.t, s.ext);   // (rfAX: s.ext: carried on past its end)
    function mapV(k) {   // original point k -> its index in the piece, or -1
      if (s.ext) return s.keepHi ? k + 1 : k;   // rfAX: carried on past its end: every point stays, one new end point
      if (s.keepHi) return k > s.t + 1e-9 ? k - base : -1;
      return k < s.t - 1e-9 ? k : -1;
    }
    sketch.entities[idx] = piece;
    // rfAX: the old end of a spline carried on is a spline point now, and keeps its relations as one
    if (s.ext && !piece.style && sketch.rels) sketch.rels.forEach(function (rel) { rel.refs = rel.refs.map(function (x) { return x === idx + '.' + (s.keepHi ? 'p1' : 'p2') ? idx + '.v' + (s.keepHi ? 1 : n - 1) : x; }); });
    var tol = 1e-6 * Math.max(1, Math.abs(s.pt[0]), Math.abs(s.pt[1])), pfc = freeCurve(piece);
    if (sketch.rels) sketch.rels = sketch.rels.filter(function (rel) {
      var drop = false;
      rel.refs = rel.refs.map(function (x) {
        var q = parseRef(x);
        if (!q || q.o || q.e !== idx || q.s !== 'v') return x;
        var nk = q.k != null && q.k < n ? mapV(q.k) : -1;
        if (nk < 0) { drop = true; return x; }
        return idx + '.v' + nk;
      });
      if (!drop && rel.type === 'coincident' && pfc && rel.refs.indexOf(String(idx)) >= 0) {
        var other = rel.refs[0] === String(idx) ? rel.refs[1] : rel.refs[0], P = refPoint(sketch.entities, parseRef(other));
        if (P) { var c = freeClosest(pfc, P); if (c.end && c.d > tol) drop = true; }
      }
      return !drop;
    });
  }
  // Sketch Fillet between two lines / arcs, at the corner where they meet (spec { i, ei, j, ej, at }: curveCorner) or
  // picked anywhere (spec { i, uvi, j, uvj }: entities that do not meet are extended or cut back to the fillet). As
  // SolidWorks does: the entities end at the tangent points, an arc joins them with Coincident and Tangent relations,
  // and the vanished corner becomes a virtual sharp when relations or dimensions held it (opts.keepCorner, default on:
  // Keep constrained corners; off: they go with the corner). The arc gets a driving radius (opts.dimension, default on)
  // or, with opts.equalTo (an earlier fillet arc), an Equal relation to it (Dimension each fillet off). Returns
  // { ok, arc, sharp (index or -1), analysis, error }.
  function filletPair(sketch, spec, r, opts) {
    opts = opts || {};
    r = +r;
    if (!(r > 0) || !isFinite(r)) return { ok: false, error: 'The fillet radius must be a positive number.' };
    var E = sketch.entities, A = E[spec.i], B = E[spec.j];
    if (spec.i === spec.j || !filletEnt(A) || !filletEnt(B)) return { ok: false, error: 'A sketch fillet needs two lines, arcs or circles, or a line or arc and a spline.' };
    if (splineOpen(A) && splineOpen(B)) return { ok: false, error: 'Two splines cannot be filleted: fillet a spline with a line or an arc.' };
    if ((A.t === 'line' && len(sub(endOf(A, 'p2'), endOf(A, 'p1'))) < 1e-12) || (B.t === 'line' && len(sub(endOf(B, 'p2'), endOf(B, 'p1'))) < 1e-12)) return { ok: false, error: 'One of the lines has no length.' };
    spec = asCorner(E, spec);
    var corner = !!spec.ei;
    if (corner) {
      var di = intoDir(A, spec.ei), dj = intoDir(B, spec.ej), th = Math.acos(Math.max(-1, Math.min(1, dot(di, dj))));
      if (Math.abs(crs(di, dj)) < 1e-6) return { ok: false, error: A.t === 'line' && B.t === 'line' ? 'The lines are collinear: there is no corner to round.' : 'They already meet smoothly (tangent): there is no corner to round.' };
    }
    var pl = filletPlan(E, spec, r);
    if (!pl && !corner && (splineOpen(A) || splineOpen(B))) {
      // rfAX: SolidWorks extends the spline too when the line misses it (its extension does not reach the spline): the
      // spline's free ends are carried on (its end span's own curve, a style spline's own polynomial) and the fillet
      // may touch the carried-on part. (A line that reaches the spline with no room for the radius stays refused.)
      var spx = splineOpen(A) ? A : B, spi = spx === A ? spec.i : spec.j, oth = spx === A ? B : A;
      var ext = { lo: spx.conic == null && !endJoined(sketch, spi + '.p1'), hi: spx.conic == null && !endJoined(sketch, spi + '.p2') };
      if (oth.t === 'line' && !lineMeetsFree(oth, spx) && (ext.lo || ext.hi)) pl = filletPlan(E, { i: spec.i, uvi: spec.uvi, j: spec.j, uvj: spec.uvj, ext: ext }, r);
    }
    if (!pl) {
      if (corner && A.t === 'line' && B.t === 'line') {
        var la = len(sub(endOf(A, otherEnd(spec.ei)), spec.at)), lb = len(sub(endOf(B, otherEnd(spec.ej)), spec.at));
        return { ok: false, error: 'Radius too large: the fillet would be longer than the lines (at most R' + fmtL(Math.min(la, lb) * Math.tan(th / 2)) + ').' };
      }
      // lane C: a line and a spline that do not meet. The line is extended (or cut back) to the fillet as SolidWorks does
      // (freeFilletPlan); what cannot be done is extending the spline, so say which it is
      if (!corner && (splineOpen(A) || splineOpen(B))) {
        var sp = splineOpen(A) ? A : B, other = sp === A ? B : A;
        if (other.t === 'line' && !lineMeetsFree(other, sp)) return { ok: false, error: 'No fillet of R' + fmtL(r) + ' fits between the line and the spline, even with the line extended and the spline carried on past its free ends: try another radius, or move the line.' };
        return { ok: false, error: 'No fillet of R' + fmtL(r) + ' fits between the ' + other.t + ' and the spline' + (other.t === 'line' ? ' (the line is extended to it; the spline is not extended past its ends)' : '') + ': try a smaller radius.' };
      }
      return { ok: false, error: corner ? 'Radius too large: the fillet would be longer than the entities.' : 'No fillet of that radius fits between those entities.' };
    }
    var saved = tSave(sketch), before = analyze(sketch);
    // p9-sketchfix: all or nothing. Anything that throws part way puts the sketch back as it was.
    try { return filletApply(); } catch (err) { tRestore(sketch, saved); return { ok: false, error: 'The fillet could not be made: ' + err.message }; }
    function filletApply() {
      // the ends that move to the fillet (a circle has none: it stays whole)
      var endI = pl.sa.move ? spec.i + '.' + pl.sa.move : null, endJ = pl.sb.move ? spec.j + '.' + pl.sb.move : null;
      var gone = [endI, endJ].filter(Boolean), P = corner ? spec.at : null, lens = {};
      // the lengths the lines had to the corner (their length dimensions measure to the virtual sharp)
      if (corner) [[spec.i, spec.ei], [spec.j, spec.ej]].forEach(function (q) {
        if (E[q[0]].t !== 'line') return;
        var far = endOf(E[q[0]], otherEnd(q[1]));
        lens[q[0]] = { len: len(sub(far, P)), dx: Math.abs(far[0] - P[0]), dy: Math.abs(far[1] - P[1]) };
      });
      filletReshape(sketch, spec.i, pl.sa); filletReshape(sketch, spec.j, pl.sb);
      var arc = normArc(pl.arc);
      if (A.construction && B.construction) arc.construction = true;
      E.push(arc);
      var k = E.length - 1, sharp = -1, keep = [], lenDims = [], made = [];
      if (corner) {
        // the corner's own joins go with it: the two ends Coincident, or one end lying on the other entity
        keep = (sketch.rels || []).filter(function (rel) {
          var n = rel.refs.filter(function (x) { return gone.indexOf(String(x)) >= 0; }).length;
          if (!n || (rel.type === 'coincident' && n === 2)) return false;
          if (rel.type === 'coincident' && (rel.refs.indexOf(String(spec.i)) >= 0 || rel.refs.indexOf(String(spec.j)) >= 0)) return false;
          return true;
        });
        lenDims = (sketch.dims || []).filter(function (d) { return (d.e === spec.i || d.e === spec.j) && E[d.e].t === 'line' && (d.k === 'len' || d.k === 'dx' || d.k === 'dy'); });
      }
      // Virtual sharp, as SolidWorks keeps it (Keep constrained corners): when relations or dimensions held the corner, a
      // construction point stays at the crossing of the two entities (on both, so it adds no freedom) and carries them;
      // a line's length becomes the distance from its far end to it.
      // (not at a spline's end: the sharp would lie on the spline's cut-off part, which no curve carries on)
      // (rfH: a Polygon relation holds the corner of its two sides too: the sharp shows the corner it keeps regular)
      var polyHeld = corner && (sketch.rels || []).some(function (rel) { return rel.type === 'polygon' && rel.refs.indexOf(String(spec.i)) > 0 && rel.refs.indexOf(String(spec.j)) > 0; });
      if (corner && opts.keepCorner !== false && (keep.length || lenDims.length || polyHeld) && !pl.sa.free && !pl.sb.free) {
        E.push({ t: 'point', x: P[0], y: P[1], construction: true, sharp: true });
        sharp = E.length - 1;
        var sref = String(sharp);
        keep.forEach(function (rel) { rel.refs = rel.refs.map(function (x) { return gone.indexOf(String(x)) >= 0 ? sref : x; }); });
        lenDims.forEach(function (d) {
          var es = d.e === spec.i ? spec.ei : spec.ej, far = d.e + '.' + otherEnd(es);
          // the dimension keeps its side (it ran p1 -> p2 along the line), its direction and whether it was driven
          var rel = { type: 'distance', refs: es === 'p1' ? [sref, far] : [far, sref], v: lens[d.e][d.k] };
          if (d.k === 'dx') rel.dir = 'h'; else if (d.k === 'dy') rel.dir = 'v';
          if (d.tx != null) rel.tx = d.tx;
          if (d.off != null) rel.off = d.off;
          if (d.driven) rel.driven = true;
          keep.push(rel);
        });
      } else keep = [];
      // the corner's length dimensions go with it (moved to the sharp, or with Keep constrained corners off, deleted)
      if (lenDims.length && sketch.dims) sketch.dims = sketch.dims.filter(function (d) { return lenDims.indexOf(d) < 0; });
      if (sketch.rels) sketch.rels = sketch.rels.filter(function (rel) { return keep.indexOf(rel) >= 0 || !rel.refs.some(function (x) { return gone.indexOf(String(x)) >= 0; }); });
      sketch.rels = sketch.rels || [];
      keep.forEach(function (rel) { if (sketch.rels.indexOf(rel) < 0) sketch.rels.push(rel); });
      if (sharp >= 0) made.push({ type: 'coincident', refs: [String(sharp), String(spec.i)] }, { type: 'coincident', refs: [String(sharp), String(spec.j)] });
      // each side: its end Coincident with the fillet's end and Tangent there (a circle: the fillet's end lies on it; a
      // spline or a circle second in the Tangent, so the relation finds the shared point from the fillet's side)
      [[spec.i, endI, pl.ccw ? '.p1' : '.p2'], [spec.j, endJ, pl.ccw ? '.p2' : '.p1']].forEach(function (q) {
        var arcEnd = k + q[2], ent = E[q[0]];
        made.push({ type: 'coincident', refs: [q[1] || String(q[0]), arcEnd] });
        made.push({ type: 'tangent', refs: ent.t === 'circle' || ent.t === 'spline' ? [String(k), String(q[0])] : [String(q[0]), String(k)] });
      });
      made.forEach(function (rel) { sketch.rels.push(rel); });
      // p9-sketchfix: both ends can carry the same relation (each end Coincident with the origin): on the sharp, one
      dedupe(sketch, true);
      var toward = P ? Math.atan2(P[1] - pl.C[1], P[0] - pl.C[0]) : (pl.arc.a0 + pl.arc.a1) / 2 * D2R;
      if (opts.equalTo != null && E[opts.equalTo] && E[opts.equalTo].t === 'arc' && opts.equalTo !== k) {
        var eq = { type: 'equal', refs: [String(opts.equalTo), String(k)] };
        sketch.rels.push(eq); made.push(eq);
      } else if (opts.dimension !== false) {
        // the radius is dimensioned, as SolidWorks dimensions a fillet, so the corner stays as defined as it was
        (sketch.dims = sketch.dims || []).push({ e: k, k: 'r', ang: Math.round(toward / D2R * 10) / 10, off: Math.round((P ? len(sub(P, pl.C)) : r * 1.6) * 1e4) / 1e4 });
      }
      var res = solve(sketch), an = analyze(sketch);
      if (!res.ok || an.conflicts > before.conflicts) {
        tRestore(sketch, saved);
        return { ok: false, error: 'The fillet conflicts with the sketch\'s relations or dimensions.' };
      }
      if (an.redundant > before.redundant) an = dropRedundant(sketch, keep.concat(made), before);
      if (sketch.rels && !sketch.rels.length) delete sketch.rels;
      return { ok: true, arc: k, sharp: sharp, analysis: an };
    }
  }
  // ---- sketch-tools2: Sketch Fillet ▸ Fillet all corners of the chain
  // The corners (curveCorner's shape) of the chain of lines and arcs joined end to end through corner c, c first, then
  // in chain order (an open chain both ways); joins that already run on smoothly (tangent) are not corners.
  function chainCorners(sketch, c) {
    var E = sketch.entities, out = [c], seen = {};
    seen[c.i] = seen[c.j] = true;
    function partner(k, end) {
      var P = endOf(E[k], end);
      for (var m = 0; m < E.length; m++) {
        if (m === k || !curveEnt(E[m])) continue;
        for (var b = 1; b <= 2; b++) if (nearPt(P, endOf(E[m], 'p' + b), joinTol(P))) return { k: m, end: 'p' + b };
      }
      return null;
    }
    function add(k, ek, nb) {
      var di = intoDir(E[k], ek), dj = intoDir(E[nb.k], nb.end), at = endOf(E[k], ek);
      if (Math.abs(crs(di, dj)) < 1e-6 && dot(di, dj) < 0) return;   // smooth
      if (out.some(function (o) { return nearPt(o.at, at, joinTol(at)); })) return;
      out.push({ i: k, ei: ek, j: nb.k, ej: nb.end, at: at.slice() });
    }
    // from entity k, which the walk entered by its end `from`, on through its other end
    function walk(k, from) {
      for (var guard = 0; guard <= E.length; guard++) {
        var ek = otherEnd(from), nb = partner(k, ek);
        if (!nb) return;
        add(k, ek, nb);
        if (seen[nb.k]) return;   // round a closed chain
        seen[nb.k] = true; k = nb.k; from = nb.end;
      }
    }
    walk(c.j, c.ej);
    walk(c.i, c.ei);
    return out;
  }
  // Fillet every corner of the chain through corner c with radius r, all or nothing: the first fillet gets the radius
  // dimension (or opts.equalTo, an earlier fillet arc: Equal to it), the others Equal to the first (opts.dimEach: each
  // its own radius dimension); opts.keepCorner as filletPair's. Returns { ok, arcs, error }.
  function filletChain(sketch, c, r, opts) {
    return filletCorners(sketch, chainCorners(sketch, c).map(function (k) { return k.at; }), r, opts);
  }
  // rfAX: the corners where the given entities meet one another (end to end, not smoothly): Sketch Fillet with several
  // entities (a rectangle, a closed contour, a box selection) selected rounds every one of them, as SolidWorks does.
  // Construction geometry is left out. -> [{ i, ei, j, ej, at }]
  function selectionCorners(sketch, list) {
    var E = sketch.entities || [], out = [], ids = (list || []).filter(function (i, k, a) { return a.indexOf(i) === k && cornerEnt(E[i]) && !E[i].construction; });
    for (var a = 0; a < ids.length; a++) for (var b = a + 1; b < ids.length; b++) {
      var i = ids[a], j = ids[b];
      if (splineOpen(E[i]) && splineOpen(E[j])) continue;
      for (var x = 1; x <= 2; x++) for (var y = 1; y <= 2; y++) {
        var ei = 'p' + x, ej = 'p' + y, P = endOf(E[i], ei), Q = endOf(E[j], ej);
        if (!nearPt(P, Q, joinTol(P))) continue;
        var di = intoDir(E[i], ei), dj = intoDir(E[j], ej);
        if (Math.abs(crs(di, dj)) < 1e-6 && dot(di, dj) < 0) continue;   // smooth: no corner
        if (out.some(function (o) { return nearPt(o.at, P, joinTol(P)); })) continue;
        out.push({ i: i, ei: ei, j: j, ej: ej, at: P.slice() });
      }
    }
    return out;
  }
  // every corner at (a list of points) filleted with radius r, all or nothing (filletChain's rules); -> { ok, arcs, error }
  function filletCorners(sketch, corners, r, opts) {
    opts = opts || {};
    corners = corners.map(function (c) { return Array.isArray(c) ? c : c.at; });   // points, or curveCorner records (an array has its own .at)
    var saved = tSave(sketch), arcs = [], first = opts.equalTo != null ? opts.equalTo : null;
    for (var n = 0; n < corners.length; n++) {
      var at = corners[n], cc = curveCorner(sketch, at, 1e-5 * Math.max(1, Math.abs(at[0]), Math.abs(at[1])));
      if (!cc) { tRestore(sketch, saved); return { ok: false, error: 'The corner at (' + fmtL(at[0]) + ', ' + fmtL(at[1]) + ') is gone: an earlier fillet of the chain took it.' }; }
      var o = { keepCorner: opts.keepCorner !== false };
      if (first != null && !opts.dimEach && sketch.entities[first] && sketch.entities[first].t === 'arc') { o.equalTo = first; o.dimension = false; }
      var res = filletPair(sketch, cc, r, o);
      if (!res.ok) { tRestore(sketch, saved); return { ok: false, error: res.error + (corners.length > 1 ? ' (corner ' + (n + 1) + ' of ' + corners.length + ' in the chain)' : '') }; }
      if (first == null) first = res.arc;
      arcs.push(res.arc);
    }
    return { ok: true, arcs: arcs, analysis: analyze(sketch) };
  }

  // ---- Sketch Chamfer (SolidWorks: the Sketch Fillet flyout ▸ Sketch Chamfer)
  // Between two lines at a corner (spec { i, ei, j, ej, at }) or two lines picked anywhere (spec { i, uvi, j, uvj }:
  // their carriers' crossing is the corner, each keeping the side clicked). Both lines are cut back, a line joins the cut
  // ends (Coincident), and a virtual sharp stays at the corner with the corner's relations and the chamfer's driving
  // dimensions: Distance-distance, the distances from the sharp along each line (opts.d1, opts.d2; opts.equal: d2 = d1);
  // Angle-distance, the distance along the first line and the angle from it to the chamfer (opts.angle, degrees).
  // Returns { ok, line, sharp, analysis, error }.
  function chamferPair(sketch, spec, opts) {
    opts = opts || {};
    var E = sketch.entities, A = E[spec.i], B = E[spec.j];
    if (spec.i === spec.j || !A || !B || A.t !== 'line' || B.t !== 'line') return { ok: false, error: 'A sketch chamfer needs two lines.' };
    var angleType = opts.type === 'angle', d1 = +opts.d1, d2 = opts.equal || angleType ? d1 : +opts.d2, ang = +opts.angle;
    if (!(d1 > 0) || !isFinite(d1) || !(d2 > 0) || !isFinite(d2)) return { ok: false, error: 'The chamfer distances must be positive numbers.' };
    if (angleType && !(ang > 0 && ang < 180)) return { ok: false, error: 'The chamfer angle must be between 0 and 180 degrees.' };
    spec = asCorner(E, spec);
    var corner = !!spec.ei, P, keepA, keepB;
    if (corner) { P = spec.at; keepA = otherEnd(spec.ei); keepB = otherEnd(spec.ej); }
    else {
      var X = carrierMeet(tCarrier(A), tCarrier(B));
      if (!X.length) return { ok: false, error: 'The lines are parallel: there is no corner to chamfer.' };
      P = X[0];
      var side = function (e, uv) {
        var best = null, bd = -1;
        ['p1', 'p2'].forEach(function (s) { var q = endOf(e, s), dd = len(sub(q, P)); if (dot(sub(q, P), sub(uv, P)) > 0 && dd > bd) { bd = dd; best = s; } });
        return best;
      };
      keepA = side(A, spec.uvi); keepB = side(B, spec.uvj);
      if (!keepA || !keepB) return { ok: false, error: 'Click each line on the side to keep.' };
    }
    var KA = endOf(A, keepA), KB = endOf(B, keepB), la = len(sub(KA, P)), lb = len(sub(KB, P));
    if (la < 1e-12 || lb < 1e-12) return { ok: false, error: 'One of the lines has no length.' };
    var u = [(KA[0] - P[0]) / la, (KA[1] - P[1]) / la], v = [(KB[0] - P[0]) / lb, (KB[1] - P[1]) / lb];
    var th = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
    if (th < 1e-6 || Math.PI - th < 1e-6) return { ok: false, error: 'The lines are collinear: there is no corner to chamfer.' };
    var dA = d1, dB = d2;
    if (angleType) {
      if (th + ang * D2R >= Math.PI - 1e-9) return { ok: false, error: 'Angle too large: the chamfer would not meet the second line.' };
      dB = d1 * Math.sin(ang * D2R) / Math.sin(th + ang * D2R);
    }
    if (dA >= la * (1 - 1e-9) || dB >= lb * (1 - 1e-9)) return { ok: false, error: 'Distance too large: the chamfer would be longer than the lines.' };
    var T1 = [P[0] + u[0] * dA, P[1] + u[1] * dA], T2 = [P[0] + v[0] * dB, P[1] + v[1] * dB];
    var saved = tSave(sketch), before = analyze(sketch);
    try { return chamferApply(); } catch (err) { tRestore(sketch, saved); return { ok: false, error: 'The chamfer could not be made: ' + err.message }; }
    function chamferApply() {
      var mvA = otherEnd(keepA), mvB = otherEnd(keepB), gone = [spec.i + '.' + mvA, spec.j + '.' + mvB], lens = {};
      lens[spec.i] = { len: la, dx: Math.abs(KA[0] - P[0]), dy: Math.abs(KA[1] - P[1]) }; lens[spec.j] = { len: lb, dx: Math.abs(KB[0] - P[0]), dy: Math.abs(KB[1] - P[1]) };
      applyReshape(A, { move: mvA, pt: T1 }); applyReshape(B, { move: mvB, pt: T2 });
      var ch = { t: 'line', x1: T1[0], y1: T1[1], x2: T2[0], y2: T2[1] };
      if (A.construction && B.construction) ch.construction = true;
      E.push(ch);
      var k = E.length - 1;
      E.push({ t: 'point', x: P[0], y: P[1], construction: true, sharp: true });
      var sharp = E.length - 1, sref = String(sharp), keep = [], made = [];
      if (corner) {
        keep = (sketch.rels || []).filter(function (rel) {
          var n = rel.refs.filter(function (x) { return gone.indexOf(String(x)) >= 0; }).length;
          if (!n || (rel.type === 'coincident' && n === 2)) return false;
          if (rel.type === 'coincident' && (rel.refs.indexOf(String(spec.i)) >= 0 || rel.refs.indexOf(String(spec.j)) >= 0)) return false;
          return true;
        });
        keep.forEach(function (rel) { rel.refs = rel.refs.map(function (x) { return gone.indexOf(String(x)) >= 0 ? sref : x; }); });
        var lenDims = (sketch.dims || []).filter(function (d) { return (d.e === spec.i || d.e === spec.j) && (d.k === 'len' || d.k === 'dx' || d.k === 'dy'); });
        lenDims.forEach(function (d) {
          var mv = d.e === spec.i ? mvA : mvB, far = d.e + '.' + otherEnd(mv);
          var rel = { type: 'distance', refs: mv === 'p1' ? [sref, far] : [far, sref], v: lens[d.e][d.k] };
          if (d.k === 'dx') rel.dir = 'h'; else if (d.k === 'dy') rel.dir = 'v';
          if (d.tx != null) rel.tx = d.tx;
          if (d.off != null) rel.off = d.off;
          if (d.driven) rel.driven = true;
          keep.push(rel);
        });
        if (lenDims.length) sketch.dims = sketch.dims.filter(function (d) { return lenDims.indexOf(d) < 0; });
      }
      if (sketch.rels) sketch.rels = sketch.rels.filter(function (rel) { return keep.indexOf(rel) >= 0 || !rel.refs.some(function (x) { return gone.indexOf(String(x)) >= 0; }); });
      sketch.rels = sketch.rels || [];
      keep.forEach(function (rel) { if (sketch.rels.indexOf(rel) < 0) sketch.rels.push(rel); });
      made.push({ type: 'coincident', refs: [sref, String(spec.i)] }, { type: 'coincident', refs: [sref, String(spec.j)] },
                { type: 'coincident', refs: [gone[0], k + '.p1'] }, { type: 'coincident', refs: [gone[1], k + '.p2'] });
      made.forEach(function (rel) { sketch.rels.push(rel); });
      dedupe(sketch, true);
      var dims = [{ type: 'distance', refs: [sref, gone[0]], v: dA }];
      if (angleType) {
        var m = Math.abs(angleDeg(refCurve(E, parseRef(String(spec.i))), refCurve(E, parseRef(String(k))))), ar = { type: 'angle', refs: [String(spec.i), String(k)], v: ang };
        if (Math.abs(m - ang) > Math.abs(180 - m - ang)) ar.sup = true;
        dims.push(ar);
      } else dims.push({ type: 'distance', refs: [sref, gone[1]], v: dB });
      dims.forEach(function (rel) { sketch.rels.push(rel); });
      var res = solve(sketch), an = analyze(sketch);
      if (!res.ok || an.conflicts > before.conflicts) {
        tRestore(sketch, saved);
        return { ok: false, error: 'The chamfer conflicts with the sketch\'s relations or dimensions.' };
      }
      if (an.redundant > before.redundant) an = dropRedundant(sketch, keep.concat(made, dims), before);
      return { ok: true, line: k, sharp: sharp, analysis: an };
    }
  }

  // ---- Offset Entities on chains of lines and arcs
  // A chain: lines / arcs joined end to end, in order; item { i, dir } (dir 1: travelled p1 -> p2). The offset copy of
  // each runs at a signed distance d to the left of the travel; where the chain runs on smoothly the copies stay joined
  // at the offset of the shared point (join 't'), at a corner they are extended or cut back to the crossing of the
  // offset curves (join 'x', a sharp corner as SolidWorks' Offset Entities makes it).
  function itemPts(e, dir) { var a = endOf(e, 'p1'), b = endOf(e, 'p2'); return dir === 1 ? [a, b] : [b, a]; }
  function itemTan(e, dir, p) {
    var t = e.t === 'line' ? unit(sub([e.x2, e.y2], [e.x1, e.y1])) : ccwTan(Math.atan2(p[1] - e.cy, p[0] - e.cx));
    return dir === 1 ? t : [-t[0], -t[1]];
  }
  function itemOffsetPt(e, dir, p, d) { var t = itemTan(e, dir, p); return [p[0] - t[1] * d, p[1] + t[0] * d]; }
  function itemCarrier(e, dir, d) {
    if (e.t === 'line') { var a = itemOffsetPt(e, dir, [e.x1, e.y1], d), b = itemOffsetPt(e, dir, [e.x2, e.y2], d); return { kind: 'line', a: a, b: b }; }
    var r = e.r - dir * d;
    return r > 1e-9 * Math.max(1, e.r) ? { kind: 'circle', c: [e.cx, e.cy], r: r } : null;
  }
  function chainJoins(E, items, closed) {
    var n = items.length, out = [];
    for (var k = 0; k < (closed ? n : n - 1); k++) {
      var a = items[k], b = items[(k + 1) % n], P = itemPts(E[a.i], a.dir)[1], ta = itemTan(E[a.i], a.dir, P), tb = itemTan(E[b.i], b.dir, itemPts(E[b.i], b.dir)[0]);
      out.push(Math.abs(crs(ta, tb)) < 1e-6 && dot(ta, tb) > 0 ? 't' : 'x');
    }
    return out;
  }
  // the offset copies of a chain at signed distance d, one per item, or null when a corner cannot be made (too large)
  function chainOffsetGeom(E, items, closed, d, joins) {
    var n = items.length, carr = [], pts = [], corner = [], k;
    for (k = 0; k < n; k++) {
      var e = E[items[k].i];
      if (!curveEnt(e)) return null;
      pts.push(itemPts(e, items[k].dir));
      var c = itemCarrier(e, items[k].dir, d);
      if (!c) return null;
      carr.push(c);
    }
    for (k = 0; k < (closed ? n : n - 1); k++) {
      var k2 = (k + 1) % n, P = pts[k][1], qa = itemOffsetPt(E[items[k].i], items[k].dir, P, d), qb = itemOffsetPt(E[items[k2].i], items[k2].dir, pts[k2][0], d);
      if (joins[k] === 't') { corner.push([qa, qb]); continue; }
      var hits = carrierMeet(carr[k], carr[k2]);
      if (!hits.length) return null;
      var m = [(qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2], h = hits[0];
      hits.forEach(function (x) { if (len(sub(x, m)) < len(sub(h, m))) h = x; });
      corner.push([h, h]);
    }
    var out = [];
    for (k = 0; k < n; k++) {
      var b = E[items[k].i], dir = items[k].dir, o;
      var s = k > 0 || closed ? corner[(k - 1 + n) % n][1] : itemOffsetPt(b, dir, pts[k][0], d);
      var t = k < n - 1 || closed ? corner[k][0] : itemOffsetPt(b, dir, pts[k][1], d);
      if (b.t === 'line') {
        var p1 = dir === 1 ? s : t, p2 = dir === 1 ? t : s;
        // a copy keeps its base's direction: one that turned round (the offset is too large for a corner) fails
        if (dot(sub(p2, p1), sub([b.x2, b.y2], [b.x1, b.y1])) <= 0) return null;
        o = { t: 'line', x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] };
      } else {
        var as = Math.atan2(s[1] - b.cy, s[0] - b.cx) / D2R, at = Math.atan2(t[1] - b.cy, t[0] - b.cx) / D2R;
        var sw = dir === 1 ? normDeg(at - as) : normDeg(as - at), a0 = dir === 1 ? as : at;
        if (sw < 1e-6 || Math.abs(sw - (b.a1 - b.a0)) > 180) return null;
        o = normArc({ t: 'arc', cx: b.cx, cy: b.cy, r: carr[k].r, a0: a0, a1: a0 + sw });
      }
      out.push(o);
    }
    return out;
  }
  // a cap at the start (which 0) or end (1) of an open chain offset both ways: an arc round the end point or a line
  function capGeom(E, items, d, which, kind) {
    var it = items[which ? items.length - 1 : 0], e = E[it.i], B0 = itemPts(e, it.dir)[which ? 1 : 0], t0 = itemTan(e, it.dir, B0);
    var L = itemOffsetPt(e, it.dir, B0, d), R = itemOffsetPt(e, it.dir, B0, -d), out = which ? t0 : [-t0[0], -t0[1]];
    if (kind === 'line') return { t: 'line', x1: L[0], y1: L[1], x2: R[0], y2: R[1] };
    var aL = Math.atan2(L[1] - B0[1], L[0] - B0[0]) / D2R, aR = Math.atan2(R[1] - B0[1], R[0] - B0[0]) / D2R, mid = (aL + normDeg(aR - aL) / 2) * D2R;
    var a0 = dot([Math.cos(mid), Math.sin(mid)], out) > 0 ? aL : aR, a1 = a0 + normDeg((a0 === aL ? aR : aL) - a0);
    return normArc({ t: 'arc', cx: B0[0], cy: B0[1], r: Math.abs(d), a0: a0, a1: a1 });
  }
  // every copy an offset chain relation holds, in its order: the copies at d, at -d (bi-directional), the two caps
  function chainExpected(E, items, ch, d) {
    var joins = ch.joins || chainJoins(E, items, ch.closed), left = chainOffsetGeom(E, items, ch.closed, d, joins);
    if (!left) return null;
    if (!ch.bi) return left;
    var right = chainOffsetGeom(E, items, ch.closed, -d, joins);
    if (!right) return null;
    var out = left.concat(right);
    if (ch.cap && !ch.closed) out.push(capGeom(E, items, d, 0, ch.cap), capGeom(E, items, d, 1, ch.cap));
    return out;
  }
  // The Offset relation of a chain (rel.chain { n, dirs, closed, joins, bi, cap }, refs: the n base entities, then the
  // copies): every copy is the offset of the base chain at the distance the first copy sits from its base. That first
  // copy is held by its ends along its base only (Parallel / Concentric and the offset dimension hold the rest), the
  // others whole, so one dimension drives the whole chain and nothing is repeated.
  function chainEquation(ents, rel, R) {
    var ch = rel.chain, n = ch.n | 0, idx = R.map(function (r) { return r.o || r.s !== null ? -1 : r.e; });
    if (!(n >= 1) || !Array.isArray(ch.dirs) || ch.dirs.length !== n || idx.some(function (e) { return e < 0 || !ents[e]; })) return null;
    var bases = idx.slice(0, n), copies = idx.slice(n), items = bases.map(function (b, k) { return { i: b, dir: ch.dirs[k] === -1 ? -1 : 1 }; });
    if (bases.some(function (b) { return !curveEnt(ents[b]); })) return null;
    var c0 = ents[copies[0]], b0 = ents[bases[0]];
    if (!c0 || c0.t !== b0.t) return null;
    function dOf(E) {
      var b = E[bases[0]], c = E[copies[0]];
      if (b.t === 'line') { var t = itemTan(b, items[0].dir), mid = [(c.x1 + c.x2) / 2, (c.y1 + c.y2) / 2]; return dot(sub(mid, [b.x1, b.y1]), [-t[1], t[0]]); }
      return items[0].dir * (b.r - c.r);
    }
    var exp0 = chainExpected(ents, items, ch, dOf(ents));
    if (!exp0 || exp0.length !== copies.length || exp0.some(function (x, q) { return ents[copies[q]].t !== x.t; })) return null;
    var rows = 0, layout = copies.map(function (c, q) { var names = paramNames(ents[c]), cnt = q === 0 ? 2 : names.length; rows += cnt; return { c: c, names: names }; });
    var f = function (E) {
      var exp = chainExpected(E, items, ch, dOf(E)), out = [];
      if (!exp) { for (var z = 0; z < rows; z++) out.push(1e6); return out; }
      layout.forEach(function (L, q) {
        var c = E[L.c], x = exp[q];
        if (q === 0) {
          if (c.t === 'line') { var u = unit(sub([E[bases[0]].x2, E[bases[0]].y2], [E[bases[0]].x1, E[bases[0]].y1])); out.push(dot(sub([c.x1, c.y1], [x.x1, x.y1]), u), dot(sub([c.x2, c.y2], [x.x2, x.y2]), u)); }
          else out.push(angDiff(c.a0, x.a0), angDiff(c.a1, x.a1));
          return;
        }
        L.names.forEach(function (nm) { var a = pget(c, nm), b = pget(x, nm); out.push(nm === 'a0' || nm === 'a1' ? angDiff(a, b) : a - b); });
      });
      return out;
    };
    return { n: rows, f: f, ents: bases.concat(copies) };
  }
  // The chains among line / arc entities `idx` (joined end to end by geometry, never through a branch). With expand
  // (Select chain), a chain grows through the rest of the sketch's lines and arcs as well. [{ items, closed }]
  function offsetChains(sketch, idx, expand) {
    var E = sketch.entities, pool = expand ? E.map(function (e, i) { return i; }).filter(function (i) { return curveEnt(E[i]); }) : idx.filter(function (i) { return curveEnt(E[i]); });
    var nodes = [], ends = {};
    function node(p) { for (var q = 0; q < nodes.length; q++) if (nearPt(nodes[q].p, p, joinTol(p))) return q; nodes.push({ p: p, at: [] }); return nodes.length - 1; }
    pool.forEach(function (i) { var a = node(endOf(E[i], 'p1')), b = node(endOf(E[i], 'p2')); ends[i] = [a, b]; nodes[a].at.push(i); if (b !== a) nodes[b].at.push(i); });
    function next(nd, cur) { var at = nodes[nd].at; return at.length === 2 ? (at[0] === cur ? at[1] : at[0]) : -1; }
    var used = {}, out = [];
    idx.forEach(function (s) {
      if (!curveEnt(E[s]) || used[s] || !ends[s]) return;
      used[s] = true;
      var items = [{ i: s, dir: 1 }], closed = false, cur = s, nd = ends[s][1], nx;
      while ((nx = next(nd, cur)) >= 0) {
        if (nx === s) { closed = true; break; }
        if (used[nx]) break;
        var dir = ends[nx][0] === nd ? 1 : -1;
        items.push({ i: nx, dir: dir }); used[nx] = true; cur = nx; nd = dir === 1 ? ends[nx][1] : ends[nx][0];
      }
      if (!closed) {
        cur = s; nd = ends[s][0];
        while ((nx = next(nd, cur)) >= 0 && !used[nx]) {
          var dr = ends[nx][1] === nd ? 1 : -1;
          items.unshift({ i: nx, dir: dr }); used[nx] = true; cur = nx; nd = dr === 1 ? ends[nx][0] : ends[nx][1];
        }
      }
      out.push({ items: items, closed: closed });
    });
    return out;
  }
  // which side "out" is: the side away from what the chain encloses (a closed chain), or bends round (an open one,
  // closed by its chord); a straight run offsets to its left. +1: left of the travel, -1: right.
  function chainOutSide(E, items) {
    var pts = [];
    items.forEach(function (it) {
      var e = E[it.i], p = itemPts(e, it.dir);
      pts.push(p[0]);
      if (e.t === 'arc') { var m = (e.a0 + e.a1) / 2 * D2R; pts.push([e.cx + e.r * Math.cos(m), e.cy + e.r * Math.sin(m)]); }
    });
    pts.push(itemPts(E[items[items.length - 1].i], items[items.length - 1].dir)[1]);
    var a = 0;
    for (var k = 0; k < pts.length; k++) { var p = pts[k], q = pts[(k + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
    var scale = 0;
    pts.forEach(function (p) { scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1])); });
    return Math.abs(a) <= 1e-9 * Math.max(1, scale * scale) ? 1 : a > 0 ? -1 : 1;
  }
  // Offset Entities on entities `idx`. opts: { d (> 0), reverse, chain (Select chain), bi (Bi-directional), cap ('arc' |
  // 'line' | '': Cap ends), dims (Add dimensions), base / offset (Construction geometry: base / offset geometry),
  // preview }. Lines and arcs joined end to end are offset as chains held by one Offset relation and a driving offset
  // dimension (with Parallel / Concentric on the first copy); circles, rectangles, slots and polygons stay true entities
  // (Offset Entities' own relations); closed polylines become offset polylines. With preview: { ok, entities } and
  // nothing changes; otherwise { ok, added: [indices], analysis, error }.
  function offsetSelection(sketch, idx, opts) {
    opts = opts || {};
    var E = sketch.entities, d = Math.abs(+opts.d), flip = opts.reverse ? -1 : 1;
    if (!(d > 0) || !isFinite(d)) return { ok: false, error: 'The offset distance must be a positive number.' };
    var sel = uniqSorted(idx, E).filter(function (i) { return !E[i].sharp; });
    if (!sel.length) return { ok: false, error: 'Select the sketch entities to offset.' };
    var chains = offsetChains(sketch, sel, opts.chain !== false), jobs = [], geo = [];
    chains.forEach(function (c) {
      var spec = { n: c.items.length, dirs: c.items.map(function (it) { return it.dir; }), closed: c.closed, joins: chainJoins(E, c.items, c.closed), bi: !!opts.bi, cap: opts.bi && opts.cap && !c.closed ? opts.cap : '' };
      var sd = chainOutSide(E, c.items) * flip * d, g = chainExpected(E, c.items, spec, sd);
      if (!g) { jobs.error = 'The offset distance is too large for the chain at ' + refName(sketch, String(c.items[0].i)) + ': a corner cannot be made.'; return; }
      jobs.push({ chain: c, spec: spec, sd: sd, geo: g });
      geo = geo.concat(g);
    });
    if (jobs.error) return { ok: false, error: jobs.error };
    sel.forEach(function (i) {
      var e = E[i];
      if (curveEnt(e)) return;
      var g = [];
      if (e.t === 'polyline') {
        if (!e.closed || !K || !K.offsetLoop) return;
        [1, -1].slice(0, opts.bi ? 2 : 1).forEach(function (s) {
          var loop = e.pts, sg = s * flip * (K.signedArea(loop) >= 0 ? 1 : -1);
          g.push({ t: 'polyline', pts: K.offsetLoop(loop, sg * d).map(function (p) { return [p[0], p[1]]; }), closed: true });
        });
      } else {
        [1, -1].slice(0, opts.bi ? 2 : 1).forEach(function (s) { var o = offsetEntity(e, s * flip * d); if (o) g.push(o); });
        if (!g.length) { jobs.error = 'The offset distance is too large for ' + refName(sketch, String(i)) + '.'; return; }
      }
      if (g.length) { jobs.push({ single: i, geo: g }); geo = geo.concat(g); }
    });
    if (jobs.error) return { ok: false, error: jobs.error };
    if (!jobs.length) return { ok: false, error: 'Nothing among the selected entities can be offset.' };
    if (opts.preview) return { ok: true, entities: geo };
    var saved = tSave(sketch), before = analyze(sketch);
    try { return offsetApply(); } catch (err) { tRestore(sketch, saved); return { ok: false, error: 'The offset could not be made: ' + err.message }; }
    function offsetApply() {
      var added = [], made = [];
      function push(o) { var c = clone(o); if (opts.offset) c.construction = true; E.push(c); added.push(E.length - 1); return E.length - 1; }
      jobs.forEach(function (job) {
        if (job.chain) {
          var bases = job.chain.items.map(function (it) { return it.i; }), copies = job.geo.map(push);
          var rel = { type: 'offset', refs: bases.concat(copies).map(String), chain: job.spec };
          sketch.rels = sketch.rels || [];
          sketch.rels.push(rel); made.push(rel);
          var b0 = bases[0], c0 = copies[0], first = { type: E[b0].t === 'line' ? 'parallel' : 'concentric', refs: [String(b0), String(c0)] };
          sketch.rels.push(first); made.push(first);
          if (opts.dims !== false) { var dr = { type: 'distance', refs: [String(b0), String(c0)], v: d }; if (E[b0].t === 'arc') dr.dir = 'r'; sketch.rels.push(dr); made.push(dr); }
          if (opts.base) bases.forEach(function (b) { E[b].construction = true; });
          return;
        }
        var i = job.single;
        job.geo.forEach(function (g) {
          var j = push(g);
          if (E[i].t === 'polyline') return;
          offsetRelations(sketch, i, j).forEach(function (r) { (sketch.rels = sketch.rels || []).push(r); made.push(r); });
          if (opts.dims !== false) {
            // r6/sketch6: the driving offset dimension Offset Entities adds (offsetDimensions solves it in)
            var nRel = (sketch.rels || []).length;
            offsetDimensions(sketch, i, j, d);
            (sketch.rels || []).slice(nRel).forEach(function (r) { made.push(r); });
          }
        });
        if (opts.base) E[i].construction = true;
      });
      var res = solve(sketch), an = analyze(sketch);
      if (!res.ok || an.conflicts > before.conflicts) {
        tRestore(sketch, saved);
        return { ok: false, error: 'The offset conflicts with the sketch\'s relations or dimensions.' };
      }
      if (an.redundant > before.redundant) an = dropRedundant(sketch, made, before);
      return { ok: true, added: added, analysis: an };
    }
  }

  // ---- Move / Copy / Rotate / Scale / Stretch Entities
  // xf: { dx, dy } (move) | { rot: degrees, cx, cy } (rotate about cx, cy) | { s: factor, cx, cy } (scale about cx, cy)
  function xfPt(p, xf) {
    if (xf.rot != null) {
      // rfA: the turn's round-off goes (a line rotated 90° ended at x 1.0000000000000002, not 1)
      var a = xf.rot * D2R, c = Math.cos(a), s = Math.sin(a), x = p[0] - xf.cx, y = p[1] - xf.cy, sc = Math.max(1, Math.abs(p[0]), Math.abs(p[1]), Math.abs(xf.cx), Math.abs(xf.cy));
      var tidy = function (v) { var r = +v.toPrecision(12); return Math.abs(r) < 1e-12 * sc ? 0 : r; };
      return [tidy(xf.cx + c * x - s * y), tidy(xf.cy + s * x + c * y)];
    }
    if (xf.s != null) return [xf.cx + (p[0] - xf.cx) * xf.s, xf.cy + (p[1] - xf.cy) * xf.s];
    return [p[0] + (+xf.dx || 0), p[1] + (+xf.dy || 0)];
  }
  function xfTurns(xf) { return xf.rot != null && Math.min(normDeg(xf.rot), 360 - normDeg(xf.rot)) > 1e-9; }
  // entity e moved by xf (a new object), or null for an entity xf cannot carry (a rectangle turned: explode it first)
  function xfEntity(e, xf) {
    var o = clone(e), rot = xf.rot != null ? +xf.rot : 0, k = xf.s != null ? +xf.s : 1, q;
    if (e.t === 'text' && K && K.transformText) return K.transformText(e, xf);   // sketch-text: moved / turned / scaled copies
    switch (e.t) {
      case 'line': case 'slot':
        q = xfPt([e.x1, e.y1], xf); o.x1 = q[0]; o.y1 = q[1];
        q = xfPt([e.x2, e.y2], xf); o.x2 = q[0]; o.y2 = q[1];
        if (e.t === 'slot') o.w = e.w * k;
        break;
      case 'point': q = xfPt([e.x, e.y], xf); o.x = q[0]; o.y = q[1]; break;
      case 'circle': case 'arc': case 'poly': case 'crect':
        if (e.t === 'crect' && xfTurns(xf)) return null;
        q = xfPt([e.cx, e.cy], xf); o.cx = q[0]; o.cy = q[1];
        if (e.t === 'crect') { o.w = e.w * k; o.h = e.h * k; break; }
        o.r = e.r * k;
        if (e.t === 'arc') { o.a0 = e.a0 + rot; o.a1 = e.a1 + rot; normArc(o); }
        if (e.t === 'poly') o.rot = (e.rot || 0) + rot;
        break;
      case 'rect':
        if (xfTurns(xf)) return null;
        q = xfPt([e.x, e.y], xf); o.x = q[0]; o.y = q[1]; o.w = e.w * k; o.h = e.h * k;
        break;
      case 'polyline': o.pts = e.pts.map(function (p) { return xfPt(p, xf); }); break;
      // sketch-refine: arc slots, splines and ellipses move, turn and scale too (Move / Copy / Rotate / Scale, the patterns)
      case 'aslot':
        q = xfPt([e.cx, e.cy], xf); o.cx = q[0]; o.cy = q[1]; o.r = e.r * k; o.w = e.w * k;
        o.a0 = e.a0 + rot; o.a1 = e.a1 + rot; normArc(o);
        break;
      case 'spline':
        o.pts = e.pts.map(function (p) { return xfPt(p, xf); });
        if (e.tans) o.tans = e.tans.map(function (tg) { return tg ? [+tg[0] + rot].concat(tg.slice(1, 3), tg[3] != null ? [tg[3] / k] : []) : tg; });   // the weight is per chord length: scale-free; rfAY: a curvature control scales as 1 / size
        break;
      case 'ellipse': case 'pellipse':
        q = xfPt([e.cx, e.cy], xf); o.cx = q[0]; o.cy = q[1]; o.rx = e.rx * k; o.ry = e.ry * k; o.rot = (+e.rot || 0) + rot;
        break;
      default: return null;
    }
    return o;
  }
  // xf applied n times (a copy's n-th repeat)
  function xfPower(xf, n) {
    if (xf.rot != null) return { rot: xf.rot * n, cx: xf.cx, cy: xf.cy };
    if (xf.s != null) return { s: Math.pow(xf.s, n), cx: xf.cx, cy: xf.cy };
    return { dx: (+xf.dx || 0) * n, dy: (+xf.dy || 0) * n };
  }
  // equations holding entities `list` where they are now (a moved selection while the rest is solved round it)
  function holdEqs(E, list) {
    return list.map(function (i) {
      var names = paramNames(E[i]), at = names.map(function (nm) { return pget(E[i], nm); });
      return { n: names.length, ents: [i], f: function (X) { return names.map(function (nm, j) { var v = pget(X[i], nm) - at[j]; return nm === 'a0' || nm === 'a1' || nm === 'rot' ? angDiff(pget(X[i], nm), at[j]) : v; }); } };
    });
  }
  // A rotation by a quarter turn swaps Horizontal / Vertical (and horizontal / vertical dimensions) on what turns; any
  // other turn drops them (they no longer hold) and a horizontal / vertical line dimension becomes its length.
  function turnRelations(rels, dims, inSel, xf) {
    if (!xfTurns(xf)) return rels;
    var a = normDeg(xf.rot), quarter = Math.abs(a - 90) < 1e-9 || Math.abs(a - 270) < 1e-9, half = Math.abs(a - 180) < 1e-9;
    if (half) return rels;
    (dims || []).forEach(function (dm) { if (inSel(String(dm.e)) && (dm.k === 'dx' || dm.k === 'dy')) dm.k = quarter ? (dm.k === 'dx' ? 'dy' : 'dx') : 'len'; });
    return rels.filter(function (rel) {
      if ((rel.type !== 'horizontal' && rel.type !== 'vertical') || !rel.refs.every(inSel)) return true;
      if (!quarter) return false;
      rel.type = rel.type === 'horizontal' ? 'vertical' : 'horizontal';
      return true;
    });
  }
  // Move / Rotate / Scale Entities (opts.copy false) or Copy Entities / Rotate / Scale with Copy (opts.copy, opts.count
  // copies, the n-th moved by xf n times) on entities `idx`. Keep relations (opts.keepRelations): moving, the relations
  // to the geometry left behind hold, so what is tied to the selection follows (Stretch Entities: lines joined to it
  // stretch); without it they are deleted first. Copying, the relations among the copied entities are copied with them
  // (not dimensions). Rectangles become four lines before they turn. Returns { ok, entities (moved) | added (copies),
  // analysis, error }.
  function transformEntities(sketch, idx, xf, opts) {
    opts = opts || {};
    if (xf.s != null && !(+xf.s > 0)) return { ok: false, error: 'The scale factor must be a positive number.' };
    var sel = uniqSorted(idx, sketch.entities);
    if (!sel.length) return { ok: false, error: 'Select the sketch entities first.' };
    var saved = tSave(sketch), before = analyze(sketch);
    try { return xfRun(); } catch (err) { tRestore(sketch, saved); return { ok: false, error: 'That could not be done: ' + err.message }; }
    function xfRun() {
      if (xfTurns(xf)) {
        for (var q = sel.length - 1; q >= 0; q--) {
          var ri = sel[q], re = sketch.entities[ri];
          if (re.t !== 'rect' && re.t !== 'crect') continue;
          var n0 = sketch.entities.length;
          explodeRect(sketch, ri);
          var shift = sketch.entities.length - n0;
          sel = sel.map(function (x) { return x > ri ? x + shift : x; });
          for (var z = 1; z <= shift; z++) sel.push(ri + z);
        }
        sel.sort(function (a, b) { return a - b; });
      }
      var E = sketch.entities, bad = sel.filter(function (i) { return !xfEntity(E[i], xf); })[0];
      if (bad != null) { tRestore(sketch, saved); return { ok: false, error: refName(sketch, String(bad)) + ' cannot be ' + (xf.rot != null ? 'rotated' : xf.s != null ? 'scaled' : 'moved') + '.' }; }
      var inSet = {};
      sel.forEach(function (i) { inSet[i] = true; });
      function inSel(r) { var p = parseRef(r); return !!(p && !p.o && inSet[p.e]); }
      if (opts.copy) {
        var count = Math.max(1, opts.count | 0), added = [], made = [], base = (sketch.rels || []).slice();
        for (var c = 1; c <= count; c++) {
          var xk = xfPower(xf, c), map = {};
          sel.forEach(function (i) { var o = xfEntity(E[i], xk); delete o.sharp; E.push(o); map[i] = E.length - 1; added.push(E.length - 1); });
          if (!opts.keepRelations) continue;
          var copied = base.filter(function (rel) { return rel.refs.every(inSel) && !(TYPES[rel.type] && TYPES[rel.type].dim) && rel.type !== 'fix' && rel.type !== 'onEdge'; }).map(function (rel) {
            var r2 = clone(rel);
            r2.refs = rel.refs.map(function (x) { var p = parseRef(x); return String(map[p.e]) + String(x).slice(String(p.e).length); });
            return r2;
          });
          copied = turnRelations(copied, null, function (x) { return true; }, xk);
          copied.forEach(function (r2) { (sketch.rels = sketch.rels || []).push(r2); made.push(r2); });
        }
        clean(sketch);
        var res = solve(sketch), an = analyze(sketch);
        if (!res.ok || an.conflicts > before.conflicts) { tRestore(sketch, saved); return { ok: false, error: 'The copies conflict with the sketch\'s relations.' }; }
        if (an.redundant > before.redundant) an = dropRedundant(sketch, made, before);
        return { ok: true, added: added, analysis: an };
      }
      if (!opts.keepRelations && sketch.rels) {
        sketch.rels = sketch.rels.filter(function (rel) { return !(rel.refs.some(inSel) && rel.refs.some(function (x) { return !inSel(x); })); });
        if (!sketch.rels.length) delete sketch.rels;
      }
      if (sketch.rels) { sketch.rels = turnRelations(sketch.rels, sketch.dims, inSel, xf); if (!sketch.rels.length) delete sketch.rels; }
      else turnRelations([], sketch.dims, inSel, xf);
      // scaled: the distances between scaled entities scale with them
      if (xf.s != null) (sketch.rels || []).forEach(function (rel) { if (rel.type === 'distance' && rel.refs.every(inSel)) rel.v *= +xf.s; });
      sel.forEach(function (i) { E[i] = xfEntity(E[i], xf); });
      var r1 = solve(sketch, { extra: holdEqs(E, sel) }), an1 = analyze(sketch);
      if (!r1.ok || an1.conflicts > before.conflicts) {
        tRestore(sketch, saved);
        return { ok: false, error: 'Relations or dimensions hold ' + (sel.length === 1 ? 'it' : 'them') + ' where ' + (sel.length === 1 ? 'it is' : 'they are') + (opts.keepRelations ? ': clear Keep relations to break the relations to the geometry left behind.' : '.') };
      }
      return { ok: true, entities: sel, analysis: an1 };
    }
  }

  // ---- rfBC: Stretch Entities by a selection box (SolidWorks)
  // stretchEntities(sketch, idx, region, { dx, dy }): region is the window / crossing box in sketch coordinates (a
  // polygon [[x, y], …]). The points of the entities idx (and of any other entity with a point in the box) that lie in
  // the box move by dx, dy; the others stay: an entity wholly inside moves, a line / slot / polyline / spline with some
  // points inside stretches, an arc with one end inside keeps its other end and is solved round it (centre and radius
  // free), a circle / polygon / ellipse moves when its centre is inside. A rectangle with two corners inside stays a
  // rectangle when it can, else becomes four lines first. Geometry not taking part follows its relations. Distances /
  // angles between entities that change are updated to the new geometry (single-entity dimensions read it). Without a
  // region it is Move with Keep relations. Returns { ok, entities, moved (point count), analysis, error }.
  function inPolygon(p, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  // the points that decide a stretch: [name, [x, y]]
  function stretchPoints(e) {
    switch (e.t) {
      case 'line': case 'slot': return [['p1', [e.x1, e.y1]], ['p2', [e.x2, e.y2]]];
      case 'point': return [['', [e.x, e.y]]];
      case 'text': return textFree(e) ? [['', [e.x, e.y]]] : [];
      case 'arc': case 'aslot': { var a = e.a0 * D2R, b = e.a1 * D2R; return [['c', [e.cx, e.cy]], ['p1', [e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]], ['p2', [e.cx + e.r * Math.cos(b), e.cy + e.r * Math.sin(b)]]]; }
      case 'rect': case 'crect': return corners(e).map(function (p, k) { return ['v' + k, p]; });
      case 'polyline': case 'spline': return e.pts.map(function (p, k) { return ['v' + k, [p[0], p[1]]]; });
      default: return e.cx != null ? [['c', [e.cx, e.cy]]] : [];
    }
  }
  function stretchEntities(sketch, idx, region, xf) {
    var dx = +xf.dx || 0, dy = +xf.dy || 0;
    if (!region || region.length < 3) return transformEntities(sketch, idx, { dx: dx, dy: dy }, { keepRelations: true });
    var sel = uniqSorted(idx, sketch.entities);
    if (!sel.length) return { ok: false, error: 'Select the sketch entities first.' };
    var saved = tSave(sketch), before = analyze(sketch);
    try { return run(); } catch (err) { tRestore(sketch, saved); return { ok: false, error: 'That could not be done: ' + err.message }; }
    function inside(p) { return inPolygon(p, region); }
    function flags(e) { return stretchPoints(e).map(function (q) { return inside(q[1]); }); }
    function run() {
      var E = sketch.entities, i, k;
      // a rectangle whose moved corners would not leave it a rectangle becomes four lines first (last first: indices shift)
      for (k = E.length - 1; k >= 0; k--) {
        var ri = k, re = E[ri];
        if (!re || (re.t !== 'rect' && re.t !== 'crect')) continue;
        var fl = flags(re), nIn = fl.filter(Boolean).length;
        if (!nIn || nIn === 4) continue;
        // a vertical side moving sideways, or a horizontal side moving up / down: still a rectangle
        var keep = nIn === 2 && ((fl[0] === fl[3] && fl[1] === fl[2] && !dy) || (fl[0] === fl[1] && fl[2] === fl[3] && !dx));
        if (keep) continue;
        var n0 = E.length;
        explodeRect(sketch, ri);
        E = sketch.entities;
        var shift = E.length - n0;
        var wasSel = sel.indexOf(ri) >= 0;
        sel = sel.map(function (x) { return x > ri ? x + shift : x; });
        if (wasSel) for (var z = 1; z <= shift; z++) sel.push(ri + z);
      }
      sel.sort(function (a, b) { return a - b; });
      var part = {};
      sel.forEach(function (j) { part[j] = true; });
      E.forEach(function (e, j) { if (e && !part[j] && flags(e).some(Boolean)) part[j] = true; });
      // hard: what goes where the box sends it (and whole moved entities); stay: what was outside the box, held where it
      // was (exactly when the relations allow it, else softly: the relations win, as a drag); arcR: a stretched arc's
      // radius, held in that second try so its free end slides rather than the arc swelling
      var hard = [], stay = [], arcR = [], movedPts = 0, touched = [];
      function holdNames(j, names) {
        var at = names.map(function (nm) { return pget(E[j], nm); });
        return { n: names.length, ents: [j], f: function (X) { return names.map(function (nm, q) { return pget(X[j], nm) - at[q]; }); } };
      }
      function holdPt(j, ref, t) { return { n: 2, ents: [j], f: function (X) { var p = refPoint(X, parseRef(j + '.' + ref)); return [p[0] - t[0], p[1] - t[1]]; } }; }
      for (i = 0; i < E.length; i++) {
        if (!part[i]) continue;
        var e = E[i], pts = stretchPoints(e), f = pts.map(function (q) { return inside(q[1]); }), nin = f.filter(Boolean).length;
        movedPts += nin;
        if (nin) touched.push(i);
        if (!nin || !pts.length) { stay = stay.concat(holdEqs(E, [i])); continue; }
        if (nin === pts.length || ((e.t === 'circle' || e.t === 'poly' || e.t === 'ellipse' || e.t === 'pellipse') && f[0])) { E[i] = xfEntity(e, { dx: dx, dy: dy }) || e; hard = hard.concat(holdEqs(E, [i])); continue; }
        var o = E[i] = clone(e), hn = [], sn = [];
        switch (e.t) {
          case 'line': case 'slot':
            if (f[0]) { o.x1 += dx; o.y1 += dy; }
            if (f[1]) { o.x2 += dx; o.y2 += dy; }
            (f[0] ? hn : sn).push('x1', 'y1');
            (f[1] ? hn : sn).push('x2', 'y2');
            if (e.t === 'slot') hn.push('w');
            break;
          case 'polyline': case 'spline':
            o.pts.forEach(function (p, q) { if (f[q]) { p[0] += dx; p[1] += dy; } (f[q] ? hn : sn).push(2 * q, 2 * q + 1); });
            break;
          case 'rect': case 'crect': {
            var c = corners(e).map(function (p, q) { return f[q] ? [p[0] + dx, p[1] + dy] : p; });
            var x0 = Math.min(c[0][0], c[1][0]), x1 = Math.max(c[0][0], c[1][0]), y0 = Math.min(c[0][1], c[3][1]), y1 = Math.max(c[0][1], c[3][1]);
            if (e.t === 'rect') { o.x = x0; o.y = y0; o.w = x1 - x0; o.h = y1 - y0; }
            else { o.cx = (x0 + x1) / 2; o.cy = (y0 + y1) / 2; o.w = x1 - x0; o.h = y1 - y0; }
            hn = paramNames(o);
            break;
          }
          case 'arc': case 'aslot': {
            // its ends held where they go (the centre and radius solved round them); an arc slot keeps its width
            if (f[0] && !f[1] && !f[2]) { E[i] = e; stay = stay.concat(holdEqs(E, [i])); continue; }   // only the centre inside: the arc stays
            [1, 2].forEach(function (q) { var t = pts[q][1]; (f[q] ? hard : stay).push(holdPt(i, 'p' + q, f[q] ? [t[0] + dx, t[1] + dy] : t)); });
            if (e.t === 'aslot') hn.push('w');
            arcR.push(holdNames(i, ['r']));
            break;
          }
          default: sn = paramNames(o);
        }
        if (hn.length) hard.push(holdNames(i, hn));
        if (sn.length) stay.push(holdNames(i, sn));
      }
      if (!movedPts) { tRestore(sketch, saved); return { ok: false, error: 'No end point lies inside the box: nothing to stretch.' }; }
      // dimensions between entities read the stretched geometry: driven while it solves, then driving at the new value
      var freed = [];
      (sketch.rels || []).forEach(function (rel) { if (TYPES[rel.type] && TYPES[rel.type].dim && !rel.driven) { rel.driven = true; freed.push(rel); } });
      // a stretched arc's own dimensions (radius, arc length) follow it, as a stretched line's length does
      var arcSet = {}, freedDims = [];
      arcR.forEach(function (q) { arcSet[q.ents[0]] = true; });
      (sketch.dims || []).forEach(function (d) { if (arcSet[d.e] && !d.driven) { d.driven = true; freedDims.push(d); } });
      var r1 = solve(sketch, { extra: hard.concat(stay) }), an1 = r1.ok ? analyze(sketch) : null;
      if (!r1.ok || an1.conflicts > before.conflicts) {
        // second try: what stayed outside the box gives way to the relations, moving as little as they need (the
        // least-norm projection onto the box's moves and the relations: what no relation ties to them keeps its place)
        var sys = buildSystem(sketch, { extra: hard.concat(arcR) });
        r1 = lm(sys, {});
        if (r1.ok && !collapsed(sketch, sys)) writeBack(sketch, sys); else r1 = { ok: false };
        updateDriven(sketch);
      }
      freedDims.forEach(function (d) { delete d.driven; });
      freed.forEach(function (rel) {
        delete rel.driven;
        var v = measure(sketch, rel.type, rel.refs, rel.dir, rel.sup, rel.ac);
        if (v != null && isFinite(v) && Math.abs(Math.abs(v) - Math.abs(rel.v)) > 1e-9 * Math.max(1, Math.abs(rel.v))) rel.v = rel.v < 0 && v > 0 ? -v : v;
      });
      an1 = analyze(sketch);
      if (!r1.ok || an1.conflicts > before.conflicts) {
        tRestore(sketch, saved);
        return { ok: false, error: 'The relations do not let it stretch that way.' };
      }
      return { ok: true, entities: touched, moved: movedPts, analysis: an1 };
    }
  }

  // ---- Linear and Circular Sketch Pattern
  // The point a pattern holds an entity by (its anchor), and the two unknowns that are that point.
  var ANCHOR = { line: ['p1', ['x1', 'y1']], slot: ['p1', ['x1', 'y1']], circle: ['c', ['cx', 'cy']], arc: ['c', ['cx', 'cy']], poly: ['c', ['cx', 'cy']], crect: ['c', ['cx', 'cy']], rect: ['v0', ['x', 'y']], polyline: ['v0', [0, 1]], point: ['', ['x', 'y']],
    aslot: ['c', ['cx', 'cy']], spline: ['v0', [0, 1]], ellipse: ['c', ['cx', 'cy']], pellipse: ['c', ['cx', 'cy']] };   // sketch-refine: arc slots, splines, ellipses
  function anchorRef(e, i) { var a = ANCHOR[e.t]; return a ? (a[0] ? i + '.' + a[0] : String(i)) : null; }
  // The Pattern relation (rel.pat { m: seeds, inst: [instance], nd | circ }, refs: the anchors, the m seeds, then the
  // copies instance by instance): every copy is its seed moved to its instance. Linear (nd directions): anchors are the
  // first seed's point and its first copy's along each direction, and instance [i, j] moves by i × (first copy along
  // direction 1 − seed) + j × (…); circular: anchors are two construction lines from the centre (to the seed, and one
  // spacing on), and instance k turns by k × the angle between them. A copy whose point is an anchor leaves that point
  // to the spacing relations.
  function patternEquation(ents, rel, R) {
    var pt = rel.pat;
    if (!pt) return null;
    var na = pt.circ ? 2 : (pt.nd | 0) + 1, m = pt.m | 0, inst = pt.inst || [];
    if (!(m >= 1) || !inst.length || R.length !== na + m * (inst.length + 1)) return null;
    var anchors = R.slice(0, na), whole = R.slice(na);
    if (whole.some(function (r) { return r.o || r.s !== null || !ents[r.e] || !ANCHOR[ents[r.e].t]; })) return null;
    if (pt.circ ? anchors.some(function (r) { return refKind(ents, r) !== 'line' || r.s !== null; }) : anchors.some(function (r) { return refKind(ents, r) !== 'point'; })) return null;
    var seeds = whole.slice(0, m).map(function (r) { return r.e; }), copies = whole.slice(m).map(function (r) { return r.e; });
    if (copies.some(function (c, q) { return ents[c].t !== ents[seeds[q % m]].t; })) return null;
    var layout = copies.map(function (c, q) {
      var names = paramNames(ents[c]), skip = [];
      if (!pt.circ) anchors.slice(1).forEach(function (a) { if (!a.o && a.e === c) skip = skip.concat(ANCHOR[ents[c].t][1]); });
      return { c: c, s: seeds[q % m], q: Math.floor(q / m), names: names.filter(function (nm) { return skip.indexOf(nm) < 0; }) };
    });
    var n = layout.reduce(function (s, L) { return s + L.names.length; }, 0);
    if (!n) return null;
    function xfFor(E, q) {
      if (pt.circ) {
        var L0 = refCurve(E, anchors[0]), L1 = refCurve(E, anchors[1]), u0 = sub(L0.b, L0.a), u1 = sub(L1.b, L1.a);
        return { rot: Math.atan2(crs(u0, u1), dot(u0, u1)) / D2R * inst[q], cx: L0.a[0], cy: L0.a[1] };
      }
      var o = refPoint(E, anchors[0]), co = inst[q], dx = 0, dy = 0;
      for (var k = 1; k < na; k++) { var a = refPoint(E, anchors[k]); dx += co[k - 1] * (a[0] - o[0]); dy += co[k - 1] * (a[1] - o[1]); }
      return { dx: dx, dy: dy };
    }
    var f = function (E) {
      var out = [], cache = {};
      layout.forEach(function (L) {
        var xf = cache[L.q] || (cache[L.q] = xfFor(E, L.q)), x = xfEntity(E[L.s], xf), c = E[L.c];
        L.names.forEach(function (nm) {
          if (!x) { out.push(1e6); return; }
          var a = pget(c, nm), b = pget(x, nm);
          out.push(nm === 'a0' || nm === 'a1' || nm === 'rot' ? angDiff(a, b) : a - b);
        });
      });
      return out;
    };
    var used = [];
    R.forEach(function (r) { if (!r.o && used.indexOf(r.e) < 0) used.push(r.e); });
    return { n: n, f: f, ents: used };
  }
  function patternSeeds(sketch, idx) {
    var E = sketch.entities;
    return uniqSorted(idx, E).filter(function (i) { return ANCHOR[E[i].t] && !E[i].sharp; });
  }
  // Linear Sketch Pattern of entities `idx`. spec: { angle1, spacing1, count1, angle2, spacing2, count2 (1: no
  // direction 2), skip: ['i,j' …] (Instances to Skip), dimX, dimY (Dimension X / Y spacing), dimAngle (Dimension angle
  // between axes) }. The copies are their seeds moved i·v1 + j·v2 and stay tied to them by one Pattern relation; the
  // first copy along a direction is placed by Horizontal / Vertical (a direction along an axis) and, with its Dimension
  // spacing option, a driving distance from the seed, so editing the spacing moves the whole pattern. Returns { ok,
  // copies, analysis, error }.
  function linearPattern(sketch, idx, spec) {
    spec = spec || {};
    var E = sketch.entities, seeds = patternSeeds(sketch, idx);
    if (!seeds.length) return { ok: false, error: 'Select the entities to pattern first.' };
    var n1 = Math.max(1, spec.count1 | 0), n2 = Math.max(1, spec.count2 | 0);
    if (n1 * n2 < 2) return { ok: false, error: 'Set at least 2 instances.' };
    var s1 = +spec.spacing1 || 0, s2 = +spec.spacing2 || 0, a1 = (+spec.angle1 || 0) * D2R, a2 = (spec.angle2 == null ? 90 : +spec.angle2) * D2R;
    if ((n1 > 1 && !(Math.abs(s1) > 1e-9)) || (n2 > 1 && !(Math.abs(s2) > 1e-9))) return { ok: false, error: 'The spacing must not be zero.' };
    var v1 = [s1 * Math.cos(a1), s1 * Math.sin(a1)], v2 = [s2 * Math.cos(a2), s2 * Math.sin(a2)];
    if (n1 > 1 && n2 > 1 && Math.abs(crs(v1, v2)) < 1e-9 * Math.abs(s1 * s2)) return { ok: false, error: 'Direction 1 and Direction 2 must not be parallel.' };
    var skip = {};
    (spec.skip || []).forEach(function (k) { skip[String(k)] = true; });
    var saved = tSave(sketch), before = analyze(sketch);
    try { return run(); } catch (err) { tRestore(sketch, saved); return { ok: false, error: 'The pattern could not be made: ' + err.message }; }
    function run() {
      var s0 = seeds[0], A00 = anchorRef(E[s0], s0), P00 = refPoint(E, parseRef(A00)), dirs = [], inst = [], copies = [], made = [];
      if (n1 > 1) dirs.push({ v: v1, ij: 0, dim: spec.dimX !== false });
      if (n2 > 1) dirs.push({ v: v2, ij: 1, dim: !!spec.dimY });
      for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) {
        if ((!i && !j) || skip[i + ',' + j]) continue;
        var dx = i * v1[0] + j * v2[0], dy = i * v1[1] + j * v2[1];
        inst.push(dirs.map(function (dd) { return dd.ij === 0 ? i : j; }));
        seeds.forEach(function (s) {
          var o = xfEntity(E[s], { dx: dx, dy: dy });
          delete o.sharp;
          E.push(o); copies.push(E.length - 1);
          if (s === s0) dirs.forEach(function (dd) { if ((dd.ij === 0 ? i === 1 && j === 0 : i === 0 && j === 1)) dd.A = anchorRef(o, E.length - 1); });
        });
      }
      if (!inst.length) { tRestore(sketch, saved); return { ok: false, error: 'Every instance is skipped.' }; }
      // a skipped first instance still marks its direction: a construction point where it would be
      dirs.forEach(function (dd) { if (!dd.A) { E.push({ t: 'point', x: P00[0] + dd.v[0], y: P00[1] + dd.v[1], construction: true }); dd.A = String(E.length - 1); } });
      sketch.rels = sketch.rels || [];
      dirs.forEach(function (dd) {
        var a = normDeg(Math.atan2(dd.v[1], dd.v[0]) / D2R), hv = a < 1e-9 || 360 - a < 1e-9 || Math.abs(a - 180) < 1e-9 ? 'h' : Math.abs(a - 90) < 1e-9 || Math.abs(a - 270) < 1e-9 ? 'v' : null;
        if (hv) made.push({ type: hv === 'h' ? 'horizontal' : 'vertical', refs: [A00, dd.A] });
        if (dd.dim) { var dr = { type: 'distance', refs: [A00, dd.A], v: len(dd.v), off: Math.round((hv === 'v' ? -0.3 : 0.3) * len(dd.v) * 1e4) / 1e4 }; if (hv) dr.dir = hv; made.push(dr); }
      });
      var angRel = null;
      if (spec.dimAngle && dirs.length === 2) {
        dirs.forEach(function (dd) { var q = refPoint(E, parseRef(dd.A)); E.push({ t: 'line', x1: P00[0], y1: P00[1], x2: q[0], y2: q[1], construction: true }); dd.L = E.length - 1; });
        dirs.forEach(function (dd) { made.push({ type: 'coincident', refs: [dd.L + '.p1', A00] }, { type: 'coincident', refs: [dd.L + '.p2', dd.A] }); });
        angRel = { type: 'angle', refs: [String(dirs[0].L), String(dirs[1].L)], v: Math.abs(angleDeg({ a: P00, b: refPoint(E, parseRef(dirs[0].A)) }, { a: P00, b: refPoint(E, parseRef(dirs[1].A)) })) };
        made.push(angRel);
      }
      var pr = { type: 'pattern', refs: [A00].concat(dirs.map(function (dd) { return dd.A; }), seeds.map(String), copies.map(String)), pat: { nd: dirs.length, m: seeds.length, inst: inst } };
      if (relEquation(E, pr)) made.push(pr);
      made.forEach(function (rel) { sketch.rels.push(rel); });
      var res = solve(sketch), an = analyze(sketch);
      if (!res.ok || an.conflicts > before.conflicts) { tRestore(sketch, saved); return { ok: false, error: 'The pattern conflicts with the sketch\'s relations or dimensions.' }; }
      // the angle between axes only repeats what Horizontal / Vertical say: it stays as a driven (reference) dimension
      if (angRel && an.redundant > before.redundant) { angRel.driven = true; an = analyze(sketch); }
      if (an.redundant > before.redundant) an = dropRedundant(sketch, made, before);
      return { ok: true, copies: copies, analysis: an };
    }
  }
  // Circular Sketch Pattern of entities `idx` about (spec.cx, spec.cy). spec: { count (Number of instances, the seed
  // included), angle (Spacing, degrees; with equal (Equal spacing) the total angle the instances share, 360 all round;
  // negative: clockwise), skip: [k …] (Instances to Skip), dimRadius, dimAngle (Dimension radius / angular spacing) }.
  // Two construction lines run from the centre, to the first seed's point and one spacing on (Equal); the copies are
  // their seeds turned k spacings and stay tied to them by one Pattern relation. The centre sits on the origin or a
  // sketch point when it is there. Rectangles become four lines first. Returns { ok, copies, lines, analysis, error }.
  function circularPattern(sketch, idx, spec) {
    spec = spec || {};
    var n = spec.count | 0, total = +spec.angle, C = [+spec.cx || 0, +spec.cy || 0];
    if (n < 2) return { ok: false, error: 'Set at least 2 instances.' };
    if (!isFinite(total) || Math.abs(total) < 1e-9) return { ok: false, error: 'The spacing angle must not be zero.' };
    var step = spec.equal === false ? total : Math.abs(total) >= 360 - 1e-9 ? total / n : total / (n - 1);
    if (patternSeeds(sketch, idx).length === 0) return { ok: false, error: 'Select the entities to pattern first.' };
    var skip = {};
    (spec.skip || []).forEach(function (k) { skip[String(k)] = true; });
    var saved = tSave(sketch), before = analyze(sketch);
    try { return run(); } catch (err) { tRestore(sketch, saved); return { ok: false, error: 'The pattern could not be made: ' + err.message }; }
    function run() {
      var sel = uniqSorted(idx, sketch.entities);
      // rectangles turn as four lines (as SolidWorks draws them)
      for (var q = sel.length - 1; q >= 0; q--) {
        var ri = sel[q], re = sketch.entities[ri];
        if (re.t !== 'rect' && re.t !== 'crect') continue;
        var n0 = sketch.entities.length;
        explodeRect(sketch, ri);
        var shift = sketch.entities.length - n0;
        sel = sel.map(function (x) { return x > ri ? x + shift : x; });
        for (var z = 1; z <= 3; z++) sel.push(ri + z);
      }
      var E = sketch.entities, seeds = patternSeeds(sketch, sel), s0 = seeds[0], A00 = anchorRef(E[s0], s0), P0 = refPoint(E, parseRef(A00));
      // sketch-refine: an arc, arc slot or partial ellipse round the pattern's own centre (slots on a bolt circle) is held
      // by its start point instead of its centre (which is the pattern's centre); so is the first seed that has one
      if (len(sub(P0, C)) < 1e-9 * Math.max(1, Math.abs(C[0]), Math.abs(C[1]))) {
        for (var sq = 0; sq < seeds.length; sq++) {
          var se = E[seeds[sq]], alt = se && /^(arc|aslot|pellipse|line|slot|spline)$/.test(se.t) ? seeds[sq] + (se.t === 'spline' ? '.v0' : '.p1') : anchorRef(se, seeds[sq]), ap = alt && refPoint(E, parseRef(alt));
          if (ap && len(sub(ap, C)) > 1e-9 * Math.max(1, Math.abs(C[0]), Math.abs(C[1]))) { s0 = seeds[sq]; A00 = alt; P0 = ap; break; }
        }
      }
      if (len(sub(P0, C)) < 1e-9 * Math.max(1, Math.abs(C[0]), Math.abs(C[1]))) { tRestore(sketch, saved); return { ok: false, error: 'The centre is on the first entity\'s point: move the centre (Center X / Y) off it.' }; }
      var inst = [], copies = [], made = [], nOrig = E.length;
      for (var k = 1; k < n; k++) {
        if (skip[k]) continue;
        inst.push(k);
        seeds.forEach(function (s) { var o = xfEntity(E[s], { rot: k * step, cx: C[0], cy: C[1] }); delete o.sharp; E.push(o); copies.push(E.length - 1); });
      }
      if (!inst.length) { tRestore(sketch, saved); return { ok: false, error: 'Every instance is skipped.' }; }
      // the centre: on the origin or on a sketch point already there
      var cref = Math.abs(C[0]) < 1e-9 && Math.abs(C[1]) < 1e-9 ? 'O' : null;
      if (!cref) for (var j = 0; j < nOrig && !cref; j++) pointRefs(sketch, j).forEach(function (pr) { if (!cref && !/\.mid$/.test(pr.ref) && nearPt(pr.pt, C, joinTol(C))) cref = pr.ref; });
      var P1 = xfPt(P0, { rot: step, cx: C[0], cy: C[1] });
      E.push({ t: 'line', x1: C[0], y1: C[1], x2: P0[0], y2: P0[1], construction: true });
      var L0 = E.length - 1;
      E.push({ t: 'line', x1: C[0], y1: C[1], x2: P1[0], y2: P1[1], construction: true });
      var L1 = E.length - 1;
      made.push({ type: 'coincident', refs: [L0 + '.p2', A00] }, { type: 'coincident', refs: [L1 + '.p1', L0 + '.p1'] }, { type: 'equal', refs: [String(L0), String(L1)] });
      if (cref) made.push({ type: 'coincident', refs: [L0 + '.p1', cref] });
      var dims = [];
      if (spec.dimAngle !== false) { var ar = { type: 'angle', refs: [String(L0), String(L1)], v: Math.abs(angleDeg({ a: C, b: P0 }, { a: C, b: P1 })) }; made.push(ar); dims.push(ar); }
      var pr = { type: 'pattern', refs: [String(L0), String(L1)].concat(seeds.map(String), copies.map(String)), pat: { circ: true, m: seeds.length, inst: inst } };
      if (relEquation(E, pr)) made.push(pr);
      sketch.rels = sketch.rels || [];
      made.forEach(function (rel) { sketch.rels.push(rel); });
      if (spec.dimRadius !== false) (sketch.dims = sketch.dims || []).push({ e: L0, k: 'len' });
      var res = solve(sketch), an = analyze(sketch);
      if (!res.ok || an.conflicts > before.conflicts) { tRestore(sketch, saved); return { ok: false, error: 'The pattern conflicts with the sketch\'s relations or dimensions.' }; }
      // a radius or spacing the seed's own dimensions already fix stays as a driven (reference) dimension
      if (an.redundant > before.redundant && spec.dimRadius !== false) { sketch.dims[sketch.dims.length - 1].driven = true; an = analyze(sketch); if (an.redundant > before.redundant) delete sketch.dims[sketch.dims.length - 1].driven; else dims = []; }
      if (an.redundant > before.redundant) { dims.forEach(function (d) { d.driven = true; }); an = analyze(sketch); }
      if (an.redundant > before.redundant) an = dropRedundant(sketch, made, before);
      return { ok: true, copies: copies, lines: [L0, L1], analysis: an };
    }
  }

  // ------------------------------------------------------------------ descriptions
  var ENTITY_NAMES = { line: 'Line', rect: 'Rectangle', crect: 'Rectangle', circle: 'Circle', poly: 'Polygon', slot: 'Slot', arc: 'Arc', point: 'Point', polyline: 'Polyline', aslot: 'Arc Slot' };
  ENTITY_NAMES.spline = 'Spline'; ENTITY_NAMES.ellipse = 'Ellipse'; ENTITY_NAMES.pellipse = 'Partial Ellipse';   // ui-sketch-spline
  ENTITY_NAMES.text = 'Text';   // sketch-text
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
      case 'v':
        if (e && e.t === 'spline') return base + ' point ' + (p.k + 1);
        if (e && (e.t === 'ellipse' || e.t === 'pellipse')) return base + (p.k % 2 ? ' minor' : ' major') + ' axis end' + (p.k > 1 ? ' 2' : '');
        return base + ' corner ' + (p.k + 1);
      case 'e': return base + (e && e.t === 'spline' ? ' control polygon line ' : ' edge ') + (p.k + 1);   // rfAK
      case 'h': return base + ' handle ' + (p.k + 1);   // lane DE
    }
    return base;
  }
  function describe(sketch, rel) {
    var t = TYPES[rel.type];
    var s = (rel.dir === 'h' ? 'Horizontal ' : rel.dir === 'v' ? 'Vertical ' : rel.dir === 'r' ? 'Radial ' : '') + (t ? t.name : rel.type) + ': ' + rel.refs.map(function (r) { return refName(sketch, r); }).join(', ');
    if (t && t.dim) s += (rel.driven ? ' (driven) = ' : ' = ') + (rel.type === 'angle' ? (Math.round(rel.v * 1e4) / 1e4) + '°' : fmtL(rel.v));   // sketch-units
    return s;
  }

  // ------------------------------------------------------------------ script round trip (Builder / generateScript hooks)
  // `.rel(type, refs, value)`, `.solve()`, `.construction()` and `.driven()` are added to the SketchBuilder prototype,
  // and Kernel.registerSketchScript writes each sketch's construction marks, driven dimensions and relations before its
  // `.id();` in generateScript.
  // sketchdims: what a relation or dimension carries besides its geometry, kept through scripts: arc conditions, the
  // Dimension PropertyManager's name / tolerance / precision / text before and after / radius-or-diameter display, and
  // Suppressed (Display/Delete Relations). A Smart Dimension's go through .dimProps([[i, { … }], …]).
  var REL_EXTRA = ['ac', 'name', 'tol', 'prec', 'prefix', 'suffix', 'show', 'suppressed', 'implied', 'link'];   // lane CV: link (Link Values)   // rfY: implied (an arc slot's fourth join)
  var DIM_EXTRA = ['name', 'tol', 'prec', 'prefix', 'suffix', 'show', 'link'];
  function extras(item, keys) {
    var o = null;
    keys.forEach(function (k) { var x = item[k]; if (x != null && x !== false && x !== '') (o = o || {})[k] = JSON.parse(JSON.stringify(x)); });
    return o;
  }
  function relArgs(rel) {
    var ex = extras(rel, REL_EXTRA);
    if (ex) {
      var o3 = {};
      if (TYPES[rel.type] && TYPES[rel.type].dim) {
        if (rel.driven) o3.driven = true; else o3.value = rel.v;
        ['off', 'dir', 'tx', 'ta'].forEach(function (k) { if (rel[k] != null) o3[k] = rel[k]; });
        if (rel.sup) o3.sup = true;
        if (rel.q === -1) o3.q = -1;
      } else if (rel.type === 'fix' && rel.at) o3.at = rel.at;
      Object.keys(ex).forEach(function (k) { o3[k] = ex[k]; });
      if (rel.mark != null) o3.mark = !!rel.mark;   // rfB: marked for drawing (false is a value, so not a REL_EXTRA)
      return JSON.stringify(rel.type) + ', ' + JSON.stringify(rel.refs) + ', ' + JSON.stringify(o3);
    }
    if (rel.mark != null && TYPES[rel.type] && TYPES[rel.type].dim) {
      var om = rel.driven ? { driven: true } : { value: rel.v };
      ['off', 'dir', 'tx', 'ta'].forEach(function (k) { if (rel[k] != null) om[k] = rel[k]; });
      if (rel.sup) om.sup = true;
      if (rel.q === -1) om.q = -1;
      om.mark = !!rel.mark;
      return JSON.stringify(rel.type) + ', ' + JSON.stringify(rel.refs) + ', ' + JSON.stringify(om);
    }
    var s = JSON.stringify(rel.type) + ', ' + JSON.stringify(rel.refs);
    if (TYPES[rel.type] && TYPES[rel.type].dim) {
      // angle placement (r5/sketch5): sup / q / ta
      var ang = function (o) { if (rel.sup) o.sup = true; if (rel.q === -1) o.q = -1; if (rel.ta != null) o.ta = rel.ta; return o; };
      if (rel.driven) { var o = { driven: true }; if (rel.off != null) o.off = rel.off; if (rel.dir) o.dir = rel.dir; if (rel.tx != null) o.tx = rel.tx; s += ', ' + JSON.stringify(ang(o)); }
      else if (rel.dir || rel.tx != null || rel.sup || rel.q === -1 || rel.ta != null) { var o2 = { value: rel.v }; if (rel.off != null) o2.off = rel.off; if (rel.dir) o2.dir = rel.dir; if (rel.tx != null) o2.tx = rel.tx; s += ', ' + JSON.stringify(ang(o2)); }
      else s += rel.off != null ? ', ' + JSON.stringify({ value: rel.v, off: rel.off }) : ', ' + rel.v;
    }
    else if ((rel.type === 'fix' || rel.type === 'onEdge') && rel.at) s += ', ' + JSON.stringify({ at: rel.at });
    else if (rel.type === 'pattern' && rel.pat) s += ', ' + JSON.stringify({ pat: rel.pat });   // sketch tools
    else if (rel.type === 'polygon' && rel.ins) s += ', ' + JSON.stringify({ ins: true });   // rfH
    else if (rel.type === 'offset' && rel.chain) s += ', ' + JSON.stringify({ chain: rel.chain });
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
      // sketchdims: a suppressed relation is stored as it is (it holds nothing, so there is nothing to solve)
      if (opt && typeof opt === 'object' && opt.suppressed) {
        var sr = { type: type === 'merge' ? 'coincident' : type, refs: refs.map(String), suppressed: true };
        if (Array.isArray(opt.at)) sr.at = opt.at.map(Number);
        if (TYPES[sr.type] && TYPES[sr.type].dim) sr.v = opt.value != null ? this._v(opt.value) : measure(this.f, sr.type, sr.refs, opt.dir, opt.sup, opt.ac);
        (this.f.rels = this.f.rels || []).push(sr);
        return this;
      }
      if ((type === 'fix' || type === 'onEdge') && opt && Array.isArray(opt.at)) {
        (this.f.rels = this.f.rels || []).push({ type: type, refs: refs.map(String), at: opt.at.map(Number) });
        solve(this.f);
        return this;
      }
      // sketch tools: a sketch pattern's / an offset chain's relation, with its layout (pat / chain) as made
      // rfH: a Polygon relation (its inscribed flag as made)
      if (type === 'polygon') {
        var pr = { type: 'polygon', refs: refs.map(String) };
        if (opt && opt.ins) pr.ins = true;
        if (!relEquation(this.f.entities, pr)) throw new Error('rel("polygon"): does not apply to those entities');
        (this.f.rels = this.f.rels || []).push(pr);
        solve(this.f);
        return this;
      }
      if ((type === 'pattern' && opt && opt.pat) || (type === 'offset' && opt && opt.chain)) {
        var raw = { type: type, refs: refs.map(String) };
        if (type === 'pattern') raw.pat = clone(opt.pat); else raw.chain = clone(opt.chain);
        if (!relEquation(this.f.entities, raw)) throw new Error('rel(' + JSON.stringify(type) + '): does not apply to those entities');
        (this.f.rels = this.f.rels || []).push(raw);
        solve(this.f);
        return this;
      }
      if (opt && typeof opt === 'object' && opt.off != null) o.off = +opt.off;
      if (opt && typeof opt === 'object' && opt.driven) o.driven = true;
      if (opt && typeof opt === 'object' && (opt.dir === 'h' || opt.dir === 'v' || opt.dir === 'r')) o.dir = opt.dir;
      if (opt && typeof opt === 'object' && opt.tx != null) o.tx = +opt.tx;
      if (opt && typeof opt === 'object') { if (opt.sup) o.sup = true; if (+opt.q === -1) o.q = -1; if (opt.ta != null) o.ta = +opt.ta; if (Array.isArray(opt.ac)) o.ac = opt.ac; }
      var r = addRelation(this.f, type, refs, o);
      if (!r.ok) throw new Error('rel(' + JSON.stringify(type) + '): ' + r.error);
      var self = this, ex = opt && typeof opt === 'object' ? extras(opt, DIM_EXTRA) : null;
      if (opt && typeof opt === 'object' && opt.mark != null && r.rels) r.rels.forEach(function (i) { self.f.rels[i].mark = !!opt.mark; });   // rfB: marked for drawing
      if (ex) r.rels.forEach(function (i) { Object.keys(ex).forEach(function (k) { self.f.rels[i][k] = ex[k]; }); });
      if (opt && typeof opt === 'object' && opt.implied && r.rels) r.rels.forEach(function (i) { self.f.rels[i].implied = true; });   // rfY
      return this;
    };
    SBP.solve = function () { solve(this.f); return this; };
    // .construction([i, …]): mark entities as construction geometry (drawn dashed, not part of any profile)
    SBP.construction = function (list) {
      var self = this;
      (Array.isArray(list) ? list : [list]).forEach(function (i) { var e = self.f.entities[i]; if (!e) throw new Error('No sketch entity ' + i + ' to make construction.'); e.construction = true; });
      return this;
    };
    // .infinite([i, …]) (sketch-refine): lines i are infinite lines, the lines through their two points
    SBP.infinite = function (list) {
      var self = this;
      // an item is a line index (infinite both ways) or [index, 'p1' | 'p2'] (a ray, running on past that point)
      (Array.isArray(list) ? list : [list]).forEach(function (it) { var i = Array.isArray(it) ? it[0] : it, e = self.f.entities[i]; if (!e || e.t !== 'line') throw new Error('No sketch line ' + i + ' to make infinite.'); e.infinite = Array.isArray(it) && (it[1] === 'p1' || it[1] === 'p2') ? it[1] : true; });
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
    // .dimProps([[i, { name, tol, prec, prefix, suffix, show }], …]) (sketchdims): the Dimension PropertyManager's
    // properties of Smart Dimension i
    SBP.dimProps = function (list) {
      var self = this;
      (list || []).forEach(function (p) {
        var d = (self.f.dims || [])[p[0]];
        if (!d) throw new Error('No sketch dimension ' + p[0] + ' for its properties.');
        var ex = extras(p[1] || {}, DIM_EXTRA);
        if (ex) Object.keys(ex).forEach(function (k) { d[k] = ex[k]; });
      });
      return this;
    };
    // .showMinRadius([i, …]) (lane CV): splines i show their minimum radius (right-click ▸ Show Minimum Radius)
    SBP.showMinRadius = function (list) {
      var self = this;
      (Array.isArray(list) ? list : [list]).forEach(function (i) { var e = self.f.entities[i]; if (!e || e.t !== 'spline') throw new Error('No sketch spline ' + i + ' to show the minimum radius of.'); e.showMinRadius = true; });
      return this;
    };
    Kn.registerSketchScript(function (f) {
      var mnr = (f.entities || []).map(function (e, i) { return e.showMinRadius && e.t === 'spline' ? i : -1; }).filter(function (i) { return i >= 0; });
      if (mnr.length) return '\n  .showMinRadius(' + JSON.stringify(mnr) + ')';
    });
    Kn.registerSketchScript(function (f) {
      var cons =(f.entities || []).map(function (e, i) { return e.construction ? i : -1; }).filter(function (i) { return i >= 0; });
      var drv = (f.dims || []).map(function (d, i) { return d.driven ? i : -1; }).filter(function (i) { return i >= 0; });
      var shp = (f.entities || []).map(function (e, i) { return e.sharp && e.t === 'point' ? i : -1; }).filter(function (i) { return i >= 0; });
      var inf = (f.entities || []).map(function (e, i) { return e.infinite && e.t === 'line' ? (e.infinite === 'p1' || e.infinite === 'p2' ? [i, e.infinite] : i) : -1; }).filter(function (i) { return i !== -1; });
      var dps = (f.dims || []).map(function (d, i) { var ex = extras(d, DIM_EXTRA); return ex ? [i, ex] : null; }).filter(function (x) { return x; });
      var txs = (f.dims || []).map(function (d, i) { return d.tx != null ? [i, Math.round(d.tx * 1e4) / 1e4] : null; }).filter(function (x) { return x; });
      return (cons.length ? '\n  .construction(' + JSON.stringify(cons) + ')' : '') + (inf.length ? '\n  .infinite(' +JSON.stringify(inf) + ')' : '') + (shp.length ? '\n  .sharp(' + JSON.stringify(shp) + ')' : '') + (drv.length ? '\n  .driven(' + JSON.stringify(drv) + ')' : '') + (txs.length ? '\n  .dimText(' + JSON.stringify(txs) + ')' : '') + (dps.length ? '\n  .dimProps(' + JSON.stringify(dps) + ')' : '') + (f.rels || []).map(function (rel) { return '\n  .rel(' + relArgs(rel) + ')'; }).join('');
    });
  }
  if (K) install(K);

  // ------------------------------------------------------------------ shop input (p9-sketch)
  // parseValue(text, { kind, units }) reads a value as a sheet-metal shop types it: decimals (.375), fractions (3/8),
  // mixed numbers (1-1/2 or 1 1/2), unit suffixes converted to the document's units (`units`: 'in' | 'mm'; 25mm in an
  // inch part is 0.984252…; in, inch, ", ft, foot, ', mm, cm, m; feet and inches side by side add: 1' 6-1/2"),
  // angles (deg, °, rad) and arithmetic (+ - * / ^, parentheses: 2*3/8, 1.5+1/16). kind: 'length' (length units
  // only), 'angle' (angle units only), 'number' (no units) or 'any'. A whole number, a hyphen and a proper fraction
  // with no spaces is a mixed number (3-1/2 = 3.5); 3 - 1/2 with spaces subtracts. Returns { value } or { error };
  // { equation: true } for text starting with "=" (the kernel's equations evaluate those), and { error, ident: true }
  // when a name is neither a unit nor anything else readable (the caller may try it as an equation variable).
  // No DOM, no Kernel: the kernel tests call it directly.
  var LEN_MM = { mm: 1, millimeter: 1, millimeters: 1, millimetre: 1, millimetres: 1, cm: 10, m: 1000, 'in': 25.4, inch: 25.4, inches: 25.4, '"': 25.4, '″': 25.4, ft: 304.8, foot: 304.8, feet: 304.8, "'": 304.8, '′': 304.8 };
  var ANG_DEG = { deg: 1, degs: 1, degree: 1, degrees: 1, '°': 1, rad: 180 / Math.PI, rads: 180 / Math.PI, radian: 180 / Math.PI, radians: 180 / Math.PI };
  function parseValue(text, opts) {
    opts = opts || {};
    var kind = opts.kind || 'length', toMm = opts.units === 'in' ? 25.4 : 1;
    var src = String(text == null ? '' : text).replace(/^\s+|\s+$/g, '');
    if (!src) return { error: 'Enter a value' };
    if (src.charAt(0) === '=') return { equation: true };
    function bad(msg, extra) { var o = { error: msg }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }
    // tokens: num { v }, unit { u }, id { s }, op { v }
    var toks = [], i = 0, m;
    while (i < src.length) {
      var c = src.charAt(i), rest = src.slice(i), prev = toks[toks.length - 1];
      if (/\s/.test(c)) { i++; continue; }
      // a mixed number, where an operand may start: at the start, after "(", "+", "-" or a unit (1' 6-1/2")
      var mixOk = !prev || prev.t === 'unit' || (prev.t === 'op' && (prev.v === '(' || prev.v === '+' || prev.v === '-'));
      if (mixOk && (m = /^(\d+)(?:-|[ \t]+)(\d+)\/(\d+)(?![\d.\/])/.exec(rest)) && +m[2] < +m[3]) {
        toks.push({ t: 'num', v: +m[1] + m[2] / m[3], s: m[0] }); i += m[0].length; continue;
      }
      if ((m = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(rest))) { toks.push({ t: 'num', v: parseFloat(m[0]), s: m[0] }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
        var w = m[0].toLowerCase();
        toks.push(LEN_MM.hasOwnProperty(w) || ANG_DEG.hasOwnProperty(w) ? { t: 'unit', u: w, s: m[0] } : { t: 'id', s: m[0] });
        i += m[0].length; continue;
      }
      if (LEN_MM.hasOwnProperty(c) || ANG_DEG.hasOwnProperty(c)) { toks.push({ t: 'unit', u: c, s: c }); i++; continue; }
      if (c === '*' && src.charAt(i + 1) === '*') { toks.push({ t: 'op', v: '^', s: '**' }); i += 2; continue; }
      if ('+-*/^()'.indexOf(c) >= 0) { toks.push({ t: 'op', v: c, s: c }); i++; continue; }
      if (c === '×') { toks.push({ t: 'op', v: '*', s: c }); i++; continue; }
      if (c === '÷') { toks.push({ t: 'op', v: '/', s: c }); i++; continue; }
      if (c === '−') { toks.push({ t: 'op', v: '-', s: c }); i++; continue; }
      return bad('Cannot read "' + src + '": unexpected "' + c + '"');
    }
    for (var q = 0; q < toks.length; q++) {
      if (toks[q].t === 'id') return bad('Unknown unit "' + toks[q].s + '": use in, ", ft, \', mm, cm' + (kind === 'angle' || kind === 'any' ? ' or deg' : ''), { ident: true });
    }
    var pos = 0, err = null;
    function peek() { return toks[pos]; }
    function isOp(v) { var t = toks[pos]; return !!(t && t.t === 'op' && t.v === v); }
    function fail(msg) { if (!err) err = msg; return NaN; }
    function unexpected() { var t = toks[pos]; return fail(t ? 'Cannot read "' + src + '": unexpected "' + t.s + '"' : 'Cannot read "' + src + '": it ends too soon'); }
    // a unit after a number or ")": the value in the document's units (lengths) or degrees (angles)
    function withUnit(v) {
      var t = peek();
      if (!t || t.t !== 'unit') return { v: v, unit: false };
      pos++;
      var isLen = LEN_MM.hasOwnProperty(t.u);
      if (kind === 'number') return { v: fail('This value takes no units ("' + t.s + '")'), unit: true };
      if (isLen && kind === 'angle') return { v: fail('"' + t.s + '" is a length unit: type an angle (45 or 45deg)'), unit: true };
      if (!isLen && kind === 'length') return { v: fail('"' + t.s + '" is an angle unit: type a length (3/8, 1-1/2, 25mm)'), unit: true };
      // inch units in an inch part and metric ones in a mm part convert without going through 25.4 (1ft = 12 exactly)
      var inchU = LEN_MM[t.u] === 25.4 || LEN_MM[t.u] === 304.8, f = !isLen ? ANG_DEG[t.u] : toMm === 25.4 ? (inchU ? (LEN_MM[t.u] === 304.8 ? 12 : 1) : null) : (inchU ? null : LEN_MM[t.u]);
      return { v: f != null ? v * f : v * LEN_MM[t.u] / toMm, unit: true, len: isLen };
    }
    function parseSum() {
      var v = parseTerm();
      while (!err && (isOp('+') || isOp('-'))) { var op = toks[pos++].v, r = parseTerm(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    function parseTerm() {
      var v = parseUnary();
      while (!err && (isOp('*') || isOp('/'))) {
        var op = toks[pos++].v, r = parseUnary();
        if (op === '*') v *= r;
        else if (r === 0) return fail('Division by zero');
        else v /= r;
      }
      return v;
    }
    function parseUnary() {
      if (isOp('-')) { pos++; return -parseUnary(); }
      if (isOp('+')) { pos++; return parseUnary(); }
      return parsePower();
    }
    function parsePower() {
      var b = parseQuantity();
      if (!err && isOp('^')) { pos++; return Math.pow(b, parseUnary()); }
      return b;
    }
    // a number or a parenthesised sum with its unit; lengths with units side by side add (1' 6-1/2", 1ft 3in)
    function parseQuantity() {
      var q = parseAtom();
      if (err) return NaN;
      var a = withUnit(q), v = a.v;
      while (!err && a.len && peek() && peek().t === 'num') {
        var save = pos, n = toks[pos++].v, b = withUnit(n);
        if (!b.len) { pos = save; break; }
        v += b.v; a = b;
      }
      return v;
    }
    function parseAtom() {
      var t = toks[pos];
      if (!t) return unexpected();
      if (t.t === 'num') { pos++; return t.v; }
      if (t.t === 'op' && t.v === '(') {
        pos++;
        var v = parseSum();
        if (err) return NaN;
        if (!isOp(')')) return unexpected();
        pos++;
        return v;
      }
      return unexpected();
    }
    var value = parseSum();
    if (!err && pos < toks.length) unexpected();
    if (err) return bad(err);
    if (typeof value !== 'number' || !isFinite(value)) return bad('"' + src + '" is not a number');
    return { value: value };
  }

  return {
    parseValue: parseValue,
    TYPES: TYPES, STATUS_TEXT: STATUS_TEXT, parseRef: parseRef, paramNames: paramNames,
    refPoint: function (sketch, ref) { return refPoint(sketch.entities, parseRef(ref)); },
    refCurve: function (sketch, ref) { return refCurve(sketch.entities, parseRef(ref)); },
    refKind: function (sketch, ref) { return refKind(sketch.entities, parseRef(ref)); },
    pointRefs: pointRefs, curveRefs: curveRefs, refName: refName, describe: describe,
    buildSystem: buildSystem, analyze: analyze, solve: solve, drag: drag,
    setDim: setDim, setRelValue: setRelValue, linkedItems: linkedItems, linkValues: linkValues, unlinkValue: unlinkValue, linkItemValue: itemValue, driveEntity: driveEntity, measure: measure, updateDriven: updateDriven, overDefines: overDefines, setDriven: setDriven,
    applicable: applicable, addRelation: addRelation, deleteRelation: deleteRelation, fullyDefine: fullyDefine, relArgs: relArgs,
    removeEntity: removeEntity, replaceEntity: replaceEntity, remap: remap, afterTrim: afterTrim, explodeRect: explodeRect, explodePoly: explodePoly, explodeSlot: explodeSlot, explodeArcSlot: explodeArcSlot, slotCap: slotCap, slotAxisOf: slotAxisOf, clean: clean,
    infer: infer, inferCandidates: inferCandidates, inferPreview: inferPreview, onCurveRef: onCurveRef,
    diagnose: diagnose, diagnoseApply: diagnoseApply, scanEqual: scanEqual, applyEqual: applyEqual,   // rfAR: SketchXpert, Scan Equal
    lineCorner: lineCorner, filletCorner: filletCorner, extendTarget: extendTarget, extendEntity: extendEntity, endDir: endDir, offsetEntity: offsetEntity, offsetRelations: offsetRelations, offsetDimensions: offsetDimensions,
    mirrorRelations: mirrorRelations, install: install,
    chainCorners: chainCorners, filletChain: filletChain, selectionCorners: selectionCorners, filletCorners: filletCorners,   // (rfAX: a selection's corners)   // sketch-tools2: Fillet all corners of the chain
    // sketch tools (ui-sketch-tools.js): Sketch Fillet / Chamfer, Offset Entities chains, Move / Copy / Rotate / Scale, the sketch patterns
    curveCorner: curveCorner, filletPair: filletPair, chamferPair: chamferPair, offsetChains: offsetChains, offsetSelection: offsetSelection,
    xfEntity: xfEntity, transformEntities: transformEntities, stretchEntities: stretchEntities, linearPattern: linearPattern, circularPattern: circularPattern, anchorRef: anchorRef, spanOf: spanOf,
    // r13/trim13: Trim Entities modes
    handleLine: handleLine, handleDrive: handleDrive,   // lane DE
    trimSpan: trimSpan, trimAt: trimAt, trailHits: trailHits, powerTrim: powerTrim, withSkip: withSkip,extendBegin: extendBegin, extendMove: extendMove, extendEnd: extendEnd,
    cornerPlan: cornerPlan, cornerPreview: cornerPreview, cornerTrim: cornerTrim, betweenPlan: betweenPlan, betweenSpans: betweenSpans, trimBetween: trimBetween, endJoined: endJoined,
    // sketch-refine: splines and ellipses as curves (closest point, crossings, the points along a stretch of one)
    isFree: isFree, freeCurve: freeCurve, infSides: infSides, freeClosest: freeClosest, freeHits: freeHits, freePts: freePts,
    freeSplit: freeSplit   // rfAK: Split Entities on a spline
  };
})();

// ------------------------------------------------------------------ ordinate dimensions (sketch-ordinate)
// SolidWorks' Horizontal / Vertical Ordinate Dimension in a sketch (Smart Dimension flyout): a zero (a point, the
// origin, a circle's or an arc's centre, or a line square to the measuring axis) and members, each a driving distance
// from the zero along X ('x', a horizontal ordinate set) or Y ('y', a vertical one). A member is an ordinary distance
// relation { type: 'distance', refs: [zero, target], dir: 'h' | 'v' (between two points), v } that also carries
//   ord: the set's id ('o1', 'o2' …), ordAxis: 'x' | 'y', ordAt: where the values stand (the sketch y of a horizontal
//   set's text line, the sketch x of a vertical set's),
// so the solver drives it like any distance, and ui-sketch-dims.js draws and edits the members as one set (a "0" at
// the zero, the values on one line, jogged leaders where they would overlap; deleting the zero deletes the set).
// Fully Define Sketch takes scheme 'ordinate' (hScheme / vScheme): the Baseline distances, made one ordinate set per
// direction. Scripts keep the set with `.ordinate([[relIndex, { ord, ordAxis, ordAt }], …])` after the `.rel(…)` lines.
(function (S) {
  'use strict';
  if (!S) return;
  var K = typeof Kernel !== 'undefined' ? Kernel : null;
  // the part a ref can play in a set measured along axis ('x' | 'y'): 'point' (a point, the origin, a circle's / an
  // arc's centre: the whole circle counts as its centre), 'line' (a line square to the axis: vertical for X), or null
  function ordKind(sketch, ref, axis) {
    var k = S.refKind(sketch, ref);
    if (k === 'point' || k === 'circle') return 'point';
    if (k !== 'line') return null;
    var L = S.refCurve(sketch, ref), dx = L.b[0] - L.a[0], dy = L.b[1] - L.a[1], len = Math.hypot(dx, dy);
    if (!(len > 1e-12)) return null;
    return Math.abs(axis === 'y' ? dy : dx) <= 1e-6 * len ? 'line' : null;
  }
  // the sketch point a ref's leader starts from, nearest the text line `at` (a line: its end nearer that line)
  function ordAnchor(sketch, ref, axis, at) {
    var k = S.refKind(sketch, ref);
    if (k === 'point') return S.refPoint(sketch, ref);
    if (k === 'circle') return S.refCurve(sketch, ref).c;
    if (k === 'line') {
      var L = S.refCurve(sketch, ref), ax = axis === 'y' ? 0 : 1;
      if (at == null) return [(L.a[0] + L.b[0]) / 2, (L.a[1] + L.b[1]) / 2];
      return Math.abs(L.a[ax] - at) <= Math.abs(L.b[ax] - at) ? L.a : L.b;
    }
    return null;
  }
  // every ordinate set of the sketch: { id: { id, axis, at, zero, members: [rel index, …] } } (members in rels order)
  function ordinateSets(sketch) {
    var out = {};
    (sketch.rels || []).forEach(function (rel, i) {
      if (!rel || rel.ord == null || rel.type !== 'distance') return;
      var s = out[rel.ord] || (out[rel.ord] = { id: String(rel.ord), axis: rel.ordAxis === 'y' ? 'y' : 'x', at: rel.ordAt, zero: rel.refs[0], members: [] });
      if (s.at == null && rel.ordAt != null) s.at = rel.ordAt;
      s.members.push(i);
    });
    return out;
  }
  function newOrdinateId(sketch) {
    var n = 0;
    (sketch.rels || []).forEach(function (r) { var m = /^o(\d+)$/.exec(String(r.ord == null ? '' : r.ord)); if (m) n = Math.max(n, +m[1]); });
    return 'o' + (n + 1);
  }
  // addOrdinate(sketch, { zero, target, axis: 'x' | 'y', ord?, at? }) -> { ok, index, ord, driven, status } or
  // { ok: false, error }: one more member of set `ord` (a new set when ord is not given): a driving distance from the
  // zero to the target along the axis, holding what it measures now. One that would over-define the sketch is made
  // driven (a reference dimension, drawn in parentheses), as SolidWorks offers.
  function addOrdinate(sketch, spec) {
    spec = spec || {};
    var axis = spec.axis === 'y' ? 'y' : 'x', zero = String(spec.zero), target = String(spec.target), dirWord = axis === 'x' ? 'horizontal' : 'vertical';
    var square = axis === 'x' ? 'vertical' : 'horizontal';
    if (!ordKind(sketch, zero, axis)) return { ok: false, error: 'The zero of a ' + dirWord + ' ordinate set is a point, a circle\'s centre or a ' + square + ' line.' };
    if (!ordKind(sketch, target, axis)) return { ok: false, error: 'A ' + dirWord + ' ordinate dimension goes to a point, a circle\'s centre or a ' + square + ' line.' };
    if (zero === target) return { ok: false, error: 'That is the zero of the set.' };
    var ord = spec.ord != null ? String(spec.ord) : newOrdinateId(sketch), set = ordinateSets(sketch)[ord];
    if (set && set.zero !== zero) return { ok: false, error: 'Ordinate set ' + ord + ' measures from ' + S.refName(sketch, set.zero) + '.' };
    if (set && set.members.some(function (i) { return sketch.rels[i].refs[1] === target; })) return { ok: false, error: S.refName(sketch, target) + ' is dimensioned in this set already.' };
    var at = spec.at != null ? +spec.at : set && set.at != null ? set.at : null;
    if (at == null) { var z = ordAnchor(sketch, zero, axis, null); at = z[axis === 'x' ? 1 : 0]; }
    var r = S.addRelation(sketch, 'distance', [zero, target], { dir: axis === 'x' ? 'h' : 'v' });
    if (!r.ok) return { ok: false, error: r.error };
    var idx = r.rels[0], rel = sketch.rels[idx], driven = false;
    rel.ord = ord; rel.ordAxis = axis; rel.ordAt = Math.round(at * 1e6) / 1e6;
    if (r.status !== 'ok') { S.setDriven(sketch, 'rel', idx, true); driven = true; }
    return { ok: true, index: idx, ord: ord, driven: driven, status: r.status };
  }
  // deleteOrdinateSet(sketch, ord) -> how many members went (deleting the zero of a set deletes all of it)
  function deleteOrdinateSet(sketch, ord) {
    if (!sketch.rels) return 0;
    var n0 = sketch.rels.length;
    sketch.rels = sketch.rels.filter(function (r) { return r.ord == null || String(r.ord) !== String(ord); });
    var n = n0 - sketch.rels.length;
    if (!sketch.rels.length) delete sketch.rels;
    return n;
  }
  // the axis a distance relation measures along: dir h / v, else the axis its line runs square to (null: neither)
  function relAxis(sketch, rel) {
    if (rel.dir === 'h') return 'x';
    if (rel.dir === 'v') return 'y';
    for (var i = 0; i < rel.refs.length; i++) {
      if (S.refKind(sketch, rel.refs[i]) !== 'line') continue;
      if (ordKind(sketch, rel.refs[i], 'x') === 'line') return 'x';
      if (ordKind(sketch, rel.refs[i], 'y') === 'line') return 'y';
    }
    return null;
  }
  // Fully Define Sketch, scheme 'ordinate': the Baseline distances (each from the datum), made one ordinate set per
  // direction, its values standing below / above (left / right of) the sketch as hPlace / vPlace say
  var baseFullyDefine = S.fullyDefine;
  function fullyDefine(sketch, opts) {
    opts = opts || {};
    var sh = opts.hScheme || opts.scheme, sv = opts.vScheme || opts.scheme;
    if (sh !== 'ordinate' && sv !== 'ordinate') return baseFullyDefine(sketch, opts);
    var o2 = {};
    Object.keys(opts).forEach(function (k) { o2[k] = opts[k]; });
    o2.hScheme = sh === 'ordinate' ? 'baseline' : sh; o2.vScheme = sv === 'ordinate' ? 'baseline' : sv;
    delete o2.scheme;
    var r = baseFullyDefine(sketch, o2);
    if (!r || !r.rels) return r;
    // the sketch's extents (with the origin): where the values stand
    var lo = [0, 0], hi = [0, 0];
    (sketch.entities || []).forEach(function (e, i) {
      S.pointRefs(sketch, i).forEach(function (p) { for (var a = 0; a < 2; a++) { lo[a] = Math.min(lo[a], p.pt[a]); hi[a] = Math.max(hi[a], p.pt[a]); } });
      if ((e.t === 'circle' || e.t === 'arc') && e.r > 0) for (var a2 = 0; a2 < 2; a2++) { var c = a2 ? e.cy : e.cx; lo[a2] = Math.min(lo[a2], c - e.r); hi[a2] = Math.max(hi[a2], c + e.r); }
    });
    var gap = opts.gap > 0 ? +opts.gap : Math.max(Math.max(hi[0] - lo[0], hi[1] - lo[1], 1) * 0.08, +opts.minGap || 0);
    r.ordinate = {};
    [['x', sh, opts.hPlace === 'above' ? hi[1] + gap : lo[1] - gap], ['y', sv, opts.vPlace === 'right' ? hi[0] + gap : lo[0] - gap]].forEach(function (q) {
      if (q[1] !== 'ordinate') return;
      var list = r.rels.filter(function (i) { var rel = sketch.rels[i]; return rel && rel.type === 'distance' && rel.ord == null && relAxis(sketch, rel) === q[0]; });
      // one set per zero (Baseline measures every one from the datum: one set)
      var byZero = {}, zs = [];
      list.forEach(function (i) { var z = sketch.rels[i].refs[0]; if (!byZero[z]) { byZero[z] = []; zs.push(z); } byZero[z].push(i); });
      zs.forEach(function (z) {
        var id = newOrdinateId(sketch);
        byZero[z].forEach(function (i) {
          var rel = sketch.rels[i];
          rel.ord = id; rel.ordAxis = q[0]; rel.ordAt = Math.round(q[2] * 1e4) / 1e4;
          delete rel.off; delete rel.tx;
        });
        r.ordinate[id] = byZero[z].slice();
      });
    });
    return r;
  }
  S.fullyDefine = fullyDefine;
  S.ordKind = ordKind; S.ordAnchor = ordAnchor; S.ordinateSets = ordinateSets; S.newOrdinateId = newOrdinateId;
  S.addOrdinate = addOrdinate; S.deleteOrdinateSet = deleteOrdinateSet;
  // script round trip: the sets' fields on the relations the `.rel(…)` lines made (written after them)
  if (K && K.Builder && K.registerSketchScript && K.newModel && !K.__sketchOrdinate) {
    K.__sketchOrdinate = true;
    var SBP = Object.getPrototypeOf(new K.Builder(K.newModel('x')).sketch('Front'));
    // .ordinate([[i, { ord, ordAxis, ordAt }], …]): relation i is a member of ordinate set ord
    SBP.ordinate = function (list) {
      var self = this;
      (list || []).forEach(function (p) {
        var rel = (self.f.rels || [])[p[0]], o = p[1] || {};
        if (!rel || rel.type !== 'distance') throw new Error('No sketch distance ' + p[0] + ' for an ordinate set.');
        rel.ord = String(o.ord); rel.ordAxis = o.ordAxis === 'y' ? 'y' : 'x';
        if (o.ordAt != null) rel.ordAt = +o.ordAt;
      });
      return this;
    };
    K.registerSketchScript(function (f) {
      var list = (f.rels || []).map(function (r, i) {
        if (r.ord == null) return null;
        var o = { ord: r.ord, ordAxis: r.ordAxis === 'y' ? 'y' : 'x' };
        if (r.ordAt != null) o.ordAt = Math.round(r.ordAt * 1e6) / 1e6;
        return [i, o];
      }).filter(function (x) { return x; });
      return list.length ? '\n  .ordinate(' + JSON.stringify(list) + ')' : '';
    });
  }
})(typeof SketchSolver !== 'undefined' ? SketchSolver : null);

// ------------------------------------------------------------------ rfAP: Constrain All, Modify Sketch, Segment, Equation Driven Curve
// Constrain All (SolidWorks' DXF import option and the sketch right-click Constrain All): the relations an imported
// blank's geometry already obeys, within a tolerance, added in one go — Coincident where ends meet (Concentric where
// centres meet, Coincident with the origin), Horizontal / Vertical on level / upright lines, Tangent where an arc meets
// a line or an arc smoothly — then Fully Define Sketch adds the dimensions. Relations that would over-define are left
// out. Modify Sketch moves, turns, scales or flips the whole sketch; Segment divides a line / arc / circle into n equal
// segments with sketch points; equationPoints samples an Equation Driven Curve.
(function (S) {
  'use strict';
  if (!S) return;
  var K = typeof Kernel !== 'undefined' ? Kernel : null;
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function save(sk) { return { e: clone(sk.entities), r: sk.rels ? clone(sk.rels) : null, d: sk.dims ? clone(sk.dims) : null }; }
  function restore(sk, s) { sk.entities = s.e; if (s.r) sk.rels = s.r; else delete sk.rels; if (s.d) sk.dims = s.d; else delete sk.dims; }
  // the largest coordinate in the sketch (1 at least): the tolerances follow it
  function sketchSize(sk) {
    var m = 1;
    sk.entities.forEach(function (e, i) { S.pointRefs(sk, i).forEach(function (pr) { m = Math.max(m, Math.abs(pr.pt[0]), Math.abs(pr.pt[1])); }); });
    return m;
  }
  // the points Constrain All joins: ends, centres, corners and sketch points (not a line's midpoint, not a corner
  // rectangle's / slot's centre, not an ellipse's axis ends or a spline's inner points)
  function joinPoints(sk) {
    var out = [];
    sk.entities.forEach(function (e, i) {
      S.pointRefs(sk, i).forEach(function (pr) {
        if (/\.mid$/.test(pr.ref)) return;
        if (/\.c$/.test(pr.ref) && /^(rect|slot)$/.test(e.t)) return;
        if (/^(ellipse|pellipse|spline)$/.test(e.t) && /\.v\d+$/.test(pr.ref)) return;
        out.push({ ref: pr.ref, pt: pr.pt, e: i });
      });
    });
    return out;
  }
  function isCentre(sk, ref) { var p = S.parseRef(ref), e = p && !p.o && sk.entities[p.e]; return !!(e && p.s === 'c' && (e.t === 'circle' || e.t === 'arc')); }
  function endDir(e, pt) {
    if (e.t === 'line') { var d = [e.x2 - e.x1, e.y2 - e.y1], l = Math.hypot(d[0], d[1]); return l > 0 ? [d[0] / l, d[1] / l] : null; }
    if (e.t === 'arc') { var v = [pt[0] - e.cx, pt[1] - e.cy], m = Math.hypot(v[0], v[1]); return m > 0 ? [-v[1] / m, v[0] / m] : null; }
    return null;
  }
  // the relations the geometry obeys within o.tol (lengths) / o.angTol (radians), in the order they are added
  function constrainCandidates(sk, o) {
    var E = sk.entities, P = joinPoints(sk), tol = o.tol, out = [], have = {};
    function key(rel) { return rel.type + ':' + rel.refs.slice().sort().join('|'); }
    (sk.rels || []).forEach(function (r) { have[key(r)] = true; });
    function push(rel) { var k = key(rel); if (have[k]) return; have[k] = true; out.push(rel); }
    // groups of points already joined by Coincident relations
    var parent = P.map(function (p, i) { return i; }), byRef = {};
    P.forEach(function (p, i) { byRef[p.ref] = i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    function join(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; return a !== b; }
    var atOrigin = {};
    (sk.rels || []).forEach(function (r) {
      if (r.type !== 'coincident' || r.refs.length !== 2) return;
      var a = byRef[r.refs[0]], b = byRef[r.refs[1]];
      if (a != null && b != null) join(a, b);
      if (r.refs[0] === 'O' && b != null) atOrigin[b] = true;
      if (r.refs[1] === 'O' && a != null) atOrigin[a] = true;
    });
    if (o.coincident !== false) {
      // sorted by x: only near neighbours are compared
      var order = P.map(function (p, i) { return i; }).sort(function (a, b) { return P[a].pt[0] - P[b].pt[0]; });
      for (var a = 0; a < order.length; a++) {
        var pa = P[order[a]];
        for (var b = a + 1; b < order.length; b++) {
          var pb = P[order[b]];
          if (pb.pt[0] - pa.pt[0] > tol) break;
          if (pa.e === pb.e || Math.abs(pb.pt[1] - pa.pt[1]) > tol) continue;
          if (find(order[a]) === find(order[b])) continue;
          join(order[a], order[b]);
          if (isCentre(sk, pa.ref) && isCentre(sk, pb.ref)) push({ type: 'concentric', refs: [String(pa.e), String(pb.e)] });
          else push({ type: 'coincident', refs: [pa.ref, pb.ref] });
        }
      }
      // the origin: one point of a group that lies on it
      var done = {};
      Object.keys(atOrigin).forEach(function (i) { done[find(+i)] = true; });
      P.forEach(function (p, i) {
        var g = find(i);
        if (done[g] || Math.abs(p.pt[0]) > tol || Math.abs(p.pt[1]) > tol) return;
        done[g] = true;
        push({ type: 'coincident', refs: [p.ref, 'O'] });
      });
    }
    if (o.hv !== false) {
      var tn = Math.tan(o.angTol);
      E.forEach(function (e, i) {
        if (e.t !== 'line') return;
        var dx = Math.abs(e.x2 - e.x1), dy = Math.abs(e.y2 - e.y1);
        if (dx > tol && dy <= tn * dx) push({ type: 'horizontal', refs: [String(i)] });
        else if (dy > tol && dx <= tn * dy) push({ type: 'vertical', refs: [String(i)] });
      });
    }
    if (o.tangent !== false) {
      var ends = P.filter(function (p) { var e = E[p.e]; return (e.t === 'line' || e.t === 'arc') && /\.p[12]$/.test(p.ref); });
      for (var i = 0; i < ends.length; i++) for (var j = i + 1; j < ends.length; j++) {
        var A = ends[i], B = ends[j], ea = E[A.e], eb = E[B.e];
        if (A.e === B.e || (ea.t === 'line' && eb.t === 'line')) continue;
        if (Math.abs(A.pt[0] - B.pt[0]) > tol || Math.abs(A.pt[1] - B.pt[1]) > tol) continue;
        var u = endDir(ea, A.pt), v = endDir(eb, B.pt);
        if (!u || !v || Math.abs(u[0] * v[1] - u[1] * v[0]) > Math.sin(o.angTol)) continue;
        push({ type: 'tangent', refs: [String(A.e), String(B.e)] });
      }
    }
    return out;
  }
  function candOpts(sk, opts) {
    return { tol: opts.tol != null ? Math.max(1e-12, +opts.tol) : 1e-5 * sketchSize(sk), angTol: (opts.angle != null ? +opts.angle : 0.01) * Math.PI / 180,
      coincident: opts.coincident, hv: opts.hv, tangent: opts.tangent };
  }
  // constrainAll(sketch, opts) -> { ok, added: { coincident, concentric, horizontal, vertical, tangent, … }, relations,
  // dims, status, dof, error }. opts: tol (sketch units; default 1e-5 of the sketch's size), angle (degrees; 0.01),
  // coincident / hv / tangent (false leaves that kind out), fullyDefine (false: relations only), dims (false: Fully
  // Define adds relations only), scheme ('baseline' | 'chain' | 'ordinate'; or hScheme / vScheme), hPlace / vPlace,
  // hDatum / vDatum, minGap.
  function constrainAll(sk, opts) {
    opts = opts || {};
    if (!sk.entities || !sk.entities.length) return { ok: false, error: 'The sketch has no geometry to constrain.' };
    var saved = save(sk), before = S.analyze(sk);
    var cands = constrainCandidates(sk, candOpts(sk, opts));
    var n0 = (sk.rels || []).length;
    if (cands.length) {
      sk.rels = (sk.rels || []).concat(cands);
      S.solve(sk);
      // the rank test flags the later of dependent equations: drop the added relations it flags, again until none is
      for (var pass = 0; pass < 6; pass++) {
        var an = S.analyze(sk), bad = [];
        for (var k = n0; k < sk.rels.length; k++) if (an.rels[k] === 'redundant' || an.rels[k] === 'conflict') bad.push(k);
        if (!bad.length) break;
        for (var q = bad.length - 1; q >= 0; q--) sk.rels.splice(bad[q], 1);
        S.solve(sk);
      }
      var an2 = S.analyze(sk);
      // an added relation that made an older dimension redundant: take added ones back, last first, until none does
      for (var z = sk.rels.length - 1; z >= n0 && (an2.redundant > before.redundant || an2.conflicts > before.conflicts); z--) {
        sk.rels.splice(z, 1); S.solve(sk); an2 = S.analyze(sk);
      }
      if (an2.conflicts > before.conflicts) { restore(sk, saved); return { ok: false, error: 'Constrain All could not solve the sketch: its relations conflict.' }; }
    }
    if (sk.rels && !sk.rels.length) delete sk.rels;
    var added = { coincident: 0, concentric: 0, horizontal: 0, vertical: 0, tangent: 0 };
    (sk.rels || []).slice(n0).forEach(function (r) { added[r.type] = (added[r.type] || 0) + 1; });
    var out = { ok: true, added: added, relations: (sk.rels || []).length - n0, dims: 0 };
    if (opts.fullyDefine !== false) {
      var fo = { relations: { horizontal: true, vertical: true }, dims: opts.dims !== false, hScheme: opts.hScheme || opts.scheme || 'baseline', vScheme: opts.vScheme || opts.scheme || 'baseline' };
      if (opts.hPlace) fo.hPlace = opts.hPlace;   // rfBC: the Constrain All PM's placement fields
      if (opts.vPlace) fo.vPlace = opts.vPlace;
      if (opts.hDatum) fo.hDatum = opts.hDatum;
      if (opts.vDatum) fo.vDatum = opts.vDatum;
      if (opts.minGap) fo.minGap = opts.minGap;
      var fd = S.fullyDefine(sk, fo);
      if (fd && fd.ok !== false) {
        (fd.rels || []).forEach(function (i) { var r = sk.rels[i]; if (r && !(S.TYPES[r.type] || {}).dim) { out.relations++; added[r.type] = (added[r.type] || 0) + 1; } else out.dims++; });
        out.dims += (fd.dims || []).length;
      }
    }
    var an3 = S.analyze(sk);
    out.status = an3.status; out.dof = an3.dof;
    return out;
  }

  // ---- Modify Sketch
  var GEOM = { x: 1, y: 1, x1: 1, y1: 1, x2: 1, y2: 1, cx: 1, cy: 1, r: 1, a0: 1, a1: 1, w: 1, h: 1, pts: 1, rot: 1, tans: 1, rx: 1, ry: 1, n: 1, t: 1 };
  // the sketch's extents { x0, y0, x1, y1 } over its curves (construction geometry left out), or null
  function sketchBox(sk) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    function add(p) { b.x0 = Math.min(b.x0, p[0]); b.y0 = Math.min(b.y0, p[1]); b.x1 = Math.max(b.x1, p[0]); b.y1 = Math.max(b.y1, p[1]); }
    sk.entities.forEach(function (e) {
      if (e.construction) return;
      if (e.t === 'point') { add([e.x, e.y]); return; }
      var pls = K && K.entityPolylines ? K.entityPolylines(e) : [];
      pls.forEach(function (l) { l.pts.forEach(add); });
    });
    return isFinite(b.x0) ? b : null;
  }
  // modifySketch(sketch, op) -> { ok, dropped, error }: op { dx, dy } (translate) | { rot: degrees, cx, cy } |
  // { s: factor, cx, cy } | { flip: 'h' (mirror left-right about x = cx) | 'v' (upside down about y = cy), cx, cy }.
  // The whole sketch moves with its relations and dimensions; relations that tie it to the origin or hold it Fixed are
  // deleted (counted in dropped), as nothing outside the sketch moves with it.
  function modifySketch(sk, op) {
    op = op || {};
    var E = sk.entities || [];
    if (!E.length) return { ok: false, error: 'The sketch has no geometry to modify.' };
    if (op.s != null && !(+op.s > 0)) return { ok: false, error: 'The scale factor must be a positive number.' };
    var saved = save(sk), dropped = 0;
    if (sk.rels) {
      sk.rels = sk.rels.filter(function (r) { var ext = r.type === 'fix' || r.refs.some(function (x) { var p = S.parseRef(x); return !p || p.o; }); if (ext) dropped++; return !ext; });
      if (!sk.rels.length) delete sk.rels;
    }
    var all = E.map(function (e, i) { return i; }), r;
    if (op.flip) r = flipSketch(sk, op);
    else if (op.rot != null) r = S.transformEntities(sk, all, { rot: +op.rot, cx: +op.cx || 0, cy: +op.cy || 0 }, { keepRelations: true });
    else if (op.s != null) r = S.transformEntities(sk, all, { s: +op.s, cx: +op.cx || 0, cy: +op.cy || 0 }, { keepRelations: true });
    else r = S.transformEntities(sk, all, { dx: +op.dx || 0, dy: +op.dy || 0 }, { keepRelations: true });
    if (!r || !r.ok) { restore(sk, saved); return { ok: false, error: (r && r.error) || 'The sketch could not be modified.' }; }
    // ordinate sets' text lines go with the sketch
    (sk.rels || []).forEach(function (rel) {
      if (rel.ordAt == null) return;
      var alongY = rel.ordAxis === 'y', c0 = alongY ? (+op.cx || 0) : (+op.cy || 0);   // a vertical set's values stand at a sketch x
      if (op.flip) { if ((op.flip === 'h') === alongY) rel.ordAt = 2 * c0 - rel.ordAt; }
      else if (op.s != null) rel.ordAt = c0 + (rel.ordAt - c0) * op.s;
      else if (op.rot == null) rel.ordAt += alongY ? (+op.dx || 0) : (+op.dy || 0);
    });
    return { ok: true, dropped: dropped };
  }
  function flipSketch(sk, op) {
    if (!K || !K.mirrorEntity) return { ok: false, error: 'Flip needs the kernel.' };
    var E = sk.entities, axis = op.flip === 'h' ? { p: [+op.cx || 0, 0], d: [0, 1] } : { p: [0, +op.cy || 0], d: [1, 0] };
    function m(p) { return op.flip === 'h' ? [2 * axis.p[0] - p[0], p[1]] : [p[0], 2 * axis.p[1] - p[1]]; }
    var before = S.analyze(sk), tol = 1e-7 * sketchSize(sk);
    var oldPts = E.map(function (e, i) { return S.pointRefs(sk, i); });
    var oldCurves = E.map(function (e, i) { return S.curveRefs(sk, i).map(function (ref) { return { ref: ref, c: S.refCurve(sk, ref) }; }); });
    var NE = E.map(function (e) {
      var o = K.mirrorEntity(e, axis);
      if (!o) return null;
      Object.keys(e).forEach(function (k) { if (!GEOM[k] && !(k in o)) o[k] = clone(e[k]); });
      return o;
    });
    if (NE.some(function (o) { return !o; })) return { ok: false, error: 'An entity of this sketch cannot be flipped.' };
    sk.entities = NE;
    // the relations follow their points: an arc's start is its mirror image's end, a rectangle's corners swap
    var map = {};
    function close(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol; }
    NE.forEach(function (e, i) {
      var nps = S.pointRefs(sk, i);
      oldPts[i].forEach(function (pr) {
        var q = m(pr.pt), best = null, bd = tol;
        nps.forEach(function (np) { var d = Math.hypot(np.pt[0] - q[0], np.pt[1] - q[1]); if (d <= bd) { bd = d; best = np.ref; } });
        if (best && best !== pr.ref) map[pr.ref] = best;
      });
      var ncs = S.curveRefs(sk, i).map(function (ref) { return { ref: ref, c: S.refCurve(sk, ref) }; });
      oldCurves[i].forEach(function (oc) {
        if (!oc.c || oc.c.kind !== 'line') return;
        var a = m(oc.c.a), b = m(oc.c.b);
        ncs.forEach(function (nc) {
          if (!nc.c || nc.c.kind !== 'line' || nc.ref === oc.ref) return;
          if ((close(nc.c.a, a) && close(nc.c.b, b)) || (close(nc.c.a, b) && close(nc.c.b, a))) map[oc.ref] = nc.ref;
        });
      });
    });
    (sk.rels || []).forEach(function (rel) { rel.refs = rel.refs.map(function (x) { return map[x] || x; }); });
    var res = S.solve(sk), an = S.analyze(sk);
    if (!res.ok || an.conflicts > before.conflicts) return { ok: false, error: 'The flipped sketch does not solve: its relations conflict.' };
    return { ok: true };
  }

  // ---- Segment (Tools ▸ Sketch Tools ▸ Segment)
  // segmentEntity(sketch, i, n, opts) -> { ok, added: [indices], points, error }: sketch points dividing line / arc i
  // into n equal segments (n − 1 points between its ends; n points round a circle, the first at 0°), each Coincident
  // with it. opts.split: the line / arc itself becomes n equal pieces joined end to end (Collinear / Concentric, Equal).
  function segmentEntity(sk, i, n, opts) {
    opts = opts || {};
    var E = sk.entities, e = E[i];
    n = n | 0;
    if (!e) return { ok: false, error: 'Select a line, arc or circle.' };
    if (!(n >= 2 && n <= 1000)) return { ok: false, error: 'The number of segments is 2 or more.' };
    if (!/^(line|arc|circle)$/.test(e.t)) return { ok: false, error: 'Segment divides a line, an arc or a circle.' };
    if (opts.split && e.t === 'circle') return { ok: false, error: 'A circle is divided by points (clear Sketch segments).' };
    var saved = save(sk), before = S.analyze(sk), added = [], pts = [], k;
    var m = e.t === 'circle' ? n : n - 1;
    for (k = 1; k <= m; k++) {
      var t = e.t === 'circle' ? (k - 1) / n : k / n;
      if (e.t === 'line') pts.push([e.x1 + (e.x2 - e.x1) * t, e.y1 + (e.y2 - e.y1) * t]);
      else {
        var a0 = e.t === 'circle' ? 0 : e.a0, a1 = e.t === 'circle' ? 360 : e.a1, a = (a0 + (a1 - a0) * t) * Math.PI / 180;
        pts.push([e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]);
      }
    }
    pts = tidyPts(pts, sketchSize(sk));
    if (opts.split) {
      var pieces = [];
      for (k = 0; k < n; k++) {
        var o = clone(e);
        if (e.t === 'line') {
          var p0 = k ? pts[k - 1] : [e.x1, e.y1], p1 = k < n - 1 ? pts[k] : [e.x2, e.y2];
          o.x1 = p0[0]; o.y1 = p0[1]; o.x2 = p1[0]; o.y2 = p1[1];
        } else { o.a0 = e.a0 + (e.a1 - e.a0) * k / n; o.a1 = e.a0 + (e.a1 - e.a0) * (k + 1) / n; }
        pieces.push(o);
      }
      // the first piece takes the entity's place (its relations stay on it); the rest go on the end, joined end to end
      E[i] = pieces[0];
      var prev = i;
      sk.rels = sk.rels || [];
      for (k = 1; k < n; k++) {
        E.push(pieces[k]);
        var j = E.length - 1;
        added.push(j);
        sk.rels.push({ type: 'coincident', refs: [prev + '.p2', j + '.p1'] });
        sk.rels.push({ type: e.t === 'line' ? 'collinear' : 'concentric', refs: [String(prev), String(j)] });
        sk.rels.push({ type: 'equal', refs: [String(i), String(j)] });
        prev = j;
      }
      // relations on the old end point move to the last piece's end
      sk.rels.forEach(function (rel) { if (rel.refs.indexOf(i + '.p2') >= 0 && !(rel.type === 'coincident' && rel.refs[0] === i + '.p2' && rel.refs[1] === added[0] + '.p1')) rel.refs = rel.refs.map(function (x) { return x === i + '.p2' ? prev + '.p2' : x; }); });
    } else {
      pts.forEach(function (p) {
        E.push({ t: 'point', x: p[0], y: p[1] });
        var j = E.length - 1;
        added.push(j);
        (sk.rels = sk.rels || []).push({ type: 'coincident', refs: [String(j), String(i)] });
      });
    }
    var res = S.solve(sk), an = S.analyze(sk);
    if (!res.ok || an.conflicts > before.conflicts) { restore(sk, saved); return { ok: false, error: 'The segments conflict with the sketch\'s relations.' }; }
    for (var z = (sk.rels || []).length - 1; z >= 0 && an.redundant > before.redundant; z--) {
      if (an.rels[z] !== 'redundant') continue;
      sk.rels.splice(z, 1); S.solve(sk); an = S.analyze(sk);
    }
    return { ok: true, added: added, points: pts };
  }

  // ---- Equation Driven Curve: the points of y = f(x) over [x1, x2] or of x(t), y(t) over [t1, t2]
  // eq { kind: 'explicit', y, x0, x1, n } | { kind: 'parametric', x, y, t0, t1, n } (n segments; 24 by default). The
  // expressions use x (or t), pi, e, + − * / ^ and sin, cos, tan, asin, acos, atan, sqrt, abs, exp, ln / log, pow, ….
  // Returns { ok, pts, error }.
  var FN = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'sqrt', 'abs', 'exp', 'log', 'pow', 'min', 'max', 'floor', 'ceil', 'round', 'sign'];
  function compileExpr(src, v) {
    var s = String(src == null ? '' : src).trim();
    if (!s) throw new Error('Enter an equation.');
    if (/[^0-9a-zA-Z_+\-*/^().,\s]/.test(s)) throw new Error('The equation may use numbers, ' + v + ', + - * / ^, parentheses and functions such as sin, cos, sqrt.');
    var body = s.replace(/\^/g, '**').replace(/[a-zA-Z_]\w*/g, function (w) {
      if (w === v) return v;
      if (w === 'pi' || w === 'PI') return 'Math.PI';
      if (w === 'e') return 'Math.E';
      if (w === 'ln') return 'Math.log';
      if (FN.indexOf(w) >= 0) return 'Math.' + w;
      throw new Error('Unknown name "' + w + '" in the equation (the variable is ' + v + ').');
    });
    try { return new Function(v, '"use strict"; return (' + body + ');'); } catch (err) { throw new Error('The equation is not valid: ' + s); }
  }
  // a range end: a number or a constant expression ("pi", "2*pi")
  function num(v) { if (typeof v === 'number') return v; var s = String(v == null ? '' : v).trim(); if (!s) return NaN; if (isFinite(+s)) return +s; try { return +compileExpr(s, 'u')(0); } catch (err) { return NaN; } }
  function tidyPts(pts, size) { return pts.map(function (p) { return p.map(function (v) { var r = +(+v).toPrecision(12); return Math.abs(r) < 1e-12 * size ? 0 : r; }); }); }
  function equationPoints(eq) {
    try {
      eq = eq || {};
      var n = Math.max(2, Math.min(400, (eq.n | 0) || 24)), pts = [], k;
      if (eq.kind === 'parametric') {
        var fx = compileExpr(eq.x, 't'), fy = compileExpr(eq.y, 't'), t0 = num(eq.t0), t1 = num(eq.t1);
        if (!isFinite(t0) || !isFinite(t1) || t0 === t1) throw new Error('Set the parameters t1 and t2 (they must differ).');
        for (k = 0; k <= n; k++) { var t = t0 + (t1 - t0) * k / n; pts.push([+fx(t), +fy(t)]); }
      } else {
        var f = compileExpr(eq.y, 'x'), x0 = num(eq.x0), x1 = num(eq.x1);
        if (!isFinite(x0) || !isFinite(x1) || x0 === x1) throw new Error('Set the end points x1 and x2 (they must differ).');
        for (k = 0; k <= n; k++) { var x = x0 + (x1 - x0) * k / n; pts.push([x, +f(x)]); }
      }
      if (pts.some(function (p) { return !isFinite(p[0]) || !isFinite(p[1]); })) throw new Error('The equation has no value at some point of the range.');
      var big = 1; pts.forEach(function (p) { big = Math.max(big, Math.abs(p[0]), Math.abs(p[1])); });
      return { ok: true, pts: tidyPts(pts, big) };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  S.constrainAll = constrainAll;
  S.constrainCandidates = function (sk, opts) { return constrainCandidates(sk, candOpts(sk, opts || {})); };
  S.modifySketch = modifySketch; S.sketchBox = sketchBox; S.segmentEntity = segmentEntity; S.equationPoints = equationPoints;
})(typeof SketchSolver !== 'undefined' ? SketchSolver : null);

// ------------------------------------------------------------------ rfAQ: Chamfer Dimension, Path Length, Angular Running
// SolidWorks' sketch dimension tools beside Smart Dimension. Each is a dimension relation the solver drives like a
// distance (types chamfer / pathlength / runangle in the main block):
//   chamfer     refs [chamfer line, adjacent line], v = the chamfer's length along the adjacent line, cang = the angle
//               between them (degrees, 0..90); both drive. Shown "0.100 X 45°".
//   pathlength  refs = the lines / arcs / circles of a chain, v = their total length. Shown with a leader to the chain.
//   runangle    refs [vertex, datum point, point], v = the angle at the vertex from the datum's direction to the point's,
//               counter-clockwise (0 to 360); the members of one set share run ('a1', 'a2' …), vertex, datum and off
//               (the radius their arcs are drawn at). The datum shows "0°".
// lo ([du, dv] from the dimension's anchor: the chamfer line's middle, the first path entity's middle) is where a chamfer
// or path-length label sits. Scripts keep cang / run / lo with `.rfaq([[relIndex, { cang, run, lo }], …])` after the
// `.rel(…)` lines.
(function (S) {
  'use strict';
  if (!S) return;
  var K = typeof Kernel !== 'undefined' ? Kernel : null;
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function save(sk) { return { e: clone(sk.entities), r: sk.rels ? clone(sk.rels) : null }; }
  function restore(sk, s) { sk.entities = s.e; if (s.r) sk.rels = s.r; else delete sk.rels; }
  function r4(x) { return Math.round(x * 1e4) / 1e4; }
  // the acute angle between a chamfer's two lines (degrees)
  function chamferAngle(sketch, refs) {
    var a = S.refCurve(sketch, refs[0]), b = S.refCurve(sketch, refs[1]);
    if (!a || !b || a.kind !== 'line' || b.kind !== 'line') return null;
    var d1 = [a.b[0] - a.a[0], a.b[1] - a.a[1]], d2 = [b.b[0] - b.a[0], b.b[1] - b.a[1]];
    var c = Math.abs(d1[0] * d2[0] + d1[1] * d2[1]) / ((Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1])) || 1);
    return Math.acos(Math.min(1, c)) * 180 / Math.PI;
  }
  // a dimension added, made driven (reference) when it would over-define the sketch, as SolidWorks offers
  function finish(sketch, r, extra) {
    if (!r.ok) return { ok: false, error: r.error };
    var idx = r.rels[0], rel = sketch.rels[idx], driven = false;
    if (extra) Object.keys(extra).forEach(function (k) { if (extra[k] != null) rel[k] = clone(extra[k]); });
    if (rel.cang != null && !rel.driven && r.status === 'ok') {
      var an0 = S.analyze(sketch), res = S.solve(sketch), an = S.analyze(sketch);
      if (!res.ok || an.rels[idx] === 'conflict' || an.rels[idx] === 'redundant' || an.redundant > an0.redundant || an.conflicts > an0.conflicts) r.status = 'redundant';
      // the angle alone over-defines: keep the length driving, the angle follows the geometry
      if (r.status !== 'ok') { delete rel.cang; S.solve(sketch); var an2 = S.analyze(sketch); r.status = an2.rels[idx] === 'ok' ? 'ok' : 'redundant'; if (r.status === 'ok') rel.cangDriven = true; }
    }
    if (r.status !== 'ok' && !rel.driven) { S.setDriven(sketch, 'rel', idx, true); driven = true; }
    return { ok: true, index: idx, driven: driven, status: r.status };
  }
  // addChamferDim(sketch, chamferRef, adjacentRef, { lo, driven }) -> { ok, index, driven } | { ok: false, error }
  function addChamferDim(sketch, cRef, aRef, opts) {
    opts = opts || {};
    cRef = String(cRef); aRef = String(aRef);
    if (S.refKind(sketch, cRef) !== 'line' || S.refKind(sketch, aRef) !== 'line') return { ok: false, error: 'A chamfer dimension takes the chamfer line, then the line it is measured along.' };
    if (cRef === aRef) return { ok: false, error: 'Pick the line next to the chamfer.' };
    var ang = chamferAngle(sketch, [cRef, aRef]);
    if (!(ang > 1e-6) || !(ang < 90 - 1e-6)) return { ok: false, error: 'A chamfer meets the line next to it at an angle between 0° and 90°.' };
    var before = save(sketch);
    var r = S.addRelation(sketch, 'chamfer', [cRef, aRef], { driven: !!opts.driven });
    var out = finish(sketch, r, { cang: Math.round(ang * 1e6) / 1e6, lo: opts.lo });
    if (!out.ok) restore(sketch, before);
    return out;
  }
  // the angle a chamfer dimension shows: what it holds, or what the geometry has (driven, or its angle not driving)
  function chamferShownAngle(sketch, rel) { return rel.cang != null && !rel.driven ? rel.cang : chamferAngle(sketch, rel.refs); }
  // setChamferAngle(sketch, index, deg): drive a chamfer dimension's angle
  function setChamferAngle(sketch, index, deg) {
    var rel = (sketch.rels || [])[index];
    if (!rel || rel.type !== 'chamfer') return { ok: false, error: 'Not a chamfer dimension.' };
    if (rel.driven) return { ok: false, error: 'This is a driven dimension: its value follows the geometry. Make it driving to change it.' };
    deg = +deg;
    if (!(deg > 0 && deg < 90)) return { ok: false, error: 'A chamfer angle is between 0° and 90°.' };
    var before = save(sketch);
    rel.cang = deg; delete rel.cangDriven;
    var res = S.solve(sketch), an = S.analyze(sketch);
    if (!res.ok || an.rels[index] === 'conflict') {
      restore(sketch, before);
      return { ok: false, error: 'That angle conflicts with the sketch\'s other relations or dimensions.' };
    }
    return { ok: true };
  }
  // addPathLength(sketch, refs, { lo, driven }) -> { ok, index, driven }
  function addPathLength(sketch, refs, opts) {
    opts = opts || {};
    refs = (refs || []).map(String).filter(function (r, i, a) { return a.indexOf(r) === i; });
    if (!refs.length) return { ok: false, error: 'Pick the lines and arcs of the path.' };
    if (S.measure(sketch, 'pathlength', refs) == null) return { ok: false, error: 'A path length runs along lines, arcs and circles.' };
    var before = save(sketch);
    var out = finish(sketch, S.addRelation(sketch, 'pathlength', refs, { driven: !!opts.driven }), { lo: opts.lo });
    if (!out.ok) restore(sketch, before);
    return out;
  }
  // every Angular Running set: { id: { id, vertex, datum, off, members: [rel index, …] } }
  function runningSets(sketch) {
    var out = {};
    (sketch.rels || []).forEach(function (rel, i) {
      if (!rel || rel.type !== 'runangle' || rel.run == null) return;
      var s = out[rel.run] || (out[rel.run] = { id: String(rel.run), vertex: rel.refs[0], datum: rel.refs[1], off: rel.off, members: [] });
      s.members.push(i);
    });
    return out;
  }
  function newRunId(sketch) {
    var n = 0;
    (sketch.rels || []).forEach(function (r) { var m = /^a(\d+)$/.exec(String(r.run == null ? '' : r.run)); if (m) n = Math.max(n, +m[1]); });
    return 'a' + (n + 1);
  }
  function isPt(sketch, ref) { var k = S.refKind(sketch, ref); return k === 'point' || k === 'circle'; }
  function ptOf(sketch, ref) { return S.refPoint(sketch, ref) || (S.refCurve(sketch, ref) || {}).c || null; }
  // addRunningAngle(sketch, { vertex, datum, target, run?, off? }) -> { ok, index, run, driven }: one more member of set
  // `run` (a new set when not given): the counter-clockwise angle at vertex from datum to target (point refs)
  function addRunningAngle(sketch, spec) {
    spec = spec || {};
    var set = spec.run != null ? runningSets(sketch)[spec.run] : null;
    var vertex = String(set ? set.vertex : spec.vertex), datum = String(set ? set.datum : spec.datum), target = String(spec.target);
    if (!isPt(sketch, vertex) || !isPt(sketch, datum) || !isPt(sketch, target)) return { ok: false, error: 'An angular running dimension measures at a vertex, from the datum line to other lines or points.' };
    var pv = ptOf(sketch, vertex), pd = ptOf(sketch, datum), pt = ptOf(sketch, target);
    var tol = 1e-9 * Math.max(1, Math.abs(pv[0]), Math.abs(pv[1]));
    if (Math.hypot(pd[0] - pv[0], pd[1] - pv[1]) <= tol || Math.hypot(pt[0] - pv[0], pt[1] - pv[1]) <= tol) return { ok: false, error: 'That is the vertex of the angles.' };
    if (target === datum) return { ok: false, error: 'That is the 0° datum.' };
    if (set && set.members.some(function (i) { return sketch.rels[i].refs[2] === target; })) return { ok: false, error: S.refName(sketch, target) + ' is dimensioned in this set already.' };
    var run = set ? set.id : spec.run != null ? String(spec.run) : newRunId(sketch);
    var off = spec.off != null ? +spec.off : set && set.off != null ? set.off : null;
    var before = save(sketch);
    var r = S.addRelation(sketch, 'runangle', [vertex, datum, target], { driven: !!spec.driven, off: off });
    var out = finish(sketch, r, { run: run });
    if (!out.ok) { restore(sketch, before); return out; }
    out.run = run;
    return out;
  }
  function deleteRunningSet(sketch, run) {
    var n0 = (sketch.rels || []).length;
    sketch.rels = (sketch.rels || []).filter(function (r) { return r.type !== 'runangle' || String(r.run) !== String(run); });
    if (!sketch.rels.length) delete sketch.rels;
    S.solve(sketch);
    return n0 - (sketch.rels || []).length;
  }
  S.chamferAngle = chamferAngle; S.chamferShownAngle = chamferShownAngle; S.addChamferDim = addChamferDim; S.setChamferAngle = setChamferAngle; S.addPathLength = addPathLength;
  S.runningSets = runningSets; S.newRunId = newRunId; S.addRunningAngle = addRunningAngle; S.deleteRunningSet = deleteRunningSet;
  // script round trip: the fields the `.rel(…)` lines do not carry (written after them)
  if (K && K.Builder && K.registerSketchScript && K.newModel && !K.__sketchRfaq) {
    K.__sketchRfaq = true;
    var SBP = Object.getPrototypeOf(new K.Builder(K.newModel('x')).sketch('Front'));
    // .rfaq([[i, { cang, run, lo }], …]): a chamfer dimension's angle, an angular running set, a label's place
    SBP.rfaq = function (list) {
      var self = this, solveAgain = false;
      (list || []).forEach(function (p) {
        var rel = (self.f.rels || [])[p[0]], o = p[1] || {};
        if (!rel || !/^(chamfer|pathlength|runangle)$/.test(rel.type)) throw new Error('No chamfer, path length or angular running dimension ' + p[0] + '.');
        if (o.cang != null) { rel.cang = +o.cang; solveAgain = true; }
        if (o.cangDriven) rel.cangDriven = true;
        if (o.run != null) rel.run = String(o.run);
        if (Array.isArray(o.lo)) rel.lo = [+o.lo[0], +o.lo[1]];
      });
      if (solveAgain) S.solve(this.f);
      return this;
    };
    K.registerSketchScript(function (f) {
      var list = (f.rels || []).map(function (r, i) {
        if (!r || !/^(chamfer|pathlength|runangle)$/.test(r.type)) return null;
        var o = {};
        if (r.cang != null) o.cang = Math.round(r.cang * 1e6) / 1e6;
        if (r.cangDriven) o.cangDriven = true;
        if (r.run != null) o.run = r.run;
        if (Array.isArray(r.lo)) o.lo = [r4(r.lo[0]), r4(r.lo[1])];
        return Object.keys(o).length ? [i, o] : null;
      }).filter(function (x) { return x; });
      return list.length ? '\n  .rfaq(' + JSON.stringify(list) + ')' : '';
    });
  }
})(typeof SketchSolver !== 'undefined' ? SketchSolver : null);

// ---- rfBL (lane BL, 2026-10-13): Mastercam's Offset Contour (Transform â–¸ Offset â–¸ Chains), exact
// contourOffset(E, items, closed, d, opts): the chain items [{ i, dir }] (lines / arcs of E joined end to end, dir 1:
// travelled p1 -> p2; closed: the last joins the first) offset by the signed distance d to the LEFT of the travel
// (d < 0: right). Lines stay lines and arcs arcs (an arc's copy is concentric). opts.corners: 'none' (sharp: the
// offset curves are extended to meet at every outside corner), 'sharp' (an arc of radius |d| round the base corner on
// the outside corners sharper than opts.maxAngle, the included angle, default 135Â°; the others sharp), 'all' (an arc
// on every outside corner). Inside corners are trimmed to where the copies cross; an arc that shrinks to nothing goes
// and its neighbours meet; then the copy is cut wherever it crosses itself and every piece nearer the base chain than
// |d| (a loop) goes, as Mastercam trims a closed contour's offset. Returns { ok, entities, error }; an arc added at a
// corner carries corner: true.
(function (S) {
  'use strict';
  if (!S) return;
  var TAU = 2 * Math.PI, D2R = Math.PI / 180;
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function crs(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function unit(v) { var l = Math.hypot(v[0], v[1]); return l > 0 ? [v[0] / l, v[1] / l] : [0, 0]; }
  function normRad(a) { a = a % TAU; return a < 0 ? a + TAU : a; }
  function angDiffRad(a, b) { var x = normRad(a - b); return x > Math.PI ? x - TAU : x; }
  // a piece as travelled: line { k: 'L', a, b } | arc { k: 'A', c, r, s (start angle, rad), sw (signed sweep, rad) }
  function segOf(e, dir) {
    if (!e) return null;
    if (e.t === 'line') return dir === -1 ? { k: 'L', a: [e.x2, e.y2], b: [e.x1, e.y1] } : { k: 'L', a: [e.x1, e.y1], b: [e.x2, e.y2] };
    if (e.t === 'arc') {
      var a0 = e.a0 * D2R, sw = (e.a1 - e.a0) * D2R;
      return dir === -1 ? { k: 'A', c: [e.cx, e.cy], r: e.r, s: a0 + sw, sw: -sw } : { k: 'A', c: [e.cx, e.cy], r: e.r, s: a0, sw: sw };
    }
    return null;
  }
  function at(g, t) {
    if (g.k === 'L') return t === 0 ? g.a.slice() : t === 1 ? g.b.slice() : [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t];
    var a = g.s + g.sw * t;
    return [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)];
  }
  function tanAt(g, t) {
    if (g.k === 'L') return unit(sub(g.b, g.a));
    var a = g.s + g.sw * t, sg = g.sw >= 0 ? 1 : -1;
    return [-Math.sin(a) * sg, Math.cos(a) * sg];
  }
  function segLen(g) { return g.k === 'L' ? dist(g.a, g.b) : Math.abs(g.sw) * g.r; }
  function offSeg(g, d, tol) {
    if (g.k === 'L') { var t = tanAt(g, 0), n = [-t[1] * d, t[0] * d]; return { k: 'L', a: [g.a[0] + n[0], g.a[1] + n[1]], b: [g.b[0] + n[0], g.b[1] + n[1]] }; }
    var r = g.r - (g.sw >= 0 ? 1 : -1) * d;
    return r > tol ? { k: 'A', c: g.c, r: r, s: g.s, sw: g.sw } : null;
  }
  // the parameter (0..1) of the angle of p along arc g, or null outside its sweep (eps: angle tolerance, rad)
  function arcParam(g, p, eps) {
    var a = Math.atan2(p[1] - g.c[1], p[0] - g.c[0]), w = Math.abs(g.sw), delta = g.sw >= 0 ? normRad(a - g.s) : normRad(g.s - a);
    if (delta <= w + eps) return w > 0 ? Math.min(1, delta / w) : 0;
    if (TAU - delta <= eps) return 0;
    return null;
  }
  function lineParam(g, p) { var d = sub(g.b, g.a), L2 = dot(d, d); return L2 > 0 ? dot(sub(p, g.a), d) / L2 : 0; }
  function distTo(g, p) {
    if (g.k === 'L') { var t = Math.max(0, Math.min(1, lineParam(g, p))); return dist(p, at(g, t)); }
    if (arcParam(g, p, 0) != null) return Math.abs(dist(p, g.c) - g.r);
    return Math.min(dist(p, at(g, 0)), dist(p, at(g, 1)));
  }
  // where the carriers of two pieces (an endless line, a whole circle) meet
  function circleCircle(c1, r1, c2, r2) {
    var dx = c2[0] - c1[0], dy = c2[1] - c1[1], D = Math.hypot(dx, dy), e = 1e-12 * (r1 + r2);
    if (D < 1e-12 * Math.max(1, r1) || D > r1 + r2 + e || D < Math.abs(r1 - r2) - e) return [];
    var a = (r1 * r1 - r2 * r2 + D * D) / (2 * D), h2 = r1 * r1 - a * a, h = h2 > 0 ? Math.sqrt(h2) : 0, mx = c1[0] + a * dx / D, my = c1[1] + a * dy / D;
    if (h <= 1e-12 * r1) return [[mx, my]];
    return [[mx - h * dy / D, my + h * dx / D], [mx + h * dy / D, my - h * dx / D]];
  }
  function lineCircle(a, b, c, r) {
    var d = sub(b, a), f = sub(a, c), A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - r * r, disc = B * B - 4 * A * C;
    if (!(A > 0) || disc < -1e-12 * Math.max(B * B, A * r * r)) return [];
    if (disc <= 0) { var t0 = -B / (2 * A); return [[a[0] + d[0] * t0, a[1] + d[1] * t0]]; }
    var sq = Math.sqrt(disc), out = [];
    [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].forEach(function (t) { out.push([a[0] + d[0] * t, a[1] + d[1] * t]); });
    return out;
  }
  function carrierHits(A, B) {
    if (A.k === 'L' && B.k === 'L') {
      var d1 = sub(A.b, A.a), d2 = sub(B.b, B.a), den = crs(d1, d2);
      if (Math.abs(den) <= 1e-12 * Math.sqrt(dot(d1, d1) * dot(d2, d2))) return [];
      var t = crs(sub(B.a, A.a), d2) / den;
      return [[A.a[0] + d1[0] * t, A.a[1] + d1[1] * t]];
    }
    if (A.k === 'L') return lineCircle(A.a, A.b, B.c, B.r);
    if (B.k === 'L') return lineCircle(B.a, B.b, A.c, A.r);
    return circleCircle(A.c, A.r, B.c, B.r);
  }
  // the parameters [tA, tB] where pieces A and B cross (within their extents)
  function pieceHits(A, B) {
    var out = [], eps = 1e-9;
    carrierHits(A, B).forEach(function (p) {
      var ta = A.k === 'L' ? lineParam(A, p) : arcParam(A, p, eps), tb = B.k === 'L' ? lineParam(B, p) : arcParam(B, p, eps);
      if (ta == null || tb == null || ta < -eps || ta > 1 + eps || tb < -eps || tb > 1 + eps) return;
      out.push([Math.max(0, Math.min(1, ta)), Math.max(0, Math.min(1, tb))]);
    });
    return out;
  }
  function subPiece(g, t0, t1) {
    if (g.k === 'L') return { k: 'L', a: at(g, t0), b: at(g, t1) };
    return { k: 'A', c: g.c, r: g.r, s: g.s + g.sw * t0, sw: g.sw * (t1 - t0) };
  }
  function toEntity(g) {
    if (g.k === 'L') return { t: 'line', x1: g.a[0], y1: g.a[1], x2: g.b[0], y2: g.b[1] };
    var a0 = (g.sw >= 0 ? g.s : g.s + g.sw) / D2R, a1 = a0 + Math.abs(g.sw) / D2R;
    while (a0 >= 360) { a0 -= 360; a1 -= 360; }
    while (a0 < 0) { a0 += 360; a1 += 360; }
    // the round-off of a whole number of degrees goes (90.00000000000001 -> 90)
    var r0 = Math.round(a0), r1 = Math.round(a1);
    if (Math.abs(a0 - r0) < 1e-9) a0 = r0;
    if (Math.abs(a1 - r1) < 1e-9) a1 = r1;
    return { t: 'arc', cx: g.c[0], cy: g.c[1], r: g.r, a0: a0, a1: a1 };
  }
  function contourOffset(E, items, closed, d, opts) {
    opts = opts || {};
    d = +d;
    var mode = opts.corners || 'none', maxAng = opts.maxAngle == null ? 135 : +opts.maxAngle, ad = Math.abs(d);
    if (!(ad > 0) || !isFinite(ad)) return { ok: false, error: 'The offset distance must be a positive number.' };
    var segs = (items || []).map(function (it) { return segOf(E[it.i], it.dir); });
    if (!segs.length || segs.some(function (g) { return !g; })) return { ok: false, error: 'Offset Chains works on chains of lines and arcs.' };
    var scale = ad;
    segs.forEach(function (g) { [at(g, 0), at(g, 1)].forEach(function (p) { scale = Math.max(scale, Math.abs(p[0]), Math.abs(p[1])); }); });
    var tol = 1e-9 * Math.max(1, scale), n = segs.length, path = [];
    function push(p) { if (segLen(p) > tol) path.push(p); }
    function bridge(P, V, Q) { push({ k: 'L', a: P, b: V, junk: true }); push({ k: 'L', a: V, b: Q, junk: true }); }
    // extend / cut back prev's end and next's start to where their carriers meet (a sharp corner); false: they cannot
    function extendTo(prev, next, P, Q) {
      var M = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2], X = null;
      carrierHits(prev, next).forEach(function (h) { if (!X || dist(h, M) < dist(X, M)) X = h; });
      if (!X) return false;
      var ok = true, pe = null, ns = null;
      if (prev.k === 'L') ok = dot(sub(X, prev.a), sub(prev.b, prev.a)) > 0;
      else { var dp = angDiffRad(Math.atan2(X[1] - prev.c[1], X[0] - prev.c[0]), prev.s + prev.sw), swp = prev.sw + dp; ok = swp * prev.sw > 0 && Math.abs(swp) < TAU; pe = swp; }
      if (ok && next.k === 'L') ok = dot(sub(next.b, X), sub(next.b, next.a)) > 0;
      else if (ok) { var dn = angDiffRad(Math.atan2(X[1] - next.c[1], X[0] - next.c[0]), next.s), swn = next.sw - dn; ok = swn * next.sw > 0 && Math.abs(swn) < TAU; ns = [next.s + dn, swn]; }
      if (!ok) return false;
      if (prev.k === 'L') prev.b = X.slice(); else prev.sw = pe;
      if (next.k === 'L') next.a = X.slice(); else { next.s = ns[0]; next.sw = ns[1]; }
      return true;
    }
    function join(prev, next, V, tA, tB) {
      var P = at(prev, 1), Q = at(next, 0);
      if (dist(P, Q) <= tol) return;
      var th = Math.atan2(crs(tA, tB), dot(tA, tB));
      if (prev.junk || next.junk || th * d >= 0) { bridge(P, V, Q); return; }   // inside: the overlap is trimmed below
      var incl = 180 - Math.abs(th) / D2R, round = mode === 'all' || (mode === 'sharp' && incl < maxAng - 1e-7);
      if (!round && extendTo(prev, next, P, Q)) return;
      push({ k: 'A', c: V.slice(), r: ad, s: Math.atan2(P[1] - V[1], P[0] - V[0]), sw: th, corner: true });
    }
    var first = null, prev = null, k;
    for (k = 0; k < n; k++) {
      var g = segs[k], o = offSeg(g, d, tol), pcs = o ? [o] : [{ k: 'L', a: at(g, 0), b: g.c.slice(), junk: true }, { k: 'L', a: g.c.slice(), b: at(g, 1), junk: true }];
      if (prev) join(prev, pcs[0], at(g, 0), tanAt(segs[k - 1], 1), tanAt(g, 0));
      pcs.forEach(push);
      prev = pcs[pcs.length - 1];
      if (!first) first = pcs[0];
    }
    if (closed && n > 0) join(prev, first, at(segs[0], 0), tanAt(segs[n - 1], 1), tanAt(segs[0], 0));
    // cut the copy where it crosses itself; keep the pieces |d| from the base
    var m = path.length, cuts = path.map(function () { return [0, 1]; }), i, j;
    for (i = 0; i < m; i++) for (j = i + 1; j < m; j++) pieceHits(path[i], path[j]).forEach(function (h) { cuts[i].push(h[0]); cuts[j].push(h[1]); });
    function nearest(p) { var b = Infinity; segs.forEach(function (g) { b = Math.min(b, distTo(g, p)); }); return b; }
    var keepTol = 1e-9 * Math.max(1, scale), out = [];
    path.forEach(function (p, pi) {
      var ts = cuts[pi].sort(function (a, b) { return a - b; }), L = segLen(p), cur = null;
      for (var q = 0; q + 1 < ts.length; q++) {
        var t0 = ts[q], t1 = ts[q + 1];
        if ((t1 - t0) * L <= 10 * tol) continue;
        var keep = !p.junk && nearest(at(p, (t0 + t1) / 2)) >= ad - keepTol;
        if (!keep) { cur = null; continue; }
        if (cur && (t0 - cur[1]) * L <= 10 * tol) cur[1] = t1;
        else { cur = [t0, t1]; out.push({ g: p, run: cur }); }
      }
    });
    if (!out.length) return { ok: false, error: 'The offset distance is too large for the chain: nothing is left of it.' };
    return { ok: true, entities: out.map(function (x) { var e = toEntity(subPiece(x.g, x.run[0], x.run[1])); if (x.g.corner) e.corner = true; return e; }) };
  }
  S.contourOffset = contourOffset;
})(typeof SketchSolver !== 'undefined' ? SketchSolver : null);
