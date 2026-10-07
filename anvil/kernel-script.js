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
        if (arc) { segs.push(arc); i += m + 1; continue; }
      }
      segs.push({ t: 'line', a: p[a], b: p[(a + 1) % n] });
      i++;
    }
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

  // exportDXFFlat(flat, units, opts?) -> DXF text of a Kernel.flatPattern result. opts: { version: 'R12' (AC1009,
  // default) | 'R2000' (AC1015), style: 'polyline' (default) | 'entities', bendLines (default true), notes (default
  // true: the bend labels and the sheet note), origin (default true: the blank's lower-left corner at 0,0) }.
  // Layers: OUTLINE (the blank), HOLES (every inner loop; round holes are CIRCLEs), BEND (bend centre lines), NOTES.
  // Coordinates are in the part's units ($INSUNITS 1 inch / 4 mm, $MEASUREMENT 0 / 1).
  function exportDXFFlat(flat, units, opts) {
    opts = opts || {};
    units = units === 'in' ? 'in' : 'mm';
    var d = new DXF(units, opts), style = opts.style === 'entities' ? 'entities' : 'polyline';
    var cvs = flat.loops.map(function (l) { return dxfLoopCurves(l); });
    var box = curvesBox(cvs), shift = opts.origin === false || !isFinite(box.min[0]) ? [0, 0] : [-box.min[0], -box.min[1]];
    cvs.forEach(function (cv, i) { if (cv) emitLoop(d, i === 0 ? 'OUTLINE' : 'HOLES', cv, style, shift); });
    var s = flat.sheet, T = +s.thickness, inch = units === 'in';
    var th = inch ? Math.max(0.08, T) : Math.max(1.5, T);
    function sh(q) { return [q[0] + shift[0], q[1] + shift[1]]; }
    flat.bends.forEach(function (b) {
      if (opts.bendLines !== false) d.line('BEND', sh(b.a), sh(b.b));
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
    this.min = [Infinity, Infinity]; this.max = [-Infinity, -Infinity];
  }
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
    var cont = r2000 ? 'Continuous' : 'CONTINUOUS';
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
      P(12, fmt((mn[0] + mx[0]) / 2)); P(22, fmt((mn[1] + mx[1]) / 2)); P(13, 0); P(23, 0); P(14, 1); P(24, 1); P(15, 0); P(25, 0);
      P(16, 0); P(26, 0); P(36, 1); P(17, 0); P(27, 0); P(37, 0); P(40, fmt(Math.max(hh, w / 1.5) * 1.1)); P(41, 1.5); P(42, 50);
      P(43, 0); P(44, 0); P(50, 0); P(51, 0); P(71, 0); P(72, 100); P(73, 1); P(74, 3); P(75, 0); P(76, 0); P(77, 0); P(78, 0);
    });
    table('LTYPE', ltypes.length, function () {
      ltypes.forEach(function (lt, i) { record('LTYPE', 'LTYPE', 'AcDbLinetypeTableRecord', ['14', '15', '16'][i]); P(2, lt[0]); P(70, 0); P(3, lt[1]); P(72, 65); P(73, 0); P(40, 0); });
    });
    // the standard layers, plus any other layer an entity is on (e.g. a sketch's CONSTRUCTION, colour 8)
    var layers = DXF_LAYERS.slice(), names = layers.map(function (l) { return l[0]; });
    this.ents.forEach(function (e) { if (names.indexOf(e.layer) < 0) { names.push(e.layer); layers.push([e.layer, 8]); } });
    table('LAYER', layers.length, function () {
      layers.forEach(function (l, i) { record('LAYER', 'LAYER', 'AcDbLayerTableRecord', i ? null : '10'); P(2, l[0]); P(70, 0); P(62, l[1]); P(6, cont); });
    });
    table('STYLE', 1, function () {
      record('STYLE', 'STYLE', 'AcDbTextStyleTableRecord', '11');
      P(2, r2000 ? 'Standard' : 'STANDARD'); P(70, 0); P(40, 0); P(41, 1); P(50, 0); P(71, 0); P(42, 2.5); P(3, 'txt'); P(4, '');
    });
    table('VIEW', 0, function () { });
    table('UCS', 0, function () { });
    table('APPID', 1, function () { record('APPID', 'APPID', 'AcDbRegAppTableRecord', '12'); P(2, 'ACAD'); P(70, 0); });
    table('DIMSTYLE', 1, function () { record('DIMSTYLE', 'DIMSTYLE', 'AcDbDimStyleTableRecord'); P(2, r2000 ? 'Standard' : 'STANDARD'); P(70, 0); });
    if (r2000) table('BLOCK_RECORD', 2, function () {
      record('BLOCK_RECORD', 'BLOCK_RECORD', 'AcDbBlockTableRecord', msBR); P(2, '*Model_Space');
      record('BLOCK_RECORD', 'BLOCK_RECORD', 'AcDbBlockTableRecord', psBR); P(2, '*Paper_Space');
    });
    P(0, 'ENDSEC');
    // ---- BLOCKS (R2000: the model and paper space blocks)
    if (r2000) {
      P(0, 'SECTION'); P(2, 'BLOCKS');
      [[msBR, '*Model_Space', false, '20', '21'], [psBR, '*Paper_Space', true, '1C', '1D']].forEach(function (b) {
        P(0, 'BLOCK'); P(5, b[3]); P(330, b[0]); P(100, 'AcDbEntity'); if (b[2]) P(67, 1); P(8, 0); P(100, 'AcDbBlockBegin');
        P(2, b[1]); P(70, 0); P(10, 0); P(20, 0); P(30, 0); P(3, b[1]); P(1, '');
        P(0, 'ENDBLK'); P(5, b[4]); P(330, b[0]); P(100, 'AcDbEntity'); if (b[2]) P(67, 1); P(8, 0); P(100, 'AcDbBlockEnd');
      });
      P(0, 'ENDSEC');
    }
    // ---- ENTITIES
    P(0, 'SECTION'); P(2, 'ENTITIES');
    function head(type, layer, sub) {
      P(0, type);
      if (r2000) { P(5, H()); P(330, msBR); P(100, 'AcDbEntity'); }
      P(8, layer);
      if (r2000 && sub) P(100, sub);
    }
    this.ents.forEach(function (e) {
      if (e.k === 'LINE') {
        head('LINE', e.layer, 'AcDbLine');
        P(10, fmt(e.a[0])); P(20, fmt(e.a[1])); P(30, 0); P(11, fmt(e.b[0])); P(21, fmt(e.b[1])); P(31, 0);
      } else if (e.k === 'CIRCLE') {
        head('CIRCLE', e.layer, 'AcDbCircle');
        P(10, fmt(e.c[0])); P(20, fmt(e.c[1])); P(30, 0); P(40, fmt(e.r));
      } else if (e.k === 'ARC') {
        head('ARC', e.layer, 'AcDbCircle');
        P(10, fmt(e.c[0])); P(20, fmt(e.c[1])); P(30, 0); P(40, fmt(e.r));
        if (r2000) P(100, 'AcDbArc');
        P(50, fmtA(e.a0)); P(51, fmtA(e.a1));
      } else if (e.k === 'TEXT') {
        head('TEXT', e.layer, 'AcDbText');
        P(10, fmt(e.p[0])); P(20, fmt(e.p[1])); P(30, 0); P(40, fmt(e.h)); P(1, dxfText(e.s));
        if (e.rot) P(50, fmtA(e.rot));
        if (r2000) P(7, 'Standard');
        if (e.center) { P(72, 1); P(11, fmt(e.p[0])); P(21, fmt(e.p[1])); P(31, 0); }
        if (r2000) P(100, 'AcDbText');
      } else if (e.k === 'POLY') {
        if (r2000) {
          head('LWPOLYLINE', e.layer, 'AcDbPolyline');
          P(90, e.pts.length); P(70, e.closed ? 1 : 0); P(43, 0);
          e.pts.forEach(function (q, i) { P(10, fmt(q[0])); P(20, fmt(q[1])); if (e.bulges && e.bulges[i]) P(42, fmtA(e.bulges[i])); });
        } else {
          head('POLYLINE', e.layer); P(66, 1); P(10, 0); P(20, 0); P(30, 0); P(70, e.closed ? 1 : 0);
          e.pts.forEach(function (q, i) {
            P(0, 'VERTEX'); P(8, e.layer); P(10, fmt(q[0])); P(20, fmt(q[1])); P(30, 0);
            if (e.bulges && e.bulges[i]) P(42, fmtA(e.bulges[i]));
          });
          P(0, 'SEQEND'); P(8, e.layer);
        }
      }
    });
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
    P(9, '$LUNITS'); P(70, 2);
    P(9, '$EXTMIN'); P(10, fmt(mn[0])); P(20, fmt(mn[1])); P(30, 0);
    P(9, '$EXTMAX'); P(10, fmt(mx[0])); P(20, fmt(mx[1])); P(30, 0);
    P(0, 'ENDSEC');
    return out.concat(body, ['0', 'EOF']).join('\n');
  };

  // exportDXFSketch(sketch, units, opts?) -> DXF text of a sketch as drawn, full size in the sketch's own 2D frame:
  // every entity as its exact pieces (K.entityPrimitives): lines as LINE, circles as CIRCLE, arcs as ARC, rectangles /
  // polygons / polylines as their LINE edges, slots as two LINEs and two ARCs. Construction geometry (centerlines too)
  // is left out unless opts.construction, which puts it on layer CONSTRUCTION; points and dimensions are not written.
  // Layers as the flat pattern's: entities on a closed loop that lies inside another closed loop (holes, slots,
  // cutouts: the sketch profile's loops at depth 1 or more) go on HOLES; the outermost loops and open geometry on OUTLINE.
  // opts: { version: 'R12' (default) | 'R2000', construction }
  function exportDXFSketch(sketch, units, opts) {
    opts = opts || {};
    var d = new DXF(units, opts), R2D = 180 / Math.PI;
    var loops = [];
    try { loops = K.sketchProfile({ entities: (sketch.entities || []).filter(Boolean) }).loops; } catch (e) { loops = []; }
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
      var pl = K.entityPolylines(e)[0];
      if (!pl || pl.pts.length < 2) return false;
      var q = [(pl.pts[0][0] + pl.pts[1][0]) / 2, (pl.pts[0][1] + pl.pts[1][1]) / 2], hole = false;
      for (var i = 0; i < loops.length; i++) {
        if (!onLoop(q, loops[i].pts)) continue;
        if (loops[i].depth === 0) return false;
        hole = true;
      }
      return hole;
    }
    (sketch.entities || []).forEach(function (e) {
      if (!e || e.t === 'point') return;
      if (e.construction && !opts.construction) return;
      var layer = e.construction ? 'CONSTRUCTION' : (isHole(e) ? 'HOLES' : 'OUTLINE');
      // a sketch arc runs counterclockwise from a0 to a1 in degrees as stored (entityPrimitives sorts the two, which
      // would flip an arc across 0°)
      if (e.t === 'arc') { d.arc(layer, [e.cx, e.cy], e.r, e.a0, e.a1); return; }
      K.entityPrimitives(e).forEach(function (p) {
        if (p.kind === 'seg') d.line(layer, p.a, p.b);
        else if (p.full) d.circle(layer, p.c, p.r);
        else d.arc(layer, p.c, p.r, p.a0 * R2D, p.a1 * R2D);
      });
    });
    return d.toString();
  }

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
    else if (f.type !== 'plane') this.lastSolidId = f.id;
    return f;
  };
  // num(x): a numeric argument, or an equation ('=T*2') passed through untouched for rebuild to resolve
  function num(x) { return isExpression(x) ? x : +x; }
  Builder.prototype.name = function (n) { this.model.name = String(n); return this; };
  Builder.prototype.units = function (u) { this.model.units = u === 'in' ? 'in' : 'mm'; return this; };
  Builder.prototype.density = function (d) { this.model.density = +d; return this; };
  Builder.prototype.color = function (c) { this.model.color = String(c); return this; };
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
    if (opts.sheetBase) f.sheetBase = true;
    if (opts.draft) { f.draft = num(opts.draft); if (opts.draftOutward) f.draftOut = true; }
    if (opts.cut && opts.normalCut) f.normalCut = true; // sheet metal Normal Cut: the tool is made normal to the sheet
    bodyOpts(f, opts);
    return this;
  };
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
      miter: !!opts.miter, relief: opts.relief === 'rect' || opts.relief === 'obround' ? opts.relief : 'none' };
    if (opts.miterGap != null) f.miterGap = num(opts.miterGap);
    if (opts.reliefWidth != null) f.reliefWidth = num(opts.reliefWidth);
    if (opts.reliefDepth != null) f.reliefDepth = num(opts.reliefDepth);
    if (opts.lengthRef != null) {
      if (K.FLANGE_LENGTH_REFS.indexOf(opts.lengthRef) < 0) throw new Error('lengthRef must be one of ' + K.FLANGE_LENGTH_REFS.join(', ') + '.');
      f.lengthRef = opts.lengthRef;
    }
    customBendAllowance(f, opts.bendAllowance);
    this._add(f);
    return this;
  };
  // hem: a 180° flange folded back over the sheet; `gap` is the opening between the flats (default T/2, open hem).
  // A numeric gap is stored as the bend radius; a gap (or sheet thickness) given as an equation is kept as `gap`
  // and the radius is derived from it at rebuild.
  // opts.hemType ('open' | 'closed' | 'teardrop' | 'rolled'; absent = the legacy open hem), hemPosition ('inside':
  // Material Inside, within the flange's height | 'outside': Bend Outside, the legacy placement), hemRadius and
  // hemAngle (tear drop / rolled: the curl's inner radius, default the sheet radius, and sweep, default 270°). A closed,
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
    customBendAllowance(f, opts.bendAllowance);
    this._add(f);
    return this;
  };
  // jog: two bends offsetting the sheet by `height`, then `length` of flat parallel to the base
  Builder.prototype.jog = function (height, length, edges, opts) {
    opts = opts || {};
    this._add(customBendAllowance({ type: 'jog', height: num(height), length: num(length), angle: opts.angle == null ? 90 : num(opts.angle), reverse: !!opts.reverse, radius: opts.radius != null ? num(opts.radius) : null, position: opts.position || 'bendOutside',
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name }, opts.bendAllowance));
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
  Builder.prototype.cut = function (depth, opts) {
    opts = Object.assign({}, opts || {}, { cut: true });
    if (depth === 'through' || depth == null) { opts.throughAll = true; depth = 0; }
    return this.extrude(depth, opts);
  };
  Builder.prototype.revolve = function (angle, opts) {
    opts = opts || {};
    bodyOpts(this._add({ type: 'revolve', sketch: this._sketchId(opts), angle: angle == null ? 360 : num(angle), axis: opts.axis == null ? 'y' : opts.axis, reverse: !!opts.reverse, cut: !!opts.cut, name: opts.name }), opts);
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
    s.end().extrude(h, { cut: !!opts.cut, name: opts.name, merge: opts.merge, bodies: opts.bodies });
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
    s.end().extrude(h, { cut: !!opts.cut, name: opts.name, merge: opts.merge, bodies: opts.bodies });
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
  SketchBuilder.prototype.polygon = function (cx, cy, r, n, rot) { var s = this; return this._e({ t: 'poly', cx: s._v(cx), cy: s._v(cy), r: s._v(r), n: s._v(n) | 0 || 6, rot: s._v(rot) || 0 }); };
  SketchBuilder.prototype.slot = function (x1, y1, x2, y2, w) { var s = this; return this._e({ t: 'slot', x1: s._v(x1), y1: s._v(y1), x2: s._v(x2), y2: s._v(y2), w: s._v(w) }); };
  SketchBuilder.prototype.arc = function (cx, cy, r, a0, a1) { var s = this; return this._e({ t: 'arc', cx: s._v(cx), cy: s._v(cy), r: s._v(r), a0: s._v(a0), a1: s._v(a1) }); };
  SketchBuilder.prototype.polyline = function (pts, closed) { var s = this; return this._e({ t: 'polyline', pts: pts.map(function (p) { return [s._v(p[0]), s._v(p[1])]; }), closed: closed !== false }); };
  SketchBuilder.prototype.point = function (x, y) { var s = this; return this._e({ t: 'point', x: s._v(x), y: s._v(y) }); };
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

  SketchBuilder.prototype.sketchedBend = function (a, opts) { return this.part.sketchedBend(a, Object.assign({}, opts || {}, { sketch: this.f.id })); };

  function runScript(model, code) {
    var b = new Builder(model);
    var fn = new Function('p', 'part', 'Math', '"use strict";\n' + code);
    fn(b, b, Math);
    return b;
  }

  // Regenerate a script from a model so the two representations stay interchangeable.
  function generateScript(model) {
    var out = ['// ' + model.name + ' — generated by Anvil', 'p.name(' + JSON.stringify(model.name) + ').units(' + JSON.stringify(model.units) + ');'];
    scriptSections.forEach(function (sec) { if (sec.head) out = out.concat(sec.head(model) || []); });
    // equations first, so every "=" field below resolves against them; the array form keeps each expr string exactly
    if (Array.isArray(model.equations) && model.equations.length) out.push('p.equations(' + JSON.stringify(model.equations) + ');');
    // configurations right after, so a box/hole size given as "=..." is evaluated with the active set as the model had it
    if (Array.isArray(model.configurations) && model.configurations.length) {
      out.push('p.configurations(' + JSON.stringify(model.configurations) + ');');
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
          out.push('var ' + v + ' = p.' + (f.cut ? 'cut' : 'extrude') + '(' + nv(f.depth) + ', ' + optsStr(bodyOptsOut(o, f)) + ').last();');
          break;
        }
        default:
          if (featureTypes[f.type] && featureTypes[f.type].script) out.push(featureTypes[f.type].script(f, v, idVar, optsStr));
          break;
        case 'flange': {
          var fspecs = JSON.stringify((f.edges || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          var fo = { angle: f.angle, name: f.name };
          if (f.reverse) fo.reverse = true;
          if (f.radius != null) fo.radius = f.radius;
          if (f.position && f.position !== 'bendOutside') fo.position = f.position;
          if (f.lengthRef != null) fo.lengthRef = f.lengthRef;
          if (f.toward) fo.toward = f.toward.map(function (x) { return isExpression(x) ? x : Math.round(x * 1e4) / 1e4; });
          if (f.miter) fo.miter = true;
          if (f.miterGap != null && (isExpression(f.miterGap) || +f.miterGap !== 0)) fo.miterGap = numOut(f.miterGap);
          if (f.relief && f.relief !== 'none') fo.relief = f.relief;
          if (f.reliefWidth != null) fo.reliefWidth = numOut(f.reliefWidth);
          if (f.reliefDepth != null) fo.reliefDepth = numOut(f.reliefDepth);
          if (f.bendAllowance) fo.bendAllowance = bendAllowanceOut(f.bendAllowance);
          if (f.hem) {
            var ho = !f.hemType || f.hemType === 'open' ? { gap: f.gap != null ? numOut(f.gap) : Math.round(f.radius * 2 * 1e4) / 1e4, name: f.name } : { name: f.name };
            if (f.hemType) ho.hemType = f.hemType;
            if (f.hemPosition) ho.hemPosition = f.hemPosition;
            if (f.hemRadius != null) ho.hemRadius = numOut(f.hemRadius);
            if (f.hemAngle != null) ho.hemAngle = numOut(f.hemAngle);
            if (f.reverse) ho.reverse = true;
            if (f.bendAllowance) ho.bendAllowance = bendAllowanceOut(f.bendAllowance);
            out.push('var ' + v + ' = p.hem(' + nv(f.length) + ', ' + fspecs + ', ' + optsStr(ho) + ').last();');
          } else out.push('var ' + v + ' = p.flange(' + nv(f.length) + ', ' + fspecs + ', ' + optsStr(fo) + ').last();');
          break;
        }
        case 'jog': {
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
        case 'revolve': {
          var ro = { sketch: '@' + idVar[f.sketch], name: f.name, axis: f.axis };
          if (f.reverse) ro.reverse = true;
          out.push('var ' + v + ' = p.' + (f.cut ? 'revolveCut' : 'revolve') + '(' + nv(f.angle) + ', ' + optsStr(bodyOptsOut(ro, f)) + ').last();');
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
          out.push('var ' + v + ' = p.circularPattern(' + optsStr(bodyOptsOut({ feature: '@' + idVar[f.feature], axis: f.axis, center: f.center, count: f.n, angle: f.angle, equal: f.equal !== false, name: f.name }, f)) + ').last();');
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
        case 'chamfer':
        case 'fillet': {
          var specs = JSON.stringify((f.edges || []).map(function (e) { return { at: e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }), chain: e.chain !== false }; }));
          out.push('var ' + v + ' = p.' + f.type + '(' + nv(f.type === 'chamfer' ? f.d : f.r) + ', ' + specs + ', ' + optsStr({ name: f.name }) + ').last();');
          break;
        }
        case 'shell': {
          var fspecs2 = JSON.stringify((f.faces || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          out.push('var ' + v + ' = p.shell(' + nv(f.thickness) + ', ' + fspecs2 + ', ' + optsStr({ name: f.name }) + ').last();');
          break;
        }
      }
    });
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


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.exportSTL = exportSTL; K.exportDXFSketch = exportDXFSketch; K.exportDXFFace = exportDXFFace; K.exportDXFFlat = exportDXFFlat;
  K.Builder = Builder; K.runScript = runScript; K.generateScript = generateScript;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.fmt = fmt;
})(Kernel, Kernel._);
