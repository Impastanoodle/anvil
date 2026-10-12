// drawing-annotations.js — annotations for the drawing engine (Drawing, see drawing.js): centre marks (single, linear,
// circular) and centrelines with Auto insert, hole callouts read from the solid (circlesAlong, lineIntervals, holeInfo),
// ordinate / baseline / chamfer dimensions, dimension text with precision and tolerance (numText, dimLabel) and the
// Dimension PropertyManager's properties, model dimensions that drive the part (dimSource, driveDim), manual and
// stacked balloons with a quantity, and annotationPrims, the paper primitives of an annotation on the ANNOTATIONS
// layer. Loads after drawing-sheet.js; ARROW_W, SHOULDER and TEXT_GAP are late bound from drawing-render.js.
(function (D, _) {
  'use strict';
  var K = Kernel, V = K.vec;
  var frameOf = D.frameOf, isOrthoFrame = D.isOrthoFrame, meshEdges = D.meshEdges, meshCurves = D.meshCurves, reattachDim = D.reattachDim, findView = D.findView, fmtDim = D.fmtDim;
  var frameKey = _.frameKey, meshDiag = _.meshDiag, mergeCollinear = _.mergeCollinear, extractCircles = _.extractCircles, viewContent = _.viewContent;

  // ------------------------------------------------------------------ annotations
  // Centre marks, centrelines, hole callouts (view.annotations), ordinate / baseline / chamfer dimensions (view.dims),
  // dimension tolerances, precision and text, driving the part from a model dimension, and manual / stacked balloons
  // with a quantity (view.balloons). Every annotation stores the view geometry it was placed on (model units in the
  // view frame) and is reattached to the current projection on every render, like a Smart Dimension; one whose
  // geometry is gone is drawn dangling (olive).
  // doc.options (Tools ▸ Options ▸ Document Properties): { autoCenterMarks, autoCenterlines (Auto insert on view
  // creation), markSize (in the drawing's units, SolidWorks' Centerlines / Center Marks size: ANSI inch .1, mm 2.5;
  // markPaper gives paper mm), extLines (centre-mark extension lines, true), balloonQty (QTY on new balloons),
  // flatDims (overall width and height on every flat-pattern view; false: SolidWorks adds them only on request),
  // flatSizeNote (a FLAT SIZE W × H note under it, false), bendNotes ('notes' (default): UP 90° R .030 along each
  // bend line | 'table': tags A, B, C and a Bend Table | 'none'), dimPrec (decimal places of dimension values;
  // default 3 in inches, up to 2 in mm), fractions (inch drawings: fractional inches) and fracDenom (their finest
  // denominator, 64) }
  var MARK_SIZE = 2.5, MARK_SIZE_IN = 0.1, MARK_GAP = 1, MARK_EXT = 2.5, CL_EXT = 3;
  // (rfV) a mark size in the drawing's units -> paper mm. On an inch drawing a size of 1 or more is a paper-mm value
  // saved before rfV (markSize was paper mm everywhere; a centre mark an inch wide is never meant) and stays mm.
  function markPaper(doc, size) {
    var inch = doc && doc.units === 'in';
    if (!(+size > 0)) size = inch ? MARK_SIZE_IN : MARK_SIZE;
    return inch && +size < 1 ? +size * 25.4 : +size;
  }
  function docOptions(doc) {
    var o = doc.options || {}, st = D.dimStyle(doc), inch = doc.units === 'in';
    var ms = +o.markSize > 0 ? +o.markSize : inch ? MARK_SIZE_IN : MARK_SIZE;
    if (inch && ms >= 1) ms = Math.round(ms / 25.4 * 1e4) / 1e4;   // (a pre-rfV paper-mm value, shown in inches)
    return { autoCenterMarks: !!o.autoCenterMarks, autoCenterlines: !!o.autoCenterlines, markSize: ms,
      extLines: o.extLines !== false, balloonQty: !!o.balloonQty, flatDims: o.flatDims === true, flatSizeNote: !!o.flatSizeNote,
      bendNotes: o.bendNotes === 'table' || o.bendNotes === 'none' ? o.bendNotes : 'notes', dimPrec: st.prec, fractions: st.fractions, fracDenom: st.denom };
  }
  function nextAnnotId(doc) { doc.nextAnnot = (doc.nextAnnot || 0) + 1; return doc.nextAnnot; }

  // circlesAlong(mesh, F) -> [{ c: [u, v], r, w, body }]: every closed circular edge loop of the mesh lying in a plane
  // perpendicular to F.e, with its depth w = p·e. Edges are grouped by depth first, so the top and bottom circles of a
  // hole stay apart (a projection merges them). Cached on the mesh per frame.
  function circlesAlong(mesh, F) {
    var cache = mesh._drawingCircles || (mesh._drawingCircles = {}), key = frameKey(F);
    if (cache[key]) return cache[key];
    var diag = meshDiag(mesh), q = diag * 1e-6 + 1e-12, groups = {}, order = [], out = [], CV = meshCurves(mesh);
    // true circles of the analytic records: exact centre, radius and depth; the rest from closed chains of equal chords
    if (CV) CV.groups.forEach(function (G) {
      if (!G.full || Math.abs(Math.abs(V.dot(G.n, F.e)) - 1) > 1e-9) return;
      out.push({ c: [V.dot(G.c, F.u), V.dot(G.c, F.v)], r: G.r, w: V.dot(G.c, F.e), body: G.body, exact: true });
    });
    meshEdges(mesh).forEach(function (ed, ei) {
      if (ed.smooth || (CV && CV.pieceCurve[ei] >= 0)) return;
      var d = V.sub(ed.b, ed.a), L = V.len(d);
      if (L < 1e-12 || Math.abs(V.dot(d, F.e)) > L * 1e-6) return;
      var w = (V.dot(ed.a, F.e) + V.dot(ed.b, F.e)) / 2, kk = Math.round(w / q), g = groups[kk];
      if (!g) { g = groups[kk] = { w: w, segs: [] }; order.push(kk); }
      g.segs.push([V.dot(ed.a, F.u), V.dot(ed.a, F.v), V.dot(ed.b, F.u), V.dot(ed.b, F.v), mesh.faces[ed.faces[0]].body || 0]);
    });
    order.forEach(function (kk) {
      var g = groups[kk];
      extractCircles(mergeCollinear(g.segs, [], diag).visible, diag).circles.forEach(function (c) { out.push({ c: c.c, r: c.r, w: g.w, body: c.body || 0 }); });
    });
    cache[key] = out;
    return out;
  }
  // lineIntervals(mesh, p0, d) -> [[t0, t1]…]: where the line p0 + t d (d a unit vector) runs through material,
  // from every triangle crossing (exact Möller-Trumbore), sorted and paired
  function lineIntervals(mesh, p0, d) {
    var P = mesh.positions64 || mesh.positions, ts = [];
    for (var i = 0; i < P.length; i += 9) {
      var ax = P[i], ay = P[i + 1], az = P[i + 2];
      var e1 = [P[i + 3] - ax, P[i + 4] - ay, P[i + 5] - az], e2 = [P[i + 6] - ax, P[i + 7] - ay, P[i + 8] - az];
      var h = V.cross(d, e2), det = V.dot(e1, h);
      if (Math.abs(det) < 1e-14) continue;
      var f = 1 / det, s = [p0[0] - ax, p0[1] - ay, p0[2] - az], u = f * V.dot(s, h);
      if (u < 0 || u > 1) continue;
      var q = V.cross(s, e1), v = f * V.dot(d, q);
      if (v < 0 || u + v > 1) continue;
      ts.push(f * V.dot(e2, q));
    }
    ts.sort(function (a, b) { return a - b; });
    var out = [];
    for (var k = 0; k + 1 < ts.length; k += 2) out.push([ts[k], ts[k + 1]]);
    return out;
  }
  // holeInfo(mesh, F, c, r) -> null when the circle (c, r) of a view along F is not a hole, else
  // { c, dia, thru, depth, cbore: { dia, depth } | null, csk: { dia, angle } | null, entry: 'near' | 'far' }.
  // The smallest circle on the axis is the drill. Lines parallel to the axis just outside the drill, just outside each
  // larger circle on the axis and halfway between them are cut against the mesh: where the drill wall ends below the
  // entry face, a larger radius whose wall reaches the face is a counterbore (the halfway line ends with the drill wall)
  // or a countersink (it ends higher: a cone). The empty gap on the axis says through or blind and which side the hole
  // opens to. Depths are measured from the entry face (Hole Wizard: a blind counterbored hole's depth includes the
  // counterbore). Cached on the mesh.
  function holeInfo(mesh, F, c, r) {
    var cache = mesh._drawingHoles || (mesh._drawingHoles = {}), key = frameKey(F) + '|' + c.map(function (x) { return Math.round(x * 1e6); }).join(',') + '|' + Math.round(r * 1e6);
    if (!(key in cache)) cache[key] = holeInfo0(mesh, F, c, r);
    return cache[key];
  }
  var CSK_ANGLES = [60, 82, 90, 100, 110, 118, 120, 130];
  function holeInfo0(mesh, F, c, r) {
    var diag = meshDiag(mesh), tol = diag * 1e-6 + 1e-9;
    var stack = circlesAlong(mesh, F).filter(function (q) { return Math.hypot(q.c[0] - c[0], q.c[1] - c[1]) <= tol * 10; });
    if (!stack.some(function (q) { return Math.abs(q.r - r) <= tol * 10 + r * 1e-6; })) return null;
    var cc = stack[0].c, rmin = Math.min.apply(null, stack.map(function (q) { return q.r; }));
    // a line along e at radius rho (a hair off the u direction, so it misses facet edges)
    var memo = {};
    function lineAt(rho) {
      var kk = rho.toFixed(9);
      if (memo[kk]) return memo[kk];
      var a = 1.2345e-4, p0 = V.add(V.add(V.scale(F.u, cc[0] + rho * Math.cos(a)), V.scale(F.v, cc[1] + rho * Math.sin(a) + tol * 0.37)), V.scale(F.e, 0));
      return (memo[kk] = lineIntervals(mesh, p0, F.e));
    }
    function inAny(iv, w) { return iv.some(function (x) { return w >= x[0] && w <= x[1]; }); }
    var eps = Math.max(tol * 100, rmin * 1e-3), ax = lineAt(0), rw = lineAt(rmin * 1.001 + tol * 10);
    // a point inside the drill: next to one of the drill circles, the axis empty and the wall just outside it solid
    var wI = null;
    stack.filter(function (q) { return Math.abs(q.r - rmin) <= tol * 10 + rmin * 1e-6; }).some(function (q) {
      return [q.w - eps, q.w + eps].some(function (w) { if (!inAny(ax, w) && inAny(rw, w)) { wI = w; return true; } return false; });
    });
    if (wI == null) return null;
    var g0 = -Infinity, g1 = Infinity;
    ax.forEach(function (x) { if (x[1] <= wI && x[1] > g0) g0 = x[1]; if (x[0] >= wI && x[0] < g1) g1 = x[0]; });
    var wall = rw.filter(function (x) { return wI >= x[0] && wI <= x[1]; })[0];
    // which side the hole opens to; a through hole opens to the viewer unless only its far end is enlarged
    function top(sgn, iv) { var x = iv.filter(function (y) { return wI >= y[0] - eps * 2 && wI <= y[1] + eps * 2; })[0]; return x ? (sgn > 0 ? x[1] : -x[0]) : null; }
    function enlarged(sgn) {
      var Tr = sgn > 0 ? wall[1] : -wall[0], found = null;
      stack.map(function (q) { return q.r; }).filter(function (R, i, a) { return R > rmin + tol * 10 && a.indexOf(R) === i; }).sort(function (x, y) { return x - y; }).some(function (R) {
        var T = top(sgn, lineAt(R * 1.001 + tol * 10));
        if (T != null && T > Tr + eps) { found = { R: R, E: T, Tr: Tr }; return true; }
        return false;
      });
      return found;
    }
    var s = 1;
    if (g1 === Infinity && g0 === -Infinity) s = !enlarged(1) && enlarged(-1) ? -1 : 1;
    else if (g0 === -Infinity) s = -1;
    else if (g1 !== Infinity) return null;                  // a closed cavity, not a hole
    var thru = g0 === -Infinity && g1 === Infinity, en = enlarged(s), Tr = s > 0 ? wall[1] : -wall[0];
    var out = { c: cc.slice(), dia: 2 * rmin, thru: thru, depth: 0, cbore: null, csk: null, entry: s > 0 ? 'near' : 'far' }, entry = Tr;
    if (en) {
      var rm = (rmin + en.R) / 2, Tm = top(s, lineAt(rm));
      entry = en.E;
      if (Tm == null || Tm <= Tr + eps * 5) out.cbore = { dia: 2 * en.R, depth: en.E - Tr };
      else {
        var ang = 2 * Math.atan2(en.R - rmin, en.E - Tr) * 180 / Math.PI;
        CSK_ANGLES.forEach(function (a) { if (Math.abs(a - ang) < 1.5) ang = a; });
        out.csk = { dia: 2 * en.R, angle: ang };
      }
    }
    if (!thru) out.depth = entry - (s > 0 ? g0 : -g1);
    return out;
  }
  // holeText(info, units, count, prec) -> callout lines: '4X Ø6.6 THRU' (info.thruAll: 'THRU ALL', rfV), '⌴ Ø11 ↧ 6.8' / '⌵ Ø12 X 90°'
  function holeText(h, units, count, prec) {
    function n(x) { return numText(x, units, prec); }
    var lines = [(count > 1 ? count + 'X ' : '') + 'Ø' + n(h.dia) + (h.thru ? (h.thruAll ? ' THRU ALL' : ' THRU') : ' ↧ ' + n(h.depth))];
    if (h.cbore) lines.push('⌴ Ø' + n(h.cbore.dia) + ' ↧ ' + n(h.cbore.depth));
    if (h.csk) lines.push('⌵ Ø' + n(h.csk.dia) + ' X ' + fmtAngle(h.csk.angle) + '°');
    return lines;
  }
  function fmtAngle(a) { return String(Math.round(a * 100) / 100); }
  // cylAxes(mesh, F) -> [{ a, b, r }]: the axes of the cylinders (holes and bosses) lying in the view plane, as view
  // segments; coaxial cylinders and holes that project onto the same line are joined into one
  function cylAxes(mesh, F) {
    var cache = mesh._drawingAxes || (mesh._drawingAxes = {}), key = frameKey(F);
    if (cache[key]) return cache[key];
    var diag = meshDiag(mesh), tol = diag * 1e-6 + 1e-9, segs = [];
    [frameOf({ e: F.u, u: F.v, v: F.e }), frameOf({ e: F.v, u: F.e, v: F.u })].forEach(function (G) {
      var groups = [];
      circlesAlong(mesh, G).forEach(function (q) {
        var g = groups.filter(function (x) { return Math.hypot(x.c[0] - q.c[0], x.c[1] - q.c[1]) <= tol * 10 && Math.abs(x.r - q.r) <= tol * 10; })[0];
        if (!g) groups.push(g = { c: q.c, r: q.r, ws: [] });
        g.ws.push(q.w);
      });
      groups.forEach(function (g) {
        if (g.ws.length < 2) return;
        var w0 = Math.min.apply(null, g.ws), w1 = Math.max.apply(null, g.ws);
        if (w1 - w0 <= tol) return;
        function pt(w) { var p = V.add(V.add(V.scale(G.u, g.c[0]), V.scale(G.v, g.c[1])), V.scale(G.e, w)); return [V.dot(p, F.u), V.dot(p, F.v)]; }
        segs.push({ a: pt(w0), b: pt(w1), r: g.r });
      });
    });
    // join collinear overlapping axes
    var out = [];
    segs.forEach(function (s) {
      var t = [s.b[0] - s.a[0], s.b[1] - s.a[1]], L = Math.hypot(t[0], t[1]); t = [t[0] / L, t[1] / L];
      var hit = out.filter(function (o) {
        var off = Math.abs(t[0] * (o.a[1] - s.a[1]) - t[1] * (o.a[0] - s.a[0])), ot = [o.b[0] - o.a[0], o.b[1] - o.a[1]], oL = Math.hypot(ot[0], ot[1]);
        if (off > tol * 10 || Math.abs(t[0] * ot[1] - t[1] * ot[0]) > oL * 1e-6) return false;
        var p0 = (o.a[0] - s.a[0]) * t[0] + (o.a[1] - s.a[1]) * t[1], p1 = (o.b[0] - s.a[0]) * t[0] + (o.b[1] - s.a[1]) * t[1];
        return Math.max(p0, p1) >= -tol && Math.min(p0, p1) <= L + tol;
      })[0];
      if (!hit) { out.push({ a: s.a.slice(), b: s.b.slice(), r: s.r }); return; }
      var ps = [[0, s.a], [L, s.b], [(hit.a[0] - s.a[0]) * t[0] + (hit.a[1] - s.a[1]) * t[1], hit.a], [(hit.b[0] - s.a[0]) * t[0] + (hit.b[1] - s.a[1]) * t[1], hit.b]];
      ps.sort(function (x, y) { return x[0] - y[0]; });
      hit.a = ps[0][1].slice(); hit.b = ps[3][1].slice(); hit.r = Math.max(hit.r, s.r);
    });
    // canonical direction: left to right, else bottom to top
    out.forEach(function (o) { if (o.b[0] < o.a[0] - tol || (Math.abs(o.b[0] - o.a[0]) <= tol && o.b[1] < o.a[1])) { var x = o.a; o.a = o.b; o.b = x; } });
    cache[key] = out;
    return out;
  }
  // fitCircle(points) -> { c, r }: least-squares circle (Kåsa) through three or more points
  function fitCircle(pts) {
    var n = pts.length, mx = 0, my = 0;
    pts.forEach(function (p) { mx += p[0] / n; my += p[1] / n; });
    var Suu = 0, Svv = 0, Suv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
    pts.forEach(function (p) {
      var u = p[0] - mx, v = p[1] - my;
      Suu += u * u; Svv += v * v; Suv += u * v; Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u;
    });
    var det = Suu * Svv - Suv * Suv;
    if (Math.abs(det) < 1e-18) return null;
    var b1 = (Suuu + Suvv) / 2, b2 = (Svvv + Svuu) / 2;
    var uc = (b1 * Svv - b2 * Suv) / det, vc = (Suu * b2 - Suv * b1) / det;
    var c = [mx + uc, my + vc], r = 0;
    pts.forEach(function (p) { r += Math.hypot(p[0] - c[0], p[1] - c[1]) / n; });
    return { c: c, r: r };
  }
  // viewContents(doc, mesh) -> contentOf(view): what compute() sees of each view (frame, projection, section)
  function viewContents(doc, mesh) {
    var memo = {};
    function of(v, depth) {
      if (memo[v.id]) return memo[v.id];
      var par = v.parent != null ? findView(doc, v.parent) : null;
      return (memo[v.id] = viewContent(doc, v, mesh, par && (depth || 0) < 20 ? function (pv) { return of(pv, (depth || 0) + 1); } : null));
    }
    return of;
  }
  // addCenterMark(doc, viewId, { style: 'single' | 'linear' | 'circular', holes: [{ c, r }], center, ext, size, radial })
  // Single: one mark per hole given. Linear: marks on every hole plus connection lines through the centres in order.
  // Circular: marks plus the pitch circle (centre fitted through the hole centres, or `center`), radial lines and a
  // mark at the pattern centre. Returns the annotation.
  function addCenterMark(doc, viewId, spec) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    spec = spec || {};
    var style = spec.style === 'linear' || spec.style === 'circular' ? spec.style : 'single';
    var holes = (spec.holes || []).map(function (h) { return { c: [+h.c[0], +h.c[1]], r: +h.r || 0 }; });
    if (!holes.length) throw new Error('A centre mark needs a circle');
    if (style === 'linear' && holes.length < 2) throw new Error('A linear centre mark needs two or more holes');
    if (style === 'circular' && holes.length < 3 && !spec.center) throw new Error('A circular centre mark needs three or more holes (or a centre)');
    var an = { id: nextAnnotId(doc), type: 'centerMark', style: style, holes: style === 'single' ? holes.slice(0, 1) : holes };
    if (spec.ext != null) an.ext = !!spec.ext;
    if (+spec.size > 0) an.size = +spec.size;
    if (style === 'circular') { if (spec.center) an.center = [+spec.center[0], +spec.center[1]]; an.radial = spec.radial !== false; }
    if (spec.auto) an.auto = true;
    (v.annotations || (v.annotations = [])).push(an);
    return an;
  }
  // autoCenterMarks(doc, mesh, viewId) -> number added: a single centre mark on every centre of a full visible circle
  // (concentric circles share one, sized to the largest) that has none yet. Orthographic views only.
  function autoCenterMarks(doc, mesh, viewId, of) {
    var v = findView(doc, viewId);
    if (!v) return 0;
    of = of || viewContents(doc, mesh);
    var ct = of(v);
    if (!isOrthoFrame(ct.frame) && !ct.flat) return 0;
    var diag = meshDiag(mesh), tol = diag * 1e-6 + 1e-9, have = [], n = 0;
    (v.annotations || []).forEach(function (a) { if (a.type === 'centerMark') a.holes.forEach(function (h) { have.push(h.c); }); });
    var centres = [];
    ct.proj.circles.visible.forEach(function (c) {
      if (c.sil) return;
      var g = centres.filter(function (x) { return Math.hypot(x.c[0] - c.c[0], x.c[1] - c.c[1]) <= tol * 10; })[0];
      if (g) { g.r = Math.max(g.r, c.r); return; }
      centres.push({ c: c.c.slice(), r: c.r });
    });
    centres.forEach(function (h) {
      if (have.some(function (p) { return Math.hypot(p[0] - h.c[0], p[1] - h.c[1]) <= tol * 10; })) return;
      addCenterMark(doc, v.id, { style: 'single', holes: [h], auto: true }); n++;
    });
    // slot ends and rounded ends (model arcs of half a turn or more, SolidWorks's "Center marks - slots"): a slot's two
    // ends (equal radii, facing apart) get one linear centre mark joining them, a lone rounded end a single mark
    // (r5/drawings5)
    var ends = [];
    (ct.proj.arcs ? ct.proj.arcs.visible : []).forEach(function (a) {
      if (a.src !== 'arc' || a.a1 - a.a0 < 180 - 0.01 || a.a1 - a.a0 > 359) return;
      if (centres.some(function (x) { return Math.hypot(x.c[0] - a.c[0], x.c[1] - a.c[1]) <= tol * 10; })) return;
      if (ends.some(function (x) { return Math.hypot(x.c[0] - a.c[0], x.c[1] - a.c[1]) <= tol * 10 && Math.abs(x.r - a.r) <= tol * 10; })) return;
      var mid = (a.a0 + a.a1) / 2 * Math.PI / 180;
      ends.push({ c: a.c.slice(), r: a.r, dir: [Math.cos(mid), Math.sin(mid)] });
    });
    var used = ends.map(function () { return false; });
    ends.forEach(function (h, i) {
      if (used[i] || have.some(function (p) { return Math.hypot(p[0] - h.c[0], p[1] - h.c[1]) <= tol * 10; })) return;
      used[i] = true;
      // the other end of a slot: same radius, on the side it faces away from, facing the other way
      var mate = -1;
      ends.forEach(function (o, j) {
        if (used[j] || mate >= 0 || Math.abs(o.r - h.r) > tol * 10) return;
        var dx = o.c[0] - h.c[0], dy = o.c[1] - h.c[1], L = Math.hypot(dx, dy);
        if (L < tol * 10 || (dx * h.dir[0] + dy * h.dir[1]) / L > -1 + 1e-6 || (dx * o.dir[0] + dy * o.dir[1]) / L < 1 - 1e-6) return;
        mate = j;
      });
      if (mate >= 0) { used[mate] = true; addCenterMark(doc, v.id, { style: 'linear', holes: [{ c: h.c, r: h.r }, { c: ends[mate].c, r: ends[mate].r }], auto: true }); }
      else addCenterMark(doc, v.id, { style: 'single', holes: [{ c: h.c, r: h.r }], auto: true });
      n++;
    });
    return n;
  }
  // addCenterline(doc, viewId, { a, b }) -> the annotation: a centreline on the axis a–b (view model units), drawn
  // 3 mm past both ends
  function addCenterline(doc, viewId, spec) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    if (!spec || !spec.a || !spec.b || Math.hypot(spec.b[0] - spec.a[0], spec.b[1] - spec.a[1]) < 1e-12) throw new Error('A centreline needs two different end points');
    var an = { id: nextAnnotId(doc), type: 'centerline', a: [+spec.a[0], +spec.a[1]], b: [+spec.b[0], +spec.b[1]] };
    if (spec.r != null) an.r = +spec.r;
    if (spec.auto) an.auto = true;
    (v.annotations || (v.annotations = [])).push(an);
    return an;
  }
  function autoCenterlines(doc, mesh, viewId, of) {
    var v = findView(doc, viewId);
    if (!v || v.kind === 'detail') return 0;
    of = of || viewContents(doc, mesh);
    var ct = of(v);
    if (!isOrthoFrame(ct.frame) || ct.flat) return 0;   // (a flat pattern has no cylinders seen from the side)
    var m = ct.section ? ct.section.mesh : mesh, n = 0, have = (v.annotations || []).filter(function (a) { return a.type === 'centerline'; });
    if (!m.faces.length) return 0;
    cylAxes(m, ct.frame).forEach(function (ax) {
      if (have.some(function (h) { return Math.hypot(h.a[0] - ax.a[0], h.a[1] - ax.a[1]) + Math.hypot(h.b[0] - ax.b[0], h.b[1] - ax.b[1]) < 1e-6; })) return;
      addCenterline(doc, v.id, { a: ax.a, b: ax.b, r: ax.r, auto: true }); n++;
    });
    return n;
  }
  // autoInsert(doc, mesh, viewIds?) -> number of annotations added: Document Properties ▸ Auto insert on view creation
  // (centre marks on holes, centrelines on cylinders seen from the side) for the given views (default all)
  function autoInsert(doc, mesh, ids) {
    var o = docOptions(doc), n = 0;
    if (!o.autoCenterMarks && !o.autoCenterlines) return 0;
    var of = viewContents(doc, mesh);
    doc.views.forEach(function (v) {
      if (ids && ids.indexOf(v.id) < 0) return;
      if (o.autoCenterMarks) n += autoCenterMarks(doc, mesh, v.id, of);
      if (o.autoCenterlines) n += autoCenterlines(doc, mesh, v.id, of);
    });
    return n;
  }
  // addHoleCallout(doc, viewId, { c, r, lead }) -> the annotation (the text is worked out from the hole at every render)
  function addHoleCallout(doc, viewId, spec) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    if (!spec || !spec.c || !(spec.r > 0)) throw new Error('A hole callout needs a circle');
    var an = { id: nextAnnotId(doc), type: 'holeCallout', c: [+spec.c[0], +spec.c[1]], r: +spec.r };
    if (spec.lead) an.lead = [+spec.lead[0], +spec.lead[1]];
    if (spec.text) an.text = String(spec.text);
    (v.annotations || (v.annotations = [])).push(an);
    return an;
  }
  function findAnnotation(doc, id) {
    for (var i = 0; i < doc.views.length; i++) { var l = doc.views[i].annotations || []; for (var j = 0; j < l.length; j++) if (l[j].id === id) return { view: doc.views[i], annotation: l[j], index: j }; }
    return null;
  }
  function deleteAnnotation(doc, id) {
    var f = findAnnotation(doc, id);
    if (!f) return false;
    f.view.annotations.splice(f.index, 1);
    return true;
  }
  // dimension references for ordinate / baseline / chamfer dimensions: a circle { kind: 'dia', c, r } (its centre) or
  // an edge { kind: 'h' | 'v' | 'aligned', a, b }; refFrom({ c, r } | { a, b }) builds one
  function refFrom(x) {
    if (x.c) return { kind: 'dia', c: [+x.c[0], +x.c[1]], r: +x.r || 0, value: 2 * (+x.r || 0) };
    var a = [+x.a[0], +x.a[1]], b = [+x.b[0], +x.b[1]], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    return { kind: Math.abs(dy) <= L * 1e-9 ? 'h' : Math.abs(dx) <= L * 1e-9 ? 'v' : 'aligned', a: a, b: b, value: L };
  }
  function refPos(ref, axis) { return ref.kind === 'dia' ? ref.c[axis] : (ref.a[axis] + ref.b[axis]) / 2; }
  // addOrdinate / addBaseline(doc, viewId, { dir: 'h' | 'v', base, refs: [...], side, at }): ordinate dimensions
  // (the base reads 0, every reference its distance from it along dir, texts on one line) or baseline dimensions (a
  // stack of linear dimensions from the base to each reference). dir 'h' measures along the view's u (sheet x).
  function addChainDim(kind, doc, viewId, spec) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    if (!spec || !spec.base || !(spec.refs || []).length) throw new Error((kind === 'ordinate' ? 'Ordinate' : 'Baseline') + ' dimensions need a base and at least one more reference');
    var d = { kind: kind, dir: spec.dir === 'v' ? 'v' : 'h', base: refFrom(spec.base), refs: spec.refs.map(refFrom) };
    if (spec.side) d.side = spec.side < 0 ? -1 : 1;
    if (spec.at != null) d.at = +spec.at;
    (v.dims || (v.dims = [])).push(d);
    return d;
  }
  function addOrdinate(doc, viewId, spec) { return addChainDim('ordinate', doc, viewId, spec); }
  function addBaseline(doc, viewId, spec) { return addChainDim('baseline', doc, viewId, spec); }
  // addChamferDim(doc, viewId, { a, b (the chamfer edge), ref: { a, b } (the lead-in edge), lead }): "1 X 45°"
  function addChamferDim(doc, viewId, spec) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    if (!spec || !spec.a || !spec.b || !spec.ref) throw new Error('A chamfer dimension needs the chamfer edge and a lead-in edge');
    var d = { kind: 'chamfer', a: [+spec.a[0], +spec.a[1]], b: [+spec.b[0], +spec.b[1]], ref: refFrom(spec.ref) };
    chamferValue(d);
    if (!(d.angle > 1e-6 && d.angle < 90 - 1e-6)) throw new Error('The chamfer edge must be at an angle to the lead-in edge');
    if (spec.lead) d.lead = [+spec.lead[0], +spec.lead[1]];
    (v.dims || (v.dims = [])).push(d);
    return d;
  }
  // chamfer value: the setback along the lead-in edge (chamfer length × cos θ) and θ, the acute angle between them
  function chamferValue(d) {
    var t = [d.b[0] - d.a[0], d.b[1] - d.a[1]], L = Math.hypot(t[0], t[1]), r = [d.ref.b[0] - d.ref.a[0], d.ref.b[1] - d.ref.a[1]], Lr = Math.hypot(r[0], r[1]);
    if (L < 1e-12 || Lr < 1e-12) { d.value = 0; d.angle = 0; return d; }
    var cs = Math.min(1, Math.abs(t[0] * r[0] + t[1] * r[1]) / (L * Lr));
    d.angle = Math.acos(cs) * 180 / Math.PI;
    d.value = L * cs;
    return d;
  }
  // reattachUserDim(d, pr): reattachDim for every kind, including the references of ordinate / baseline / chamfer
  function reattachUserDim(d, pr) {
    if (d.kind === 'ordinate' || d.kind === 'baseline') {
      var ok = [d.base].concat(d.refs).map(function (r) { return reattachDim(r, pr); }).every(Boolean);
      if (ok) delete d.dangling; else d.dangling = true;
      var ax = d.dir === 'v' ? 1 : 0, b0 = refPos(d.base, ax);
      d.values = d.refs.map(function (r) { return refPos(r, ax) - b0; });
      return ok;
    }
    if (d.kind === 'chamfer') {
      var edge = { kind: 'aligned', a: d.a, b: d.b }, ok2 = reattachDim(edge, pr) && reattachDim(d.ref, pr);
      d.a = edge.a; d.b = edge.b;
      if (ok2) delete d.dangling; else d.dangling = true;
      chamferValue(d);
      return ok2;
    }
    if (d.refs && d.refs.length === 2) {
      // (rfS) a Smart Dimension between two picks: reattach each, then measure again
      var okR = d.refs.map(function (r) { return reattachRef(r, pr); }).every(Boolean);
      if (okR) { delete d.dangling; measurePair(d); } else d.dangling = true;
      return okR;
    }
    return reattachDim(d, pr);
  }
  // (rfS) one reference of a two-pick dimension: a circle / arc (by centre and radius), an edge, or a point (a vertex:
  // the nearest end of a visible edge or circle centre within a thousandth of the view size, else it is gone)
  function reattachRef(r, pr) {
    if (r.kind === 'pt') {
      var b = pr.bounds, tol = Math.max(1e-9, Math.hypot(b.umax - b.umin, b.vmax - b.vmin)) * 1e-3, best = null, bd = tol;
      (pr.all || []).forEach(function (m) { [[m[0], m[1]], [m[2], m[3]]].forEach(function (q) { var dd = Math.hypot(q[0] - r.p[0], q[1] - r.p[1]); if (dd <= bd) { bd = dd; best = q; } }); });
      (pr.circlesAll || []).concat(pr.arcsAll || []).forEach(function (c) { var dd = Math.hypot(c.c[0] - r.p[0], c.c[1] - r.p[1]); if (dd <= bd) { bd = dd; best = c.c.slice(); } });
      if (!best) return false;
      r.p = best.slice();
      return true;
    }
    if (r.kind === 'arc') { var ra = { kind: 'rad', c: r.c, r: r.r, a0: r.a0, a1: r.a1 }, ok = reattachDim(ra, pr); if (ok) { r.c = ra.c; r.r = ra.r; } return ok; }
    if (r.kind === 'dia') { var rc = { kind: 'dia', c: r.c, r: r.r }, ok2 = reattachDim(rc, pr); if (ok2) { r.c = rc.c; r.r = rc.r; } return ok2; }
    var re = { kind: r.kind, a: r.a, b: r.b, value: r.value }, ok3 = reattachDim(re, pr);
    if (ok3) { r.a = re.a; r.b = re.b; r.value = re.value; }
    return ok3;
  }

  // ------------------------------------------------------------------ rfS: Smart Dimension from picks
  // SolidWorks' drawing Smart Dimension: the first pick, an optional second pick, then a placement click; the kind
  // follows the picks and where the pointer is. A pick (view model units, the view's 2D frame):
  //   { edge: [a, b] } | { circle: { c, r } } | { arc: { c, r, a0, a1 } } | { point: [x, y] } (a vertex / end point)
  //   | { center: { c, r } } (a circle's or an arc's centre)
  // smartDim(p1, p2 | null, at (the placement point, view model units), { scale (paper per model unit), minmax:
  // 'min' | 'max' (Shift: circle to circle / edge, nearest or farthest sides), aligned (rfZ, a True view: a length
  // runs along what it measures, never horizontal / vertical by the pointer) }) -> a view dimension (h, v, aligned,
  // dia, rad, angle), or null when the picks make none. One pick: an edge's length (horizontal / vertical / aligned by
  // where the pointer is, an oblique edge), a circle's Ø, an arc's R. Two picks: point / centre / circle to point
  // (point to point, centre to centre: horizontal / vertical / aligned by the pointer), to an edge (the perpendicular
  // distance), two parallel edges (their distance), two edges at an angle (the angle in the pointer's quadrant).
  // A two-pick dimension keeps its references (d.refs: { kind: 'pt', p } | { kind: 'dia' | 'arc', c, r } | an edge
  // { kind: 'h' | 'v' | 'aligned', a, b }) and is measured again from them when the part changes (measurePair).
  function pickRef(pk) {
    if (pk.edge) return refFrom({ a: pk.edge[0], b: pk.edge[1] });
    if (pk.circle) return { kind: 'dia', c: [+pk.circle.c[0], +pk.circle.c[1]], r: +pk.circle.r };
    if (pk.arc) return { kind: 'arc', c: [+pk.arc.c[0], +pk.arc.c[1]], r: +pk.arc.r, a0: pk.arc.a0, a1: pk.arc.a1 };
    if (pk.center) return { kind: 'pt', p: [+pk.center.c[0], +pk.center.c[1]], center: true };
    if (pk.point) return { kind: 'pt', p: [+pk.point[0], +pk.point[1]] };
    return null;
  }
  function isEdgeRef(r) { return r.kind === 'h' || r.kind === 'v' || r.kind === 'aligned'; }
  function refPt(r) { return r.kind === 'pt' ? r.p : r.c; }
  // the kind of a linear dimension between points a and b with the pointer at `at`: horizontal when it is above or
  // below them, vertical when it is beside them, aligned otherwise (a horizontal / vertical pair is always h / v)
  function linKind(a, b, at) {
    var dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), L = Math.hypot(dx, dy), tol = Math.max(1e-12, L * 1e-9);
    if (dy <= tol) return 'h';
    if (dx <= tol) return 'v';
    if (!at) return 'aligned';
    var inX = at[0] > Math.min(a[0], b[0]) && at[0] < Math.max(a[0], b[0]), inY = at[1] > Math.min(a[1], b[1]) && at[1] < Math.max(a[1], b[1]);
    if (inX && !inY) return 'h';
    if (inY && !inX) return 'v';
    return 'aligned';
  }
  function unit(v) { var L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; }
  // measurePair(d): d.a, d.b, d.value (an angle's c, u, value too) from d.refs, d.kind and d.minmax
  function measurePair(d) {
    var r1 = d.refs[0], r2 = d.refs[1];
    if (d.kind === 'angle') {
      var t1 = unit([r1.b[0] - r1.a[0], r1.b[1] - r1.a[1]]), t2 = unit([r2.b[0] - r2.a[0], r2.b[1] - r2.a[1]]), cr = t1[0] * t2[1] - t1[1] * t2[0];
      if (Math.abs(cr) < 1e-9) { d.dangling = true; return d; }
      var w = [r2.a[0] - r1.a[0], r2.a[1] - r1.a[1]], s = (w[0] * t2[1] - w[1] * t2[0]) / cr;
      d.c = [r1.a[0] + t1[0] * s, r1.a[1] + t1[1] * s];
      var s1 = d.s ? d.s[0] : 1, s2 = d.s ? d.s[1] : 1, u1 = [t1[0] * s1, t1[1] * s1], u2 = [t2[0] * s2, t2[1] * s2];
      d.u = [u1, u2];
      d.value = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]))) * 180 / Math.PI;
      d.a = d.c.slice(); d.b = [d.c[0] + u1[0], d.c[1] + u1[1]];
      return d;
    }
    var e1 = isEdgeRef(r1), e2 = isEdgeRef(r2);
    if (e1 && e2) {
      // two parallel edges: from the first edge's end nearest the second's middle, square to the second
      var t = unit([r2.b[0] - r2.a[0], r2.b[1] - r2.a[1]]), m2 = [(r2.a[0] + r2.b[0]) / 2, (r2.a[1] + r2.b[1]) / 2];
      var pa = Math.hypot(r1.a[0] - m2[0], r1.a[1] - m2[1]) <= Math.hypot(r1.b[0] - m2[0], r1.b[1] - m2[1]) ? r1.a : r1.b;
      return pointToEdge(d, pa.slice(), r2, t);
    }
    if (e1 || e2) {
      var er = e1 ? r1 : r2, pr0 = e1 ? r2 : r1, p = refPt(pr0).slice(), te = unit([er.b[0] - er.a[0], er.b[1] - er.a[1]]);
      // Shift (min / max): a circle's nearest / farthest side from the edge
      if (pr0.r && d.minmax) {
        var nrm = [-te[1], te[0]], sd = (p[0] - er.a[0]) * nrm[0] + (p[1] - er.a[1]) * nrm[1], sg = (sd >= 0 ? 1 : -1) * (d.minmax === 'min' ? -1 : 1);
        p = [p[0] + nrm[0] * pr0.r * sg, p[1] + nrm[1] * pr0.r * sg];
      }
      return pointToEdge(d, p, er, te, e1);
    }
    var A = refPt(r1).slice(), B = refPt(r2).slice();
    if (d.minmax && (r1.r || r2.r)) {
      // circle to circle (or to a point), Shift: the nearest / farthest sides along what the dimension measures
      var dir = d.kind === 'h' ? [B[0] >= A[0] ? 1 : -1, 0] : d.kind === 'v' ? [0, B[1] >= A[1] ? 1 : -1] : unit([B[0] - A[0], B[1] - A[1]]), sgn = d.minmax === 'min' ? 1 : -1;
      if (r1.r) A = [A[0] + dir[0] * r1.r * sgn, A[1] + dir[1] * r1.r * sgn];
      if (r2.r) B = [B[0] - dir[0] * r2.r * sgn, B[1] - dir[1] * r2.r * sgn];
    }
    d.a = A; d.b = B;
    d.value = d.kind === 'h' ? Math.abs(B[0] - A[0]) : d.kind === 'v' ? Math.abs(B[1] - A[1]) : Math.hypot(B[0] - A[0], B[1] - A[1]);
    return d;
  }
  // a point to an edge's line: a horizontal edge -> a vertical dimension to the edge's nearer end, a vertical edge -> a
  // horizontal one, an oblique edge -> aligned, square to it (to the foot on its line). edgeFirst: the edge is d.a.
  function pointToEdge(d, p, er, te, edgeFirst) {
    var q;
    if (d.kind === 'h' || d.kind === 'v') q = Math.hypot(er.a[0] - p[0], er.a[1] - p[1]) <= Math.hypot(er.b[0] - p[0], er.b[1] - p[1]) ? er.a.slice() : er.b.slice();
    else { var s = (p[0] - er.a[0]) * te[0] + (p[1] - er.a[1]) * te[1]; q = [er.a[0] + te[0] * s, er.a[1] + te[1] * s]; }
    d.a = edgeFirst ? q : p.slice(); d.b = edgeFirst ? p.slice() : q;
    d.value = d.kind === 'h' ? Math.abs(q[0] - p[0]) : d.kind === 'v' ? Math.abs(q[1] - p[1]) : Math.hypot(q[0] - p[0], q[1] - p[1]);
    return d;
  }
  function smartDim(p1, p2, at, opts) {
    opts = opts || {};
    var sc = +opts.scale > 0 ? +opts.scale : 1, r1 = p1 && pickRef(p1), r2 = p2 && pickRef(p2), d;
    if (!r1) return null;
    if (!r2) {
      if (r1.kind === 'dia' || r1.kind === 'arc') {
        d = r1.kind === 'dia' ? { kind: 'dia', c: r1.c.slice(), r: r1.r, count: 1, value: 2 * r1.r } : { kind: 'rad', c: r1.c.slice(), r: r1.r, a0: r1.a0, a1: r1.a1, count: 1, value: r1.r };
        if (at && Math.hypot(at[0] - r1.c[0], at[1] - r1.c[1]) > r1.r * 1.05) d.lead = [(at[0] - r1.c[0]) * sc, (at[1] - r1.c[1]) * sc];
        return d;
      }
      if (!isEdgeRef(r1)) return null;   // a point alone measures nothing
      var a = r1.a.slice(), b = r1.b.slice(), k1 = linKind(a, b, opts.aligned ? null : at);   // (rfZ) a True view: along the edge
      d = { kind: k1, a: a, b: b, value: k1 === 'h' ? Math.abs(b[0] - a[0]) : k1 === 'v' ? Math.abs(b[1] - a[1]) : Math.hypot(b[0] - a[0], b[1] - a[1]) };
      return placeLinear(d, at, sc);
    }
    var e1 = isEdgeRef(r1), e2 = isEdgeRef(r2);
    d = { refs: [r1, r2] };
    if (opts.minmax === 'min' || opts.minmax === 'max') d.minmax = opts.minmax;
    if (e1 && e2) {
      var t1 = unit([r1.b[0] - r1.a[0], r1.b[1] - r1.a[1]]), t2 = unit([r2.b[0] - r2.a[0], r2.b[1] - r2.a[1]]), cr = t1[0] * t2[1] - t1[1] * t2[0];
      delete d.minmax;
      if (Math.abs(cr) > 1e-6) {
        // an angle: the quadrant the pointer is in picks the sides of the two lines
        d.kind = 'angle';
        measurePair(d);
        if (at) {
          var w = [at[0] - d.c[0], at[1] - d.c[1]], al = (w[0] * t2[1] - w[1] * t2[0]) / cr, be = (t1[0] * w[1] - t1[1] * w[0]) / cr;
          d.s = [al < 0 ? -1 : 1, be < 0 ? -1 : 1];
          d.rad = Math.hypot(w[0], w[1]);
          measurePair(d);
        }
        if (!(d.rad > 0)) d.rad = Math.hypot(r1.b[0] - r1.a[0], r1.b[1] - r1.a[1]) / 2;
        return d;
      }
      d.kind = Math.abs(t2[1]) < 1e-9 ? 'v' : Math.abs(t2[0]) < 1e-9 ? 'h' : 'aligned';
    } else if (e1 || e2) {
      var er = e1 ? r1 : r2, te = unit([er.b[0] - er.a[0], er.b[1] - er.a[1]]);
      d.kind = Math.abs(te[1]) < 1e-9 ? 'v' : Math.abs(te[0]) < 1e-9 ? 'h' : 'aligned';
    } else {
      if (Math.hypot(refPt(r1)[0] - refPt(r2)[0], refPt(r1)[1] - refPt(r2)[1]) < 1e-12) return null;
      d.kind = linKind(refPt(r1), refPt(r2), opts.aligned ? null : at);
    }
    measurePair(d);
    if (!(d.value > 1e-12)) return null;
    return placeLinear(d, at, sc);
  }
  // where a linear dimension's line goes: through the pointer (h: d.at is its v, v: its u; aligned: d.off, paper)
  function placeLinear(d, at, sc) {
    if (!at) return d;
    if (d.kind === 'h') { d.at = at[1]; d.side = at[1] >= (d.a[1] + d.b[1]) / 2 ? 1 : -1; }
    else if (d.kind === 'v') { d.at = at[0]; d.side = at[0] >= (d.a[0] + d.b[0]) / 2 ? 1 : -1; }
    else if (d.kind === 'aligned') {
      var t = unit([d.b[0] - d.a[0], d.b[1] - d.a[1]]), n = [-t[1], t[0]], o = ((at[0] - d.a[0]) * n[0] + (at[1] - d.a[1]) * n[1]) * sc;
      if (Math.abs(o) > 1e-9) d.off = o;
    }
    return d;
  }
  // addSmartDim(doc, viewId, p1, p2, at, opts) -> the dimension added to the view (null: the picks make none)
  function addSmartDim(doc, viewId, p1, p2, at, opts) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    var d = smartDim(p1, p2, at, opts);
    if (!d) return null;
    (v.dims || (v.dims = [])).push(d);
    return d;
  }
  // an angle dimension's paper primitives (drawing-render.js draws none for it): the arc through the pointer's place
  // between the two lines, arrows at its ends, extension lines where the edges stop short of it, the text outside the
  // arc's middle. Fills d.box, d.tbox, d.arrows as the renderer does for the others, and d.dxf (a 3-point angular
  // DIMENSION). G: the sheet's dimension style in sheet units (sheet.dimStyle.paper: ANSI inch .125 text, .125 × .042
  // arrows, .0625 gap, .125 beyond; rfV), else the ISO millimetre sizes.
  function anglePrims(d, w, k, G) {
    G = G || { text: 3.5 * k, arrow: 3 * k, arrowW: 1 * k, gap: 1.5 * k, ext: 2 * k };
    var out = [], L = 'DIMENSIONS', th = G.text, ar = G.arrow, aw = G.arrowW / 2, gapE = G.gap, ext = G.ext;
    var V0 = w.toSheet(d.c), R = Math.max(6 * k, (d.rad || 0) * w.scale);
    function dirOf(u) { var q = w.toSheet([d.c[0] + u[0], d.c[1] + u[1]]); return unit([q[0] - V0[0], q[1] - V0[1]]); }
    var q1 = dirOf(d.u[0]), q2 = dirOf(d.u[1]), th1 = Math.atan2(q1[1], q1[0]), th2 = Math.atan2(q2[1], q2[0]);
    var sw = th2 - th1; while (sw < 0) sw += 2 * Math.PI; while (sw >= 2 * Math.PI) sw -= 2 * Math.PI;
    var a0 = th1;
    if (sw > Math.PI) { a0 = th2; sw = 2 * Math.PI - sw; }
    out.push({ k: 'arc', c: V0, r: R, a0: a0 * 180 / Math.PI, a1: (a0 + sw) * 180 / Math.PI, layer: L, style: 'thin' });
    function arrow(tip, dir) {
      var n = [-dir[1], dir[0]];
      out.push({ k: 'fill', pts: [tip, [tip[0] - dir[0] * ar + n[0] * aw, tip[1] - dir[1] * ar + n[1] * aw], [tip[0] - dir[0] * ar - n[0] * aw, tip[1] - dir[1] * ar - n[1] * aw]], layer: L });
    }
    var tA = [V0[0] + R * Math.cos(a0), V0[1] + R * Math.sin(a0)], tB = [V0[0] + R * Math.cos(a0 + sw), V0[1] + R * Math.sin(a0 + sw)];
    arrow(tA, [Math.sin(a0), -Math.cos(a0)]); arrow(tB, [-Math.sin(a0 + sw), Math.cos(a0 + sw)]);
    // extension lines: along each line from where its edge ends to just past the arc
    d.refs.forEach(function (r, i) {
      var q = i === 0 ? q1 : q2, A = w.toSheet(r.a), B = w.toSheet(r.b);
      var ta = (A[0] - V0[0]) * q[0] + (A[1] - V0[1]) * q[1], tb = (B[0] - V0[0]) * q[0] + (B[1] - V0[1]) * q[1], lo = Math.min(ta, tb), hi = Math.max(ta, tb);
      if (R >= lo - 1e-9 && R <= hi + 1e-9) return;
      var from = R > hi ? hi + gapE : lo - gapE, to = R > hi ? R + ext : R - ext;
      out.push({ k: 'line', a: [V0[0] + q[0] * from, V0[1] + q[1] * from], b: [V0[0] + q[0] * to, V0[1] + q[1] * to], layer: L, style: 'thin' });
    });
    var am = a0 + sw / 2, um = [Math.cos(am), Math.sin(am)], text = String(d.text), tw = text.length * th * 0.78;
    var reach = R + 1.5 * k + Math.abs(um[0]) * tw / 2 + Math.abs(um[1]) * th / 2, C = [V0[0] + um[0] * reach, V0[1] + um[1] * reach];
    out.push({ k: 'text', p: [C[0], C[1] - th / 2], h: th, text: text, anchor: 'middle', layer: L, rot: 0 });
    var bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    function grow(p) { bx.x0 = Math.min(bx.x0, p[0]); bx.x1 = Math.max(bx.x1, p[0]); bx.y0 = Math.min(bx.y0, p[1]); bx.y1 = Math.max(bx.y1, p[1]); }
    grow(tA); grow(tB);
    for (var i = 1; i < 8; i++) { var ai = a0 + sw * i / 8; grow([V0[0] + R * Math.cos(ai), V0[1] + R * Math.sin(ai)]); }
    d.tbox = { x0: C[0] - tw / 2, y0: C[1] - th / 2, x1: C[0] + tw / 2, y1: C[1] + th / 2 };
    grow([d.tbox.x0, d.tbox.y0]); grow([d.tbox.x1, d.tbox.y1]);
    d.box = bx; d.arrows = [tA, tB]; d.radNow = R / w.scale;
    d.dxf = { type: 'angular', p13: tA.slice(), p14: tB.slice(), p15: V0.slice(), p10: [V0[0] + R * Math.cos(am), V0[1] + R * Math.sin(am)], p11: C.slice() };
    return out;
  }
  function angleText(d, units) { return d.tol || d.label != null || d.prec != null ? dimLabel(d, units).text : fmtAngle(d.value) + '°'; }
  // the sheet's angle dimensions get their primitives after the renderer has placed the others (drawing-render.js
  // compute calls it last, rfV); each primitive carries its dimension's index (dimIx) for the DXF DIMENSION block
  function finishAngles(sheet) {
    var k = sheet.units === 'in' ? 1 / 25.4 : 1, G = sheet.dimStyle && sheet.dimStyle.paper || null;
    (sheet.dims || []).forEach(function (d, ix) {
      if (d.kind !== 'angle' || !d.u || !d.c) return;
      var w = (sheet.views || []).filter(function (x) { return x.view.id === d.view; })[0];
      if (!w) return;
      d.text = angleText(d, sheet.units);
      anglePrims(d, w, k, G).forEach(function (x) { x.view = d.view; x.dimIx = ix; if (d.dangling) x.color = 'dangling'; sheet.prims.push(x); });
    });
    return sheet;
  }

  // ------------------------------------------------------------------ dimension text: precision, tolerance, text
  // d.prec (decimal places; default: up to 2 in mm / 3 in inches, trailing zeros dropped), d.tol = { type: 'none' |
  // 'bilateral' | 'limit' | 'symmetric', plus, minus, prec }, d.label (dimension text, "<DIM>" is the value)
  var TOL_TYPES = [['none', 'None'], ['bilateral', 'Bilateral'], ['limit', 'Limit'], ['symmetric', 'Symmetric']];
  // (an explicit precision on an inch drawing still drops the leading zero, ANSI: .03, not 0.03)
  function numText(x, units, prec) {
    if (!(prec != null && prec !== '' && +prec >= 0)) return fmtDim(x, units);
    return units === 'in' ? D.inchText(x, +prec) : (Math.round(+x * Math.pow(10, +prec)) / Math.pow(10, +prec)).toFixed(+prec);
  }
  // dimLabel(d, units) -> { main, upper, lower, text }: main is null for a limit tolerance (upper over lower); text is
  // the one-line form ("100.00 +0.10/-0.05", "100.10/99.95", "100.00 ±0.05")
  function dimLabel(d, units) {
    var prec = d.prec != null && d.prec !== '' ? +d.prec : null, tol = d.tol && d.tol.type && d.tol.type !== 'none' ? d.tol : null;
    function base(x) {
      if (d.kind === 'chamfer') return numText(x, units, prec) + ' X ' + fmtAngle(d.angle) + '°';
      if (d.kind === 'angle') return (prec != null ? (+x).toFixed(prec) : fmtAngle(x)) + '°';   // (rfS)
      if (d.kind === 'dia') return (d.count > 1 ? d.count + 'X ' : '') + 'Ø' + numText(x, units, prec);
      if (d.kind === 'rad' && d.slot) return D.slotText(d, units, prec);   // a slot callout: W X L SLOT
      if (d.kind === 'rad') return (d.count > 1 ? d.count + 'X ' : '') + 'R' + numText(x, units, prec);
      return numText(x, units, prec);
    }
    var out = { main: base(d.value), upper: null, lower: null };
    if (tol) {
      var tp = tol.prec != null && tol.prec !== '' ? +tol.prec : prec, plus = Math.abs(+tol.plus || 0), minus = Math.abs(+tol.minus || 0);
      var tn = function (x) { return numText(x, units, tp); };
      if (tol.type === 'symmetric') out.main += ' ±' + tn(plus);
      else if (tol.type === 'bilateral') {
        // (rfM) a zero limit is written at the other limit's precision: inch '-.000' / '+.000' (ASME Y14.5 unilateral,
        // SolidWorks), mm a single '0' with no sign
        var zero = function (other, sign) {
          if (units !== 'in') return '0';
          var m = /\.(\d+)/.exec(other);
          return sign + (m ? '.' + new Array(m[1].length + 1).join('0') : '0');
        };
        var pt = tn(plus), mt = tn(minus);
        out.upper = plus ? '+' + pt : zero(mt, '+');
        out.lower = minus ? '-' + mt : zero(pt, '-');
      }
      else if (tol.type === 'limit') { out.upper = base(d.value + plus); out.lower = base(d.value - minus); out.main = null; }
      // sketch-ordinate: the sketch Dimension PM's other kinds, brought in with a model item: MIN / MAX after the value,
      // Basic (boxed on the sheet: out.basic)
      else if (tol.type === 'min') out.main += ' MIN';
      else if (tol.type === 'max') out.main += ' MAX';
      else if (tol.type === 'basic') out.basic = true;
    }
    if (d.label != null && String(d.label) !== '' && out.main != null) out.main = String(d.label).split('<DIM>').join(out.main);
    out.text = out.main == null ? out.upper + '/' + out.lower : out.main + (out.upper != null ? ' ' + out.upper + '/' + out.lower : '');
    return out;
  }
  // the dimension properties the Dimension PropertyManager edits; a model item keeps them in doc.dimProps under
  // styleKey (view:kind:n, stable when the part changes size), a Smart Dimension on itself
  var DIM_PROPS = ['at', 'tx', 'lead', 'off', 'flip', 'tol', 'prec', 'label', 'rad'];   // (rad: an angle's arc radius, rfS)
  function styleKey(d, n) { return d.view + ':' + d.kind + ':' + n; }
  function setDimProps(target, props) {
    DIM_PROPS.forEach(function (k) {
      if (!(k in props)) return;
      var x = props[k];
      if (x == null || x === '' || (k === 'flip' && !x) || (k === 'tol' && (!x || !x.type || x.type === 'none'))) delete target[k];
      else target[k] = JSON.parse(JSON.stringify(x));
    });
    return target;
  }

  // ------------------------------------------------------------------ driving dimensions (model items change the part)
  // dimSource(model, build, w, d) -> { feature, featureName, what, kind: 'entity' | 'depth', e, dim, value, expr } or
  // null: the model parameter a drawing dimension shows. Candidates are every sketch dimension of every sketch entity
  // (circle diameters, rectangle widths / heights, line and slot lengths, arc radii) and every blind extrude depth whose
  // value equals the dimension's and whose direction is the direction the dimension measures in the view; the one
  // whose geometry projects closest to the dimension wins. `expr` flags a value that an equation drives.
  function dimSource(model, build, w, d) {
    if (!model || model.type === 'assembly' || !model.features || !w || !w.frame || d.value == null) return null;
    if (d.flat || w.flat || (w.view && w.view.kind === 'flat')) return null;   // a flat blank's sizes are results, not parameters
    // a sketch location dimension (Drawing.sketchDistances): the distance relation itself
    if (d.sketchRel && d.relSrc) {
      var sf = K.findFeature(model, d.relSrc.f), rl = sf && sf.rels && sf.rels[d.relSrc.i];
      if (!rl || rl.type !== 'distance' || rl.driven) return null;
      return { feature: sf.id, featureName: sf.name || K.featureName(sf), kind: 'rel', index: d.relSrc.i, value: +rl.v, what: 'distance', expr: K.isExpression && K.isExpression(rl.v) ? String(rl.v) : null };
    }
    if (d.kind !== 'dia' && d.kind !== 'h' && d.kind !== 'v' && d.kind !== 'aligned') return null;
    var F = w.frame, planes = build && build.planes || {}, val = d.value, tolV = Math.max(1e-6, Math.abs(val) * 1e-7), best = null, bs = Infinity;
    if (!isOrthoFrame(F)) return null;
    var rm; try { rm = K.resolvedModel(model).model; } catch (e) { rm = model; }
    function view2(p) { return [V.dot(p, F.u), V.dot(p, F.v)]; }
    var t2 = null, t3 = null, dm = null;
    if (d.kind !== 'dia') {
      t2 = d.kind === 'h' ? [1, 0] : d.kind === 'v' ? [0, 1] : (function () { var x = d.b[0] - d.a[0], y = d.b[1] - d.a[1], L = Math.hypot(x, y); return [x / L, y / L]; })();
      t3 = V.add(V.scale(F.u, t2[0]), V.scale(F.v, t2[1]));
      dm = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2];
    }
    function consider(score, src) { if (score < bs) { bs = score; best = src; } }
    function spanScore(p0, p1) {
      var m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], dx = m[0] - dm[0], dy = m[1] - dm[1];
      return Math.abs(dx * t2[0] + dy * t2[1]) + 1e-3 * Math.abs(dx * t2[1] - dy * t2[0]);
    }
    rm.features.forEach(function (f, fi) {
      var raw = model.features[fi];
      if (f.type === 'sketch') {
        var pl; try { pl = K.resolvePlane(f.plane, rm, planes); } catch (e) { return; }
        (f.entities || []).forEach(function (e, ei) {
          var kinds = e.t === 'circle' ? [{ k: 'dia' }] : e.t === 'rect' || e.t === 'crect' ? [{ k: 'w', i: 0 }, { k: 'h', i: 1 }] : e.t === 'line' ? [{ k: 'len' }] : e.t === 'slot' ? [{ k: 'len' }, { k: 'w' }] : e.t === 'arc' || e.t === 'poly' ? [{ k: 'r' }] : [];
          kinds.forEach(function (dk) {
            var g = K.dimGeometry(e, dk);
            if (!g || Math.abs(g.value - val) > tolV) return;
            var src = { feature: raw.id, featureName: raw.name || K.featureName(raw), kind: 'entity', e: ei, dim: dk, value: g.value, what: e.t + ' ' + (dk.k === 'dia' ? 'diameter' : dk.k === 'r' ? 'radius' : dk.k === 'w' ? (e.t === 'slot' ? 'width' : 'width') : dk.k === 'h' ? 'height' : 'length') };
            if (g.type === 'radial') {
              if (d.kind !== 'dia' || dk.k !== 'dia' || Math.abs(Math.abs(V.dot(pl.n, F.e)) - 1) > 1e-9) return;
              var c2 = view2(K.to3D(pl, g.C[0], g.C[1]));
              consider(Math.hypot(c2[0] - d.c[0], c2[1] - d.c[1]), src);
            } else if (d.kind !== 'dia') {
              var d3 = V.add(V.scale(pl.x, g.dir[0]), V.scale(pl.y, g.dir[1]));
              if (Math.abs(Math.abs(V.dot(d3, t3)) - 1) > 1e-9) return;
              consider(spanScore(view2(K.to3D(pl, g.P[0], g.P[1])), view2(K.to3D(pl, g.Q[0], g.Q[1]))), src);
            }
          });
        });
      } else if (f.type === 'extrude' && d.kind !== 'dia' && (f.end === 'blind' || f.end === 'mid') && !f.dir2) {
        var sk = rm.features.filter(function (x) { return x.id === f.sketch; })[0], pl2;
        if (!sk) return;
        try { pl2 = K.resolvePlane(sk.plane, rm, planes); } catch (e) { return; }
        var depth = +f.depth;
        if (!(Math.abs(depth - val) <= tolV) || Math.abs(Math.abs(V.dot(pl2.n, t3)) - 1) > 1e-9) return;
        var o = view2(pl2.origin), n2 = [V.dot(pl2.n, F.u), V.dot(pl2.n, F.v)], sgn = f.reverse ? -1 : 1;
        var p0 = f.end === 'mid' ? [o[0] - n2[0] * depth / 2, o[1] - n2[1] * depth / 2] : o, p1 = f.end === 'mid' ? [o[0] + n2[0] * depth / 2, o[1] + n2[1] * depth / 2] : [o[0] + sgn * n2[0] * depth, o[1] + sgn * n2[1] * depth];
        consider(spanScore(p0, p1), { feature: raw.id, featureName: raw.name || K.featureName(raw), kind: 'depth', value: depth, what: 'depth', expr: K.isExpression(raw.depth) ? String(raw.depth) : null });
      }
    });
    return best;
  }
  // ------------------------------------------------------------------ sketch dimension properties on model items
  // sketch-ordinate: what the sketch's Dimension PropertyManager set on the dimension a model item shows comes onto the
  // drawing with it (SolidWorks' Insert Model Items): the tolerance, the precision, the text before / after the value
  // (2X, TYP, REF) and the name; a driven (reference) sketch dimension reads in parentheses. sketchDimProps(model,
  // build, w, d) -> { tol, prec, label, name, driven, count } or null: d is a model item of view record w; its sketch
  // dimension is the Smart Dimension of the entity dimSource traces it to (the circle's diameter, the rectangle's
  // width …). A "2X"-style text before the value replaces the drawing's own count (no "2X 2X Ø.266"). The drawing's
  // own Dimension PM settings (doc.dimProps) still win over these.
  var SK_PROPS = ['tol', 'prec', 'prefix', 'suffix', 'name', 'driven'];
  function hasSketchDimProps(model) {
    return !!(model && model.features && model.features.some(function (f) {
      return f.type === 'sketch' && (f.dims || []).some(function (x) { return SK_PROPS.some(function (k) { return x[k] != null && x[k] !== '' && x[k] !== false; }); });
    }));
  }
  // (only Smart Dimensions that carry such a property are candidates: of two equal holes the one dimensioned "2X" is
  // the one the model item shows, wherever on the sheet the item's leader went; among those the closest wins)
  // A model item made from a sketch's distance relation (a location dimension, d.relSrc: Drawing.sketchDistances)
  // takes that relation's properties and name; an overall size that also is one takes them when the relation has any.
  // rfJ: every kind of sketch dimension a model item shows brings its properties: a slot callout (slotDimProps: the
  // slot's width / overall length or arc radius Smart Dimensions, each on its own part of the callout) and an
  // ordinate set (sketchOrdinateProps: each member's, on its own value) as well as the linear / radial ones on
  // entities and the location dimensions (distance relations, rel.mark) below
  function sketchDimProps(model, build, w, d) {
    if (!d || !d.auto || d.flat) return null;
    if (d.kind === 'ordinate' && d.sketchOrd) return sketchOrdinateProps(model, d);
    if (d.value == null) return null;
    if (d.slot) return slotDimProps(model, build, w, d);
    var rp = d.relSrc ? relDimProps(model, d.relSrc) : null;
    if (rp && rp.own) { delete rp.own; return rp; }
    var ep = entityDimProps(model, build, w, d);
    if (ep || !rp) return ep;
    delete rp.own;
    return rp;
  }
  // the props of sketch dimension sd (a Smart Dimension or a distance relation) as a model item takes them; n: its
  // number in the sketch's D1, D2 … order, f: the sketch
  function dimPropsOf(sd, f, n) {
    var out = {};
    if (sd.tol && sd.tol.type && sd.tol.type !== 'none') out.tol = { type: sd.tol.type, plus: Math.abs(+sd.tol.plus || 0), minus: Math.abs(+(sd.tol.type === 'symmetric' ? sd.tol.plus : sd.tol.minus) || 0) };
    if (sd.prec != null && sd.prec !== '' && +sd.prec >= 0) out.prec = +sd.prec;
    var pre = sd.prefix ? String(sd.prefix) : '', suf = sd.suffix ? String(sd.suffix) : '';
    if (pre && !/\s$/.test(pre)) pre += ' ';
    if (suf && !/^\s/.test(suf)) suf = ' ' + suf;
    if (pre || suf || sd.driven) out.label = (sd.driven ? '(' : '') + pre + '<DIM>' + suf + (sd.driven ? ')' : '');
    if (/^\s*\d+\s*[xX]\b/.test(pre)) out.count = 1;
    if (sd.driven) out.driven = true;
    out.name = (sd.name ? String(sd.name) : 'D' + n) + '@' + (f.name || K.featureName(f));
    return out;
  }
  // relSrc { f (sketch id), i (relation index) } -> its props ({ …, own: the relation sets one of them }) or null
  var DIM_RELS = { distance: 1, angle: 1, arclength: 1 };
  function relDimProps(model, src) {
    var f = K.findFeature(model, src.f), rel = f && f.rels && f.rels[src.i];
    if (!rel) return null;
    var n = (f.dims || []).length;
    for (var i = 0; i <= src.i; i++) if (f.rels[i] && DIM_RELS[f.rels[i].type]) n++;
    var out = dimPropsOf(rel, f, n);
    out.own = SK_PROPS.some(function (k) { return k !== 'name' && rel[k] != null && rel[k] !== '' && rel[k] !== false; }) || !!rel.name;
    return out;
  }
  function hasDimProps(x) { return SK_PROPS.some(function (k) { return x[k] != null && x[k] !== '' && x[k] !== false; }); }
  // sketchOrdinateProps(model, d) -> { valueProps: [props | null per member], name } or null: the members of the
  // ordinate set a model item d (d.sketchOrd 'sketchId:setId') shows, each with its own relation's tolerance,
  // precision and text (the order of SketchSolver.ordinateSets, as d.refs / d.values)
  function sketchOrdinateProps(model, d) {
    var S = typeof SketchSolver !== 'undefined' ? SketchSolver : null, s = String(d.sketchOrd), cut = s.indexOf(':');
    if (!S || !S.ordinateSets || cut < 0) return null;
    var fid = s.slice(0, cut), sid = s.slice(cut + 1), f = (model.features || []).filter(function (x) { return String(x.id) === fid; })[0];
    var set = f && f.rels && S.ordinateSets(f)[sid];
    if (!set) return null;
    var name = null, vals = set.members.map(function (i) {
      var p = relDimProps(model, { f: f.id, i: i });
      if (!p || !(p.tol || p.prec != null || p.label != null)) return null;
      delete p.own; name = name || p.name;
      return p;
    });
    return vals.some(Boolean) ? { valueProps: vals, name: name } : null;
  }
  // an ordinate value's text with its member's props (the drawing's own precision, prec, still wins)
  function ordinateValueText(x, vp, units, prec) {
    return dimLabel({ kind: 'h', value: x, prec: prec != null ? prec : vp.prec, tol: vp.tol, label: vp.label }, units).text;
  }
  // slotDimProps(model, build, w, d) -> { slotProps: { w, len } (straight) | { R, w } (arc), name } or null: the
  // sketch slot a slot callout d shows (same size, its sketch square to the view; of several, the one whose Smart
  // Dimensions carry properties, nearest the callout's end arc / centre) and the props of its width ('w'), overall
  // length ('olen', else the centre distance 'len') or centre-line radius ('r') dimensions
  function slotDimProps(model, build, w, d) {
    if (!hasSketchDimProps(model) || !w || !w.frame || w.flat || !isOrthoFrame(w.frame)) return null;
    var F = w.frame, planes = build && build.planes || {}, s = d.slot, tolV = 1e-6 * (1 + Math.abs(s.len || s.R || 0) + s.w);
    var rm; try { rm = K.resolvedModel(model).model; } catch (e) { rm = model; }
    var best = null;
    rm.features.forEach(function (rf, fi) {
      var raw = model.features[fi];
      if (rf.type !== 'sketch' || rf.suppressed || !raw || !raw.dims) return;
      var pl; try { pl = K.resolvePlane(rf.plane, rm, planes); } catch (e) { return; }
      if (Math.abs(Math.abs(V.dot(pl.n, F.e)) - 1) > 1e-9) return;
      function view2(x, y) { var p = K.to3D(pl, x, y); return [V.dot(p, F.u), V.dot(p, F.v)]; }
      (rf.entities || []).forEach(function (e, ei) {
        var dims = [];
        raw.dims.forEach(function (x, i) { if (x.e === ei && hasDimProps(x)) dims.push({ x: x, i: i }); });
        if (!dims.length || !e) return;
        var score;
        if (!s.arc && e.t === 'slot') {
          var L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
          if (Math.abs(e.w - s.w) > tolV || Math.abs(L + e.w - s.len) > tolV) return;
          var c1 = view2(e.x1, e.y1), c2 = view2(e.x2, e.y2);
          score = Math.min(Math.hypot(c1[0] - d.c[0], c1[1] - d.c[1]), Math.hypot(c2[0] - d.c[0], c2[1] - d.c[1]));
        } else if (s.arc && e.t === 'aslot') {
          if (Math.abs(e.r - s.R) > tolV || Math.abs(e.w - s.w) > tolV) return;
          var c = view2(e.cx, e.cy), sc = s.center || d.c;
          score = Math.hypot(c[0] - sc[0], c[1] - sc[1]);
        } else return;
        if (!best || score < best.score) best = { score: score, f: raw, dims: dims };
      });
    });
    if (!best) return null;
    var props = {}, name = null, olen = false;
    best.dims.forEach(function (o) {
      var k = o.x.k, part = s.arc ? (k === 'r' ? 'R' : k === 'w' ? 'w' : null) : (k === 'w' ? 'w' : k === 'olen' || k === 'len' ? 'len' : null);
      if (!part || (part === 'len' && k === 'len' && olen)) return;
      if (k === 'olen') olen = true;
      props[part] = dimPropsOf(o.x, best.f, o.i + 1);
      name = name || props[part].name;
    });
    return Object.keys(props).length ? { slotProps: props, name: name } : null;
  }
  function entityDimProps(model, build, w, d) {
    if (!hasSketchDimProps(model)) return null;
    if (d.kind !== 'dia' && d.kind !== 'rad' && d.kind !== 'h' && d.kind !== 'v' && d.kind !== 'aligned') return null;
    if (d.slot || !w || !w.frame || w.flat || (w.view && w.view.kind === 'flat') || !isOrthoFrame(w.frame)) return null;
    var F = w.frame, planes = build && build.planes || {}, val = d.value, tolV = Math.max(1e-6, Math.abs(val) * 1e-7), radial = d.kind === 'dia' || d.kind === 'rad';
    var rm; try { rm = K.resolvedModel(model).model; } catch (e) { rm = model; }
    function view2(p) { return [V.dot(p, F.u), V.dot(p, F.v)]; }
    var t2 = null, t3 = null, dm = null;
    if (!radial) {
      t2 = d.kind === 'h' ? [1, 0] : d.kind === 'v' ? [0, 1] : (function () { var x = d.b[0] - d.a[0], y = d.b[1] - d.a[1], L = Math.hypot(x, y); return [x / L, y / L]; })();
      t3 = V.add(V.scale(F.u, t2[0]), V.scale(F.v, t2[1]));
      dm = [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2];
    }
    var f = null, idx = -1, bs = Infinity;
    rm.features.forEach(function (rf, fi) {
      var raw = model.features[fi];
      if (rf.type !== 'sketch' || rf.suppressed || !raw || !raw.dims) return;
      var pl; try { pl = K.resolvePlane(rf.plane, rm, planes); } catch (e) { return; }
      raw.dims.forEach(function (x, i) {
        if (!SK_PROPS.some(function (k) { return x[k] != null && x[k] !== '' && x[k] !== false; })) return;
        var e = rf.entities && rf.entities[x.e], g = e && K.dimGeometry(e, x);
        if (!g || Math.abs(g.value - val) > tolV) return;
        var score;
        if (g.type === 'radial') {
          if (!radial || (d.kind === 'dia') !== (x.k === 'dia') || Math.abs(Math.abs(V.dot(pl.n, F.e)) - 1) > 1e-9) return;
          var c2 = view2(K.to3D(pl, g.C[0], g.C[1]));
          score = Math.hypot(c2[0] - d.c[0], c2[1] - d.c[1]);
        } else {
          if (radial || !g.dir) return;
          var d3 = V.add(V.scale(pl.x, g.dir[0]), V.scale(pl.y, g.dir[1]));
          if (Math.abs(Math.abs(V.dot(d3, t3)) - 1) > 1e-9) return;
          var p0 = view2(K.to3D(pl, g.P[0], g.P[1])), p1 = view2(K.to3D(pl, g.Q[0], g.Q[1])), m = [(p0[0] + p1[0]) / 2 - dm[0], (p0[1] + p1[1]) / 2 - dm[1]];
          score = Math.abs(m[0] * t2[0] + m[1] * t2[1]) + 1e-3 * Math.abs(m[0] * t2[1] - m[1] * t2[0]);
        }
        if (score < bs) { bs = score; f = raw; idx = i; }
      });
    });
    if (idx < 0) return null;
    return dimPropsOf(f.dims[idx], f, idx + 1);
  }
  // driveDim(model, src, value): writes the new value into the feature the source names (a sketch entity through the
  // sketch solver when the sketch has relations, else the kernel's one-entity edit; an extrude's depth). The caller
  // rebuilds. Throws when an equation drives the value or the value is not positive.
  function driveDim(model, src, value) {
    value = +value;
    if (!(value > 0) || !isFinite(value)) throw new Error('A dimension must be a positive number');
    if (src.expr) throw new Error(src.featureName + ' ' + src.what + ' is driven by the equation ' + src.expr + ' (Tools ▸ Equations)');
    var f = K.findFeature(model, src.feature);
    if (!f) throw new Error('The feature this dimension drives is gone');
    if (src.kind === 'depth') { f.depth = value; return model; }
    if (src.kind === 'rel') {   // a sketch location dimension: the relation's value, solved with the sketch
      if (typeof SketchSolver === 'undefined') throw new Error('The sketch solver is not loaded');
      var rr = SketchSolver.setRelValue(f, src.index, value);
      if (!rr.ok) throw new Error(rr.error || 'The sketch cannot take that value');
      return model;
    }
    var e = f.entities && f.entities[src.e];
    if (!e) throw new Error('The sketch entity this dimension drives is gone');
    if (typeof SketchSolver !== 'undefined' && f.rels && f.rels.length) {
      var r = SketchSolver.setDim(f, src.dim, value);
      if (!r.ok) throw new Error(r.error || 'The sketch cannot take that value');
    } else K.setDimValue(e, src.dim, value);
    return model;
  }

  // ------------------------------------------------------------------ balloons: manual, stacked, quantity
  // addBalloon(doc, model, viewId, { key | component, attach: [u, v], pos: [dx, dy], stack: [{ key | component }],
  // stackDir, qty, qtyPos }): a balloon attached to a point of a component in the view (model units), placed at pos
  // (paper, from the view centre). key names the BOM row (the component source; 'part' on a part drawing).
  function balloonKey(model, x) {
    if (x.key != null) return x.key;
    if (model && model.type === 'assembly' && x.component != null) {
      var c = (model.components || []).filter(function (q) { return q.id === x.component; })[0];
      if (c) return JSON.stringify(c.source);
    }
    return 'part';
  }
  function addBalloon(doc, model, viewId, spec) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    spec = spec || {};
    var b = { key: balloonKey(model, spec), component: spec.component != null ? spec.component : null, manual: true };
    if (spec.attach) b.attach = [+spec.attach[0], +spec.attach[1]];
    if (spec.pos) b.pos = [+spec.pos[0], +spec.pos[1]];
    if (spec.stack && spec.stack.length) b.stack = spec.stack.map(function (s) { return { key: balloonKey(model, s), component: s.component != null ? s.component : null }; });
    if (spec.stackDir) b.stackDir = spec.stackDir;
    if (spec.qty != null ? spec.qty : docOptions(doc).balloonQty) b.qty = true;
    if (spec.qtyPos) b.qtyPos = spec.qtyPos;
    (v.balloons || (v.balloons = [])).push(b);
    return b;
  }
  var STACK_DIRS = { right: [1, 0], left: [-1, 0], up: [0, 1], down: [0, -1] };

  // ------------------------------------------------------------------ annotation primitives
  // annotationPrims(an, w, k, mesh, doc, units, counts) -> { prims, dangling, text, info }: an annotation of view
  // record w on the ANNOTATIONS layer. Centre marks and centrelines use the CENTER linetype ('center' style).
  // partThreads(model) -> HoleWizard.threads of a part ([] for an assembly or without holewizard.js);
  // threadsAlong(threads, F) -> those seen along their axis in the view frame F, with their view centre c
  function partThreads(model) {
    if (!model || model.type === 'assembly' || typeof HoleWizard === 'undefined') return [];
    try { return HoleWizard.threads(model); } catch (e) { return []; }
  }
  function threadsAlong(threads, F) {
    return (threads || []).filter(function (t) { return Math.abs(Math.abs(V.dot(t.n, F.e)) - 1) < 1e-9; })
      .map(function (t) { return { c: [V.dot(t.p, F.u), V.dot(t.p, F.v)], r: t.r, depth: t.depth, label: t.label, drill: t.drill }; });
  }
  // holeSizeNames(model) -> [{ dia, name, type }]: the standard thread size names the part's hole features carry (Hole
  // Wizard: '1/4-20 UNC', 'M8' on a tapped hole …), with the drilled diameter each makes. Read generically: a hole feature's `size` (or
  // `sizeName` / `name` of the standard) and its diameter from HoleWizard.spec when it knows the size, else the
  // feature's own `dia` / `diameter` / `drill`. A hole callout whose drill diameter matches exactly one name adds it.
  function holeSizeNames(model) {
    var out = [];
    if (!model || model.type === 'assembly') return out;
    (model.features || []).forEach(function (f) {
      if (f.suppressed || !/hole/i.test(String(f.type || ''))) return;
      var name = f.size != null && f.size !== '' ? String(f.size) : f.sizeName ? String(f.sizeName) : null;
      // (thread sizes only — a tapped hole, or a name that reads as a thread: 1/4-20 UNC, #10-32; a clearance or
      // counterbore hole's callout is its diameters, as SolidWorks writes it)
      if (!name || !(f.holeType === 'tap' || /UN[CEFS]?\b|\d\s*-\s*\d/i.test(name))) return;
      var dia = null;
      if (typeof HoleWizard !== 'undefined' && HoleWizard.spec) { try { dia = +HoleWizard.spec(f).dia; } catch (e) { dia = null; } }
      if (!(dia > 0)) dia = +(f.dia || f.diameter || f.drill || 0);
      if (dia > 0) out.push({ dia: dia, name: name, type: f.holeType || null });
    });
    return out;
  }
  // (rfV) holeEnds(model) -> [{ dia, thruAll }]: the hole diameters the part's cut features make and whether that
  // feature's end condition is Through All (Cut-Extrude end / end2 'through': its sketch's circles; a Hole Wizard hole
  // end 'through': its drill). SolidWorks' callout writes THRU ALL for those, THRU for a blind hole that happens to
  // clear the part. A drill size that both a Through All and a blind cut make reads THRU (the callout cannot tell them
  // apart from the solid).
  function holeEnds(model) {
    var out = [];
    if (!model || model.type === 'assembly') return out;
    var feats = model.features || [], byId = {};
    feats.forEach(function (f) { if (f && f.id != null) byId[f.id] = f; });
    feats.forEach(function (f) {
      if (!f || f.suppressed) return;
      if (f.type === 'hole') {
        var dia = null;
        if (typeof HoleWizard !== 'undefined' && HoleWizard.spec) { try { dia = +HoleWizard.spec(f, model.units).dia; } catch (e) { dia = null; } }
        if (dia > 0) out.push({ dia: dia, thruAll: f.end === 'through' });
        return;
      }
      if (f.type !== 'extrude' || !f.cut) return;
      var sk = byId[f.sketch], thru = f.end === 'through' || (!!f.dir2 && f.end2 === 'through');
      ((sk && sk.entities) || []).forEach(function (e) {
        if (e && e.t === 'circle' && !e.construction && +e.r > 0) out.push({ dia: 2 * +e.r, thruAll: thru });
      });
    });
    return out;
  }
  function thruAllFor(ends, dia) {
    var hit = (ends || []).filter(function (x) { return Math.abs(x.dia - dia) <= Math.max(1e-6, dia * 1e-5); });
    return hit.length > 0 && hit.every(function (x) { return x.thruAll; });
  }
  function holeNameFor(names, dia) {
    var hit = (names || []).filter(function (x) { return Math.abs(x.dia - dia) <= Math.max(1e-6, dia * 1e-5); }), uniq = [];
    hit.forEach(function (x) { if (uniq.indexOf(x.name) < 0) uniq.push(x.name); });
    return uniq.length === 1 ? uniq[0] : null;
  }
  function annotationPrims(an, w, k, mesh, doc, units, threads, holeNames, ends) {
    var L = 'ANNOTATIONS', out = [], pr = w.proj, o = docOptions(doc), dangling = false, text = '', info = null;
    function line(a, b, style) { out.push({ k: 'line', a: a, b: b, layer: L, style: style || 'thin' }); }
    function mark(cs, rr, size, ext, only) {
      // the small cross, then (extended lines) a gap and a centre line past the circle on each side
      var s = size * k, g = MARK_GAP * k, e = MARK_EXT * k;
      line([cs[0] - s, cs[1]], [cs[0] + s, cs[1]]); line([cs[0], cs[1] - s], [cs[0], cs[1] + s]);
      if (!ext || rr + e <= s + g) return;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        if (only && !only(d)) return;
        line([cs[0] + d[0] * (s + g), cs[1] + d[1] * (s + g)], [cs[0] + d[0] * (rr + e), cs[1] + d[1] * (rr + e)], 'center');
      });
    }
    if (an.type === 'centerMark') {
      an.holes.forEach(function (h) {
        var ref = { kind: 'dia', c: h.c, r: h.r };
        if (h.r > 0 && reattachDim(ref, pr)) { h.c = ref.c; h.r = ref.r; return; }
        // a slot's or rounded end's mark sits on an arc (arcsAll), not a full circle: the same arc, or one of its size
        // that moved, keeps it
        var aref = { kind: 'rad', c: h.c, r: h.r };
        if (h.r > 0 && (pr.arcsAll || []).length && reattachDim(aref, pr)) { h.c = aref.c; h.r = aref.r; return; }
        if (h.r > 0) dangling = true;
      });
      var size = markPaper(doc, an.size || (doc.options || {}).markSize), ext = an.ext != null ? an.ext : o.extLines, cs = an.holes.map(function (h) { return w.toSheet(h.c); });
      if (an.style === 'linear') {
        // marks on every hole, connection lines between consecutive centres (sorted along the row)
        var t = [cs[cs.length - 1][0] - cs[0][0], cs[cs.length - 1][1] - cs[0][1]];
        var idx = cs.map(function (c, i) { return i; }).sort(function (i, j) { return (cs[i][0] - cs[j][0]) * t[0] + (cs[i][1] - cs[j][1]) * t[1]; });
        idx.forEach(function (i) { mark(cs[i], an.holes[i].r * w.scale, size, ext); });
        for (var i = 1; i < idx.length; i++) line(cs[idx[i - 1]], cs[idx[i]], 'center');
        info = { centers: cs };
      } else if (an.style === 'circular') {
        var fit = an.center ? { c: an.center, r: 0 } : fitCircle(an.holes.map(function (h) { return h.c; }));
        if (!fit) { dangling = true; fit = { c: an.holes[0].c, r: 0 }; }
        var pc = w.toSheet(fit.c), R = 0;
        cs.forEach(function (c) { R += Math.hypot(c[0] - pc[0], c[1] - pc[1]) / cs.length; });
        out.push({ k: 'circle', c: pc, r: R, layer: L, style: 'center' });
        line([pc[0] - size * k, pc[1]], [pc[0] + size * k, pc[1]]); line([pc[0], pc[1] - size * k], [pc[0], pc[1] + size * k]);
        cs.forEach(function (c, j) {
          var rr = an.holes[j].r * w.scale, d = [c[0] - pc[0], c[1] - pc[1]], dl = Math.hypot(d[0], d[1]) || 1;
          mark(c, rr, size, false);
          if (an.radial !== false) line([pc[0] + d[0] / dl * size * k * 2, pc[1] + d[1] / dl * size * k * 2], [c[0] + d[0] / dl * (rr + MARK_EXT * k), c[1] + d[1] / dl * (rr + MARK_EXT * k)], 'center');
        });
        info = { center: pc, R: R, centers: cs };
      } else {
        mark(cs[0], an.holes[0].r * w.scale, size, ext);
        info = { centers: cs };
      }
      text = (an.style === 'single' ? 'Center Mark' : an.style === 'linear' ? 'Linear Center Mark' : 'Circular Center Mark') + ' (' + an.holes.length + ')';
    } else if (an.type === 'centerline') {
      // reattach to the nearest cylinder axis of the view that is parallel and overlaps; else dangling
      var m = w.section ? w.section.mesh : mesh, axes = w.ortho && m.faces.length ? cylAxes(m, w.frame) : [];
      var t0 = [an.b[0] - an.a[0], an.b[1] - an.a[1]], L0 = Math.hypot(t0[0], t0[1]), hit = null, hs = Infinity;
      axes.forEach(function (ax) {
        var t1 = [ax.b[0] - ax.a[0], ax.b[1] - ax.a[1]], L1 = Math.hypot(t1[0], t1[1]);
        if (Math.abs(t0[0] * t1[1] - t0[1] * t1[0]) > L0 * L1 * 1e-6) return;
        var off = Math.abs(t0[0] * (ax.a[1] - an.a[1]) - t0[1] * (ax.a[0] - an.a[0])) / L0, s = off + Math.hypot(ax.a[0] - an.a[0], ax.a[1] - an.a[1]) * 1e-3;
        if (off <= Math.max(an.r || 0, L0 * 0.05) + 1e-9 && s < hs) { hs = s; hit = ax; }
      });
      if (hit) { an.a = hit.a.slice(); an.b = hit.b.slice(); an.r = hit.r; } else if (an.r != null) dangling = true;
      var A = w.toSheet(an.a), B = w.toSheet(an.b), u = [B[0] - A[0], B[1] - A[1]], Lu = Math.hypot(u[0], u[1]) || 1, x = CL_EXT * k;
      u = [u[0] / Lu, u[1] / Lu];
      line([A[0] - u[0] * x, A[1] - u[1] * x], [B[0] + u[0] * x, B[1] + u[1] * x], 'center');
      text = 'Centerline';
      info = { a: A, b: B };
    } else if (an.type === 'holeCallout') {
      var ref2 = { kind: 'dia', c: an.c, r: an.r };
      if (reattachDim(ref2, pr)) { an.c = ref2.c; an.r = ref2.r; } else dangling = true;
      // (a flat pattern's holes all go through the blank: the callout reads the circle, counted over the flat)
      var h = w.flat ? { c: an.c.slice(), dia: 2 * an.r, thru: true } : w.ortho ? holeInfo(mesh, w.frame, an.c, an.r) : null, lines;
      // (rfV) THRU ALL when the cut that makes this drill size ends Through All
      var allOf = function (q) { if (q && q.thru && thruAllFor(ends, q.dia)) q.thruAll = true; return q; };
      allOf(h);
      if (h && w.flat) {
        var nf = 0;
        pr.circles.visible.forEach(function (c) { if (Math.abs(2 * c.r - h.dia) <= Math.max(1e-6, h.dia * 1e-6)) nf++; });
        lines = holeText(h, units, Math.max(1, nf), an.prec);
        info = { hole: h, count: Math.max(1, nf) };
      } else if (h) {
        // 4X: the visible holes of the view that read the same (one per centre: a counterbore shows two circles)
        var one = holeText(h, units, 1, an.prec).join('|'), count = 0, seen = [];
        pr.circles.visible.forEach(function (c) {
          if (seen.some(function (q) { return Math.hypot(q[0] - c.c[0], q[1] - c.c[1]) <= 1e-6 * (1 + Math.abs(q[0]) + Math.abs(q[1])); })) return;
          var q = allOf(holeInfo(mesh, w.frame, c.c, c.r));
          if (q && holeText(q, units, 1, an.prec).join('|') === one) { count++; seen.push(c.c); }
        });
        lines = holeText(h, units, Math.max(1, count), an.prec);
        info = { hole: h, count: Math.max(1, count) };
        // a Straight Tap hole of the Hole Wizard: the tap drill line, then the thread 'M8x1.25 ↧ 12' / 'M8x1.25 THRU'
        var tap = w.ortho ? threadsAlong(threads, w.frame).filter(function (t) { return Math.hypot(t.c[0] - h.c[0], t.c[1] - h.c[1]) <= 1e-6 * (1 + t.r) && Math.abs(t.drill - h.dia) <= 1e-6 * (1 + t.drill); })[0] : null;
        if (tap) { lines.push(tap.label + (tap.depth == null || h.thru ? (h.thruAll ? ' THRU ALL' : ' THRU') : ' ↧ ' + numText(tap.depth, units, an.prec))); info.thread = tap.label; }
      } else lines = ['Ø' + numText(2 * an.r, units, an.prec)];
      // the standard size the hole feature names (1/4-20 UNC, M6), when it is not in the callout already
      var sz = holeNameFor(holeNames, h ? h.dia : 2 * an.r);
      if (sz && lines.join(' ').indexOf(sz) < 0) { lines.push(sz); info = info || {}; info.size = sz; }
      if (an.text) lines = String(an.text).split('\n').map(function (s) { return s.split('<HOLE>').join(lines.join(' ')); });
      var c = w.toSheet(an.c), rr2 = an.r * w.scale, box = w.box, th = 3.5 * k, mid = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
      var lead = an.lead;
      if (!lead) {
        // out from the view centre, turned 35° upward so it clears the model items' diameter leaders (straight out)
        var off2 = [c[0] - mid[0], c[1] - mid[1]], ol = Math.hypot(off2[0], off2[1]), dir = ol > rr2 * 0.5 ? [off2[0] / ol, off2[1] / ol] : [Math.SQRT1_2, Math.SQRT1_2];
        var tq = (dir[0] >= 0 ? 35 : -35) * Math.PI / 180;
        if (ol > rr2 * 0.5) dir = [dir[0] * Math.cos(tq) - dir[1] * Math.sin(tq), dir[0] * Math.sin(tq) + dir[1] * Math.cos(tq)];
        var tx = Math.abs(dir[0]) < 1e-9 ? Infinity : dir[0] > 0 ? (box.x1 - c[0]) / dir[0] : (box.x0 - c[0]) / dir[0];
        var ty = Math.abs(dir[1]) < 1e-9 ? Infinity : dir[1] > 0 ? (box.y1 - c[1]) / dir[1] : (box.y0 - c[1]) / dir[1];
        var run = Math.max(rr2 + 4 * k, Math.min(tx, ty) + 8 * k);
        lead = [dir[0] * run, dir[1] * run];
      }
      var ll = Math.hypot(lead[0], lead[1]) || 1, uu = [lead[0] / ll, lead[1] / ll], tip = [c[0] + uu[0] * rr2, c[1] + uu[1] * rr2], elbow = [c[0] + lead[0], c[1] + lead[1]];
      // (ANSI, r13/drawings13: a short shoulder, the lines of text after it, centred on it)
      var sg = lead[0] >= 0 ? 1 : -1;
      line(tip, elbow); line(elbow, [elbow[0] + sg * _.SHOULDER * k, elbow[1]]);
      var ar = 3 * k, aw = _.ARROW_W * k, dv = [-uu[0], -uu[1]], nn = [-dv[1], dv[0]];
      out.push({ k: 'fill', pts: [tip, [tip[0] - dv[0] * ar + nn[0] * aw, tip[1] - dv[1] * ar + nn[1] * aw], [tip[0] - dv[0] * ar - nn[0] * aw, tip[1] - dv[1] * ar - nn[1] * aw]], layer: L });
      lines.forEach(function (s, i) { out.push({ k: 'text', p: [elbow[0] + sg * (_.SHOULDER + _.TEXT_GAP) * k, elbow[1] - th / 2 + ((lines.length - 1) / 2 - i) * th * 1.6], h: th, text: s, anchor: sg > 0 ? 'start' : 'end', layer: L, rot: 0 }); });
      an.leadNow = lead.slice();
      text = lines.join(' ');
      info = info || {};
      info.lines = lines;
    }
    if (dangling) out.forEach(function (x) { x.color = 'dangling'; });
    return { prims: out, dangling: dangling, text: text, info: info };
  }

  D.circlesAlong = circlesAlong; D.holeInfo = holeInfo; D.holeText = holeText; D.cylAxes = cylAxes; D.fitCircle = fitCircle; D.lineIntervals = lineIntervals;
  D.addCenterMark = addCenterMark; D.autoCenterMarks = autoCenterMarks; D.addCenterline = addCenterline; D.autoCenterlines = autoCenterlines; D.autoInsert = autoInsert;
  D.addHoleCallout = addHoleCallout; D.findAnnotation = findAnnotation; D.deleteAnnotation = deleteAnnotation; D.docOptions = docOptions; D.markPaper = markPaper;
  D.addOrdinate = addOrdinate; D.addBaseline = addBaseline; D.addChamferDim = addChamferDim; D.refFrom = refFrom;
  D.TOL_TYPES = TOL_TYPES; D.dimLabel = dimLabel; D.numText = numText; D.styleKey = styleKey; D.setDimProps = setDimProps; D.DIM_PROPS = DIM_PROPS;
  D.dimSource = dimSource; D.driveDim = driveDim; D.addBalloon = addBalloon; D.STACK_DIRS = STACK_DIRS;
  D.sketchDimProps = sketchDimProps; D.sketchOrdinateProps = sketchOrdinateProps; D.ordinateValueText = ordinateValueText; D.slotDimProps = slotDimProps;
  // ------------------------------------------------------------------ notes (Annotation ▸ Note)
  // doc.notes = [{ id, p: [x, y] (paper: the first line's baseline start), text (lines split at \n), h (paper mm,
  // default 3.5) }]: free text on the sheet, drawn on the NOTES layer in SVG, DXF (one TEXT per line) and PDF.
  // (rfQ) A note or symbol placed on a view (its leader's tip, or with no leader its position, inside the view's
  // linework box) belongs to that view and moves with it, as in SolidWorks; one placed on free paper stays on the
  // sheet. a.view: the view's id (0: on the sheet; not set yet: decided by the next compute), a.vxy: the view's
  // position when a.p / a.leader were last placed, so a.p - a.vxy is the offset from the view. spec.view on add /
  // edit: a view id attaches it to that view, 0 / false / null puts it on the sheet.
  function setAttach(a, view) {
    if (view === undefined) return;
    delete a.vxy;
    a.view = view ? +view : 0;
  }
  // followViews(doc, views, k): compute's pass before it draws the notes and symbols (views: compute's view list with
  // their paper boxes): new ones are attached to the view they sit on, the attached ones follow their view's move, and
  // those whose view went away stay where they are, on the sheet
  function followViews(doc, views, k) {
    var byId = {}, m = 3 * (k || 1);
    views.forEach(function (w) { byId[w.view.id] = w; });
    [doc.notes || [], doc.symbols || []].forEach(function (list) {
      list.forEach(function (a) {
        if (a.view === undefined) {
          var q = a.leader || a.p, hit = null, area = Infinity;
          if (q) views.forEach(function (w) {
            var b = w.box, ar = (b.x1 - b.x0) * (b.y1 - b.y0);
            if (q[0] >= b.x0 - m && q[0] <= b.x1 + m && q[1] >= b.y0 - m && q[1] <= b.y1 + m && ar < area) { hit = w; area = ar; }
          });
          a.view = hit ? hit.view.id : 0;
          if (hit) a.vxy = [hit.view.x, hit.view.y];
          return;
        }
        if (!a.view) return;
        var w = byId[a.view];
        if (!w) { a.view = 0; delete a.vxy; return; }
        var v = w.view;
        if (!a.vxy) { a.vxy = [v.x, v.y]; return; }
        var dx = v.x - a.vxy[0], dy = v.y - a.vxy[1];
        if (!dx && !dy) return;
        if (a.p) a.p = [a.p[0] + dx, a.p[1] + dy];
        if (a.leader) a.leader = [a.leader[0] + dx, a.leader[1] + dy];
        a.vxy = [v.x, v.y];
      });
    });
  }
  function addNote(doc, spec) {
    if (!spec || !spec.p || !isFinite(+spec.p[0]) || !isFinite(+spec.p[1])) throw new Error('A note needs a position on the sheet');
    var t = String(spec.text == null ? '' : spec.text);
    if (!t.trim()) throw new Error('A note needs text');
    var nt = { id: nextAnnotId(doc), p: [+spec.p[0], +spec.p[1]], text: t };
    if (+spec.h > 0) nt.h = +spec.h;
    if (spec.leader) nt.leader = [+spec.leader[0], +spec.leader[1]];   // (rfM) the arrow tip, paper
    setAttach(nt, spec.view);
    (doc.notes || (doc.notes = [])).push(nt);
    return nt;
  }
  function findNote(doc, id) { var l = doc.notes || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  // editNote(doc, id, { text, p, h }): an empty text deletes the note (as SolidWorks drops an emptied note)
  function editNote(doc, id, props) {
    var nt = findNote(doc, id);
    if (!nt) return null;
    if (props.text != null) { var t = String(props.text); if (!t.trim()) { deleteNote(doc, id); return null; } nt.text = t; }
    if (props.p) nt.p = [+props.p[0], +props.p[1]];
    if (props.h != null) { if (+props.h > 0) nt.h = +props.h; else delete nt.h; }
    if (props.leader !== undefined) { if (props.leader) nt.leader = [+props.leader[0], +props.leader[1]]; else delete nt.leader; }
    setAttach(nt, props.view);
    return nt;
  }
  function deleteNote(doc, id) {
    var l = doc.notes || [], n0 = l.length;
    doc.notes = l.filter(function (x) { return x.id !== id; });
    return doc.notes.length < n0;
  }
  // flatAnnotation(doc, viewId, key, { off, hidden }): a flat view's bend note / tag (its bend's stable key, 'bend:…'
  // or 'bend@…', as the view's annotations list it; 'b0', 'b1' … name the bends in order and become that bend's key
  // once the view has been worked out), Bend Table ('table') or FLAT SIZE note ('size') moved (off: paper offset from
  // where it goes by itself) or hidden / shown. A bend still under its older 'b<n>' key moves to its stable key.
  function flatAnnotation(doc, viewId, key, props) {
    var v = findView(doc, viewId);
    if (!v || v.kind !== 'flat') throw new Error('No flat-pattern view ' + viewId);
    var bk = v._bendKeys, m = /^b(\d+)$/.exec(String(key));
    if (bk && m && bk[+m[1]]) key = bk[+m[1]];
    var own = v.flatAnn || (v.flatAnn = {}), bi = bk ? bk.indexOf(key) : -1;
    if (bi >= 0 && key !== 'b' + bi && own['b' + bi]) {
      if (!own[key]) own[key] = JSON.parse(JSON.stringify(own['b' + bi]));
      delete own['b' + bi];
    }
    var s = own[key] || (own[key] = {});
    if (props.off !== undefined) { if (props.off && (props.off[0] || props.off[1])) s.off = [+props.off[0], +props.off[1]]; else delete s.off; }
    if (props.hidden !== undefined) { if (props.hidden) s.hidden = true; else delete s.hidden; }
    if (!Object.keys(s).length) delete own[key];
    if (!Object.keys(own).length) delete v.flatAnn;
    return s;
  }
  // ------------------------------------------------------------------ shop symbols (rfM): Surface Finish, Datum Feature,
  // Geometric Tolerance. doc.symbols = [{ id, type: 'surfaceFinish' | 'datum' | 'gtol', p: [x, y] (paper), leader:
  // [x, y] (paper: the arrow / triangle tip; none: no leader), … }], SolidWorks' Annotation tab tools. Every symbol is
  // drawn as lines, circles, arcs, fills and plain text, so SVG, DXF (R12 / R2000) and PDF carry it the same.
  //  surfaceFinish: { symbol: 'basic' | 'machined' | 'prohibited', ra: '63' (roughness, above the short leg), method:
  //    'GRIND' (on the extension bar) }, p the symbol's root (the point of the V) (ASME Y14.36)
  //  datum: { label: 'A' }, p the frame's centre; the leader ends in a filled datum triangle (ASME Y14.5-2009)
  //  gtol: { char: GTOL_CHARS key, dia: bool, tol: '.010', mod: 'M' | 'L' | '', datums: ['A', 'B(M)', 'C'] }, p the
  //    frame's left end, middle height (the feature control frame)
  var GTOL_CHARS = [['position', 'Position'], ['flatness', 'Flatness'], ['straightness', 'Straightness'], ['circularity', 'Circularity'], ['cylindricity', 'Cylindricity'],
    ['profileLine', 'Profile of a Line'], ['profileSurface', 'Profile of a Surface'], ['perpendicularity', 'Perpendicularity'], ['parallelism', 'Parallelism'], ['angularity', 'Angularity'],
    ['concentricity', 'Concentricity'], ['symmetry', 'Symmetry'], ['circularRunout', 'Circular Runout'], ['totalRunout', 'Total Runout']];
  var SF_SYMBOLS = [['basic', 'Basic'], ['machined', 'Machining Required'], ['prohibited', 'Machining Prohibited']];
  var SYMBOL_TYPES = { surfaceFinish: 1, datum: 1, gtol: 1 };
  // the next datum letter: A, B, C … skipping I, O, Q (ASME Y14.5), past the ones the drawing uses
  function nextDatum(doc) {
    var used = {}; (doc.symbols || []).forEach(function (s) { if (s.type === 'datum') used[String(s.label).toUpperCase()] = 1; });
    var L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    for (var i = 0; i < L.length; i++) if (!used[L[i]]) return L[i];
    return 'AA';
  }
  function cleanSymbol(s, spec) {
    if (spec.p) s.p = [+spec.p[0], +spec.p[1]];
    setAttach(s, spec.view);
    if (spec.leader !== undefined) { if (spec.leader) s.leader = [+spec.leader[0], +spec.leader[1]]; else delete s.leader; }
    if (s.type === 'surfaceFinish') {
      if (spec.symbol != null) s.symbol = spec.symbol === 'machined' || spec.symbol === 'prohibited' ? spec.symbol : 'basic';
      ['ra', 'method'].forEach(function (q) { if (spec[q] != null) { if (String(spec[q]).trim()) s[q] = String(spec[q]).trim(); else delete s[q]; } });
      if (!s.symbol) s.symbol = 'basic';
    } else if (s.type === 'datum') {
      if (spec.label != null) s.label = String(spec.label).trim().toUpperCase();
      if (!s.label) throw new Error('A datum feature needs a letter');
    } else {
      if (spec.char != null) { if (!GTOL_CHARS.some(function (c) { return c[0] === spec.char; })) throw new Error('No geometric characteristic ' + spec.char); s.char = spec.char; }
      if (spec.dia != null) { if (spec.dia) s.dia = true; else delete s.dia; }
      if (spec.tol != null) s.tol = String(spec.tol).trim();
      if (spec.mod != null) { var md = String(spec.mod).toUpperCase().replace(/[()]/g, ''); if (md === 'M' || md === 'L') s.mod = md; else delete s.mod; }
      if (spec.datums != null) s.datums = (Array.isArray(spec.datums) ? spec.datums : String(spec.datums).split(/[\s,|]+/)).map(function (x) { return String(x).trim().toUpperCase(); }).filter(Boolean).slice(0, 3);
      if (!s.char) s.char = 'position';
      if (!s.tol) throw new Error('A feature control frame needs a tolerance value');
    }
    return s;
  }
  // addSymbol(doc, { type, p, leader, … }) -> the symbol (one entry of doc.symbols)
  function addSymbol(doc, spec) {
    spec = spec || {};
    if (!SYMBOL_TYPES[spec.type]) throw new Error('Unknown symbol type ' + spec.type);
    if (!spec.p || !isFinite(+spec.p[0]) || !isFinite(+spec.p[1])) throw new Error('A symbol needs a position on the sheet');
    var s = { id: nextAnnotId(doc), type: spec.type };
    if (spec.type === 'datum' && spec.label == null) spec = Object.assign({}, spec, { label: nextDatum(doc) });
    cleanSymbol(s, spec);
    (doc.symbols || (doc.symbols = [])).push(s);
    return s;
  }
  function findSymbol(doc, id) { var l = doc.symbols || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function editSymbol(doc, id, props) {
    var s = findSymbol(doc, id);
    if (!s) throw new Error('No symbol ' + id);
    var c = JSON.parse(JSON.stringify(s));
    cleanSymbol(c, props || {});
    Object.keys(s).forEach(function (q) { delete s[q]; }); Object.assign(s, c);
    return s;
  }
  function deleteSymbol(doc, id) {
    var l = doc.symbols || [], n0 = l.length;
    doc.symbols = l.filter(function (x) { return x.id !== id; });
    return doc.symbols.length < n0;
  }
  // parse 'B(M)' -> { ref: 'B', mod: 'M' }
  function datumRef(x) { var m = /^([A-Z]+(?:-[A-Z]+)?)\s*\(?([ML])?\)?$/.exec(String(x).toUpperCase().replace(/\s+/g, '')); return m ? { ref: m[1], mod: m[2] || null } : { ref: String(x), mod: null }; }
  // symbolText(s) -> one line for lists and the summary: 'POSITION Ø.010(M) | A | B | C', 'DATUM A', 'SURFACE FINISH 63'
  function symbolText(s) {
    if (s.type === 'datum') return 'DATUM ' + s.label;
    if (s.type === 'surfaceFinish') return 'SURFACE FINISH' + (s.ra ? ' ' + s.ra : '') + (s.method ? ' ' + s.method : '') + (s.symbol === 'machined' ? ' (MACHINED)' : s.symbol === 'prohibited' ? ' (NO MACHINING)' : '');
    var nm = (GTOL_CHARS.filter(function (c) { return c[0] === s.char; })[0] || ['', ''])[1].toUpperCase();
    return [nm + ' ' + (s.dia ? 'Ø' : '') + s.tol + (s.mod ? '(' + s.mod + ')' : '')].concat(s.datums || []).join(' | ');
  }
  // symbolPrims(s, k, textWidth) -> { prims, box, text }: the symbol as sheet primitives on the SYMBOLS layer
  // (k: paper mm -> paper units; textWidth from drawing-render.js)
  function symbolPrims(s, k, textWidth, arrowW) {
    var L = 'SYMBOLS', out = [], h = 3.5 * k, p = s.p;
    function ln(a, b, st) { out.push({ k: 'line', a: a, b: b, layer: L, style: st || 'thin', symbol: s.id }); }
    function tx(q, t, anchor, hh) { out.push({ k: 'text', p: q, h: hh || h, text: t, anchor: anchor || 'start', layer: L, rot: 0, symbol: s.id }); }
    function circ(c, r) { out.push({ k: 'circle', c: c, r: r, layer: L, style: 'thin', symbol: s.id }); }
    function fill(pts) { out.push({ k: 'fill', pts: pts, layer: L, symbol: s.id }); }
    function arrow(tip, from) {
      var d = [tip[0] - from[0], tip[1] - from[1]], n = Math.hypot(d[0], d[1]) || 1, u = [d[0] / n, d[1] / n], w = (arrowW || 0.5) * k;
      fill([tip, [tip[0] - u[0] * 3 * k + u[1] * w, tip[1] - u[1] * 3 * k - u[0] * w], [tip[0] - u[0] * 3 * k - u[1] * w, tip[1] - u[1] * 3 * k + u[0] * w]]);
    }
    if (s.type === 'surfaceFinish') {
      var t60 = Math.tan(Math.PI / 3), H1 = 5 * k, H2 = 10 * k, aL = [p[0] - H1 / t60, p[1] + H1], aR = [p[0] + H2 / t60, p[1] + H2];
      ln(p, aL); ln(p, aR);
      if (s.symbol === 'machined') ln(aL, [p[0] + H1 / t60, p[1] + H1]);
      if (s.symbol === 'prohibited') circ([p[0], p[1] + 3.2 * k], 1.6 * k);
      if (s.ra) tx([p[0] + 2.4 * k, p[1] + 5.9 * k], s.ra, 'end');
      if (s.method) { var mw = textWidth(s.method, h) + 2 * k; ln(aR, [aR[0] + mw, aR[1]]); tx([aR[0] + 1 * k, aR[1] + 1 * k], s.method, 'start'); }
      // a leader from the root to the surface
      if (s.leader) { ln(s.leader, p); arrow(s.leader, p); }
    } else if (s.type === 'datum') {
      var a = 3.5 * k, tw = Math.max(2 * a, textWidth(s.label, h) + 2.5 * k) / 2;
      ln([p[0] - tw, p[1] - a], [p[0] + tw, p[1] - a], 'thin'); ln([p[0] + tw, p[1] - a], [p[0] + tw, p[1] + a], 'thin');
      ln([p[0] + tw, p[1] + a], [p[0] - tw, p[1] + a], 'thin'); ln([p[0] - tw, p[1] + a], [p[0] - tw, p[1] - a], 'thin');
      tx([p[0], p[1] - h / 2], s.label, 'middle');
      var tip = s.leader || [p[0], p[1] - a - 6 * k];
      // the leader leaves the frame's nearest side, ends in a filled equilateral triangle standing on the surface
      var dx = tip[0] - p[0], dy = tip[1] - p[1], from = Math.abs(dy) * tw >= Math.abs(dx) * a ? [p[0], p[1] + (dy < 0 ? -a : a)] : [p[0] + (dx < 0 ? -tw : tw), p[1]];
      var d = [tip[0] - from[0], tip[1] - from[1]], n = Math.hypot(d[0], d[1]) || 1, u = [d[0] / n, d[1] / n], th = 3 * k * Math.sqrt(3) / 2, base = [tip[0] - u[0] * th, tip[1] - u[1] * th];
      ln(from, base);
      fill([[base[0] + u[1] * 1.5 * k, base[1] - u[0] * 1.5 * k], [base[0] - u[1] * 1.5 * k, base[1] + u[0] * 1.5 * k], tip]);
      // (the triangle's base lies on the surface: its apex points back up the leader, as ASME draws it)
      out[out.length - 1].pts = [[tip[0] + u[1] * 1.5 * k, tip[1] - u[0] * 1.5 * k], [tip[0] - u[1] * 1.5 * k, tip[1] + u[0] * 1.5 * k], base];
    } else {
      var fh = 7 * k, cw = 8 * k, y0 = p[1] - fh / 2, y1 = p[1] + fh / 2, x = p[0], mr = 1.7 * k, gap = 0.8 * k;
      var cells = [x];
      // characteristic cell
      var c0 = [x + cw / 2, p[1]], q = 1.8 * k;
      gtolGlyph(s.char, c0, q, ln, circ, fill, out, L, s.id);
      x += cw; cells.push(x);
      // tolerance cell: [Ø] value [(M)]
      var tt = (s.dia ? 'Ø' : '') + s.tol, tw2 = textWidth(tt, h);
      tx([x + 1.5 * k, p[1] - h / 2], tt, 'start');
      x += 1.5 * k + tw2;
      if (s.mod) { x += gap; circ([x + mr, p[1]], mr); tx([x + mr, p[1] - 1.1 * k], s.mod, 'middle', 2.2 * k); x += 2 * mr; }
      x += 1.5 * k; cells.push(x);
      (s.datums || []).forEach(function (dn) {
        var dr = datumRef(dn), w = textWidth(dr.ref, h) + 3 * k + (dr.mod ? 2 * mr + gap : 0);
        w = Math.max(w, cw);
        var tx0 = x + (w - textWidth(dr.ref, h) - (dr.mod ? 2 * mr + gap : 0)) / 2;
        tx([tx0, p[1] - h / 2], dr.ref, 'start');
        if (dr.mod) { var mc = [tx0 + textWidth(dr.ref, h) + gap + mr, p[1]]; circ(mc, mr); tx([mc[0], p[1] - 1.1 * k], dr.mod, 'middle', 2.2 * k); }
        x += w; cells.push(x);
      });
      ln([cells[0], y0], [x, y0]); ln([x, y0], [x, y1]); ln([x, y1], [cells[0], y1]); ln([cells[0], y1], [cells[0], y0]);
      for (var ci = 1; ci < cells.length - 1; ci++) ln([cells[ci], y0], [cells[ci], y1]);
      if (s.leader) {
        // from the nearer end of the frame, a short shoulder, then to the arrow
        var left = s.leader[0] < (cells[0] + x) / 2, at = left ? [cells[0], p[1]] : [x, p[1]], sh = [at[0] + (left ? -3 : 3) * k, p[1]];
        ln(at, sh); ln(sh, s.leader); arrow(s.leader, sh);
      }
    }
    var r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    function grow(q) { r.x0 = Math.min(r.x0, q[0]); r.x1 = Math.max(r.x1, q[0]); r.y0 = Math.min(r.y0, q[1]); r.y1 = Math.max(r.y1, q[1]); }
    out.forEach(function (x2) {
      if (x2.a) { grow(x2.a); grow(x2.b); }
      if (x2.k === 'circle') { grow([x2.c[0] - x2.r, x2.c[1] - x2.r]); grow([x2.c[0] + x2.r, x2.c[1] + x2.r]); }
      if (x2.k === 'arc') { grow([x2.c[0] - x2.r, x2.c[1] - x2.r]); grow([x2.c[0] + x2.r, x2.c[1] + x2.r]); }
      if (x2.k === 'fill') x2.pts.forEach(grow);
      if (x2.k === 'text') { var w2 = textWidth(x2.text, x2.h), s0 = x2.anchor === 'middle' ? -w2 / 2 : x2.anchor === 'end' ? -w2 : 0; grow([x2.p[0] + s0, x2.p[1]]); grow([x2.p[0] + s0 + w2, x2.p[1] + x2.h]); }
    });
    return { prims: out, box: r, text: symbolText(s) };
  }
  // the geometric characteristic symbols (ASME Y14.5) drawn about c, half-size q
  function gtolGlyph(ch, c, q, ln, circ, fill, out, L, id) {
    function P(x, y) { return [c[0] + x * q, c[1] + y * q]; }
    function arc(cx, cy, r, a0, a1) { out.push({ k: 'arc', c: P(cx, cy), r: r * q, a0: a0, a1: a1, layer: L, style: 'thin', symbol: id }); }
    function arrowUp(a, b) { var d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(d[0], d[1]), u = [d[0] / n, d[1] / n], w = 0.25 * q; fill([b, [b[0] - u[0] * 0.6 * q + u[1] * w, b[1] - u[1] * 0.6 * q - u[0] * w], [b[0] - u[0] * 0.6 * q - u[1] * w, b[1] - u[1] * 0.6 * q + u[0] * w]]); }
    switch (ch) {
      case 'straightness': ln(P(-1, 0), P(1, 0)); break;
      case 'flatness': ln(P(-1, -0.55), P(0.45, -0.55)); ln(P(0.45, -0.55), P(1, 0.55)); ln(P(1, 0.55), P(-0.45, 0.55)); ln(P(-0.45, 0.55), P(-1, -0.55)); break;
      case 'circularity': circ(c, 0.9 * q); break;
      case 'cylindricity': circ(c, 0.6 * q); ln(P(-1, -0.9), P(-0.2, 0.9)); ln(P(0.2, -0.9), P(1, 0.9)); break;
      case 'profileLine': arc(0, -0.45, 0.95, 0, 180); break;
      case 'profileSurface': arc(0, -0.45, 0.95, 0, 180); ln(P(-0.95, -0.45), P(0.95, -0.45)); break;
      case 'perpendicularity': ln(P(-0.9, -0.8), P(0.9, -0.8)); ln(P(0, -0.8), P(0, 0.9)); break;
      case 'parallelism': ln(P(-0.9, -0.8), P(-0.1, 0.8)); ln(P(0.1, -0.8), P(0.9, 0.8)); break;
      case 'angularity': ln(P(-0.9, -0.8), P(0.9, -0.8)); ln(P(-0.9, -0.8), P(0.7, 0.8)); break;
      case 'concentricity': circ(c, 0.4 * q); circ(c, 0.9 * q); break;
      case 'symmetry': ln(P(-1, 0), P(1, 0)); ln(P(-0.6, 0.5), P(0.6, 0.5)); ln(P(-0.6, -0.5), P(0.6, -0.5)); break;
      case 'circularRunout': ln(P(-0.5, -0.9), P(0.5, 0.9)); arrowUp(P(-0.5, -0.9), P(0.5, 0.9)); break;
      case 'totalRunout': ln(P(-0.9, -0.9), P(0.9, -0.9)); ln(P(-0.9, -0.9), P(-0.2, 0.9)); ln(P(0, -0.9), P(0.7, 0.9)); arrowUp(P(-0.9, -0.9), P(-0.2, 0.9)); arrowUp(P(0, -0.9), P(0.7, 0.9)); break;
      default: circ(c, 0.6 * q); ln(P(-1, 0), P(1, 0)); ln(P(0, -1), P(0, 1));   // position
    }
  }
  D.GTOL_CHARS = GTOL_CHARS; D.SF_SYMBOLS = SF_SYMBOLS; D.nextDatum = nextDatum; D.addSymbol = addSymbol; D.findSymbol = findSymbol; D.editSymbol = editSymbol; D.deleteSymbol = deleteSymbol;
  D.symbolText = symbolText; D.symbolPrims = symbolPrims; D.datumRef = datumRef;

  D.addNote = addNote; D.followViews = followViews; D.findNote = findNote; D.editNote = editNote; D.deleteNote = deleteNote; D.flatAnnotation = flatAnnotation;
  D.holeSizeNames = holeSizeNames;
  D.smartDim = smartDim; D.addSmartDim = addSmartDim; D.measurePair = measurePair; D.finishAngles = finishAngles; D._anglePrims = anglePrims;
  _.holeEnds = holeEnds; _.finishAngles = finishAngles; _.refPos = refPos; _.reattachUserDim = reattachUserDim; _.partThreads = partThreads; _.threadsAlong = threadsAlong; _.annotationPrims = annotationPrims;
})(Drawing, Drawing._);
