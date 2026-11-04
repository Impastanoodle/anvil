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
  // (rfDD) Hole Callout on a slot (SolidWorks: the callout of a slot picked by its end arc or, for an arc slot, its side
  // arc): slotAt(pr, c, r) -> { end (the end arc the leader goes to), slot: { w, len } | { arc, R, w, angle, center } }
  // or null, from the slots the projection shows (Drawing.slotsIn / arcSlotsIn, as Model Items finds them).
  // addSlotCallout(doc, viewId, pr, { c, r, lead? }) puts a slot callout on the view as a dimension (kind 'rad' with
  // slot, slotCallout: true: the same "W X L SLOT" / "R… ARC SLOT … WIDE …°" text, tolerance and drag as a model
  // item's); each compute finds its slot again by the end arc (reattachUserDim), so a resized slot reads its new size.
  function slotAt(pr, c, r) {
    if (!pr || !pr.arcs || !D.slotsIn) return null;
    var b = pr.bounds, tol = 1e-6 * Math.max(1e-9, b.umax - b.umin, b.vmax - b.vmin) * 10;
    function same(a) { return Math.abs(a.r - r) <= tol && Math.hypot(a.c[0] - c[0], a.c[1] - c[1]) <= tol; }
    var hit = null;
    D.slotsIn(pr).forEach(function (s) { if (!hit && (same(s.ends[0]) || same(s.ends[1]))) hit = { end: same(s.ends[1]) ? s.ends[1] : s.ends[0], slot: { w: s.w, len: s.len } }; });
    if (!hit && D.arcSlotsIn) D.arcSlotsIn(pr).forEach(function (s) {
      if (hit || !(same(s.ends[0]) || same(s.ends[1]) || s.sides.some(same))) return;
      hit = { end: same(s.ends[1]) ? s.ends[1] : s.ends[0], slot: { arc: true, R: s.R, w: s.w, angle: s.angle, center: s.center.slice() } };
    });
    return hit;
  }
  function addSlotCallout(doc, viewId, pr, spec) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    var hit = spec && spec.c && spec.r > 0 ? slotAt(pr, spec.c, +spec.r) : null;
    if (!hit) throw new Error('That arc is not the end of a slot');
    var e = hit.end, d = { kind: 'rad', c: e.c.slice(), r: e.r, a0: e.a0, a1: e.a1, value: e.r, slot: hit.slot, slotCallout: true };
    if (spec.lead) d.lead = [+spec.lead[0], +spec.lead[1]];
    (v.dims || (v.dims = [])).push(d);
    return d;
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
  // ------------------------------------------------------------------ rfGT: Autodimension (drawing)
  // gtStations(pr, dir) -> [{ pos, ref, pick }] along the view's u (dir 'h') or v ('v'), one per place, ordered: the
  // straight edges across that direction (the longest of each place), then the holes at a place no edge holds.
  // ref is what addOrdinate / addBaseline take, pick what smartDim takes.
  function gtStations(pr, dir) {
    var ax = dir === 'h' ? 0 : 1, xs = [];
    (pr.lines.visible || []).forEach(function (l) { xs.push(Math.abs(l[0]), Math.abs(l[1]), Math.abs(l[2]), Math.abs(l[3])); });
    (pr.circles.visible || []).forEach(function (c) { xs.push(Math.abs(c.c[0]), Math.abs(c.c[1])); });
    var size = xs.length ? Math.max.apply(null, xs) : 1, tol = 1e-7 * (1 + size), out = [];
    function at(pos) { return out.filter(function (q) { return Math.abs(q.pos - pos) <= tol * 10; })[0]; }
    (pr.lines.visible || []).forEach(function (l) {
      if (Math.abs(l[ax] - l[ax + 2]) > tol) return;
      var a = [l[0], l[1]], b = [l[2], l[3]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), q = at(l[ax]);
      if (!(L > tol)) return;
      if (!q) out.push({ pos: l[ax], L: L, ref: { a: a, b: b }, pick: { edge: [a, b] } });
      else if (L > q.L) { q.L = L; q.ref = { a: a, b: b }; q.pick = { edge: [a, b] }; }
    });
    (pr.circles.visible || []).forEach(function (c) {
      if (!at(c.c[ax])) out.push({ pos: c.c[ax], L: 0, ref: { c: c.c.slice(), r: c.r }, pick: { circle: { c: c.c.slice(), r: c.r } } });
    });
    return out.sort(function (x, y) { return x.pos - y.pos; });
  }
  // autodimension(doc, viewId, proj, { h: { scheme: 'baseline' | 'chain' | 'ordinate', origin: 'left' | 'right', place:
  // 'above' | 'below' }, v: { scheme, origin: 'bottom' | 'top', place: 'left' | 'right' }, scale, units }) -> the
  // number of dimensions added (SolidWorks: Autodimension, All entities in view). Every edge and hole position is
  // dimensioned from the origin side; a direction left out is skipped. They are ordinary view dimensions.
  function autodimension(doc, viewId, pr, opts) {
    var n = 0, sc = +opts.scale > 0 ? +opts.scale : 1, gap = (opts.units === 'in' ? 0.5 : 12) / sc;
    ['h', 'v'].forEach(function (dir) {
      var o = opts[dir];
      if (!o || !o.scheme || o.scheme === 'none') return;
      var st = gtStations(pr, dir), ax = dir === 'h' ? 1 : 0, far = o.origin === 'right' || o.origin === 'top';
      var side = o.place === 'below' || o.place === 'left' ? -1 : 1;
      if (st.length < 2) return;
      if (far) st.reverse();
      if (o.scheme !== 'chain') {
        (o.scheme === 'ordinate' ? addOrdinate : addBaseline)(doc, viewId, { dir: dir, base: st[0].ref, refs: st.slice(1).map(function (q) { return q.ref; }), side: side });
        n += st.length - 1;
        return;
      }
      var cross = [];
      (pr.lines.visible || []).forEach(function (l) { cross.push(l[ax], l[ax + 2]); });
      (pr.circles.visible || []).forEach(function (c) { cross.push(c.c[ax] - c.r, c.c[ax] + c.r); });
      var edge = side > 0 ? Math.max.apply(null, cross) + gap : Math.min.apply(null, cross) - gap;
      st.slice(1).forEach(function (q, i) {
        var mid = (q.pos + st[i].pos) / 2;
        if (addSmartDim(doc, viewId, st[i].pick, q.pick, dir === 'h' ? [mid, edge] : [edge, mid], { lock: dir, scale: sc })) n++;
      });
    });
    return n;
  }
  D.autodimension = autodimension;
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
    if (d.kind === 'angrun' || d.kind === 'pathlen') return reattachCT(d, pr);   // (lane CT)
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
      // (rfS) a Smart Dimension between two picks: reattach each, then measure again (lane CT2: an angle's two lines
      // follow their edges when the angle between them changes)
      var okR = d.kind === 'angle' ? ctReattachLines(d.refs, pr) : d.refs.map(function (r) { return reattachRef(r, pr); }).every(Boolean);
      if (okR) { delete d.dangling; measurePair(d); } else d.dangling = true;
      return okR;
    }
    if (d.slotCallout) {   // (rfDD) a slot callout: its end arc, then the slot's size again
      var okS = reattachDim(d, pr), hs = okS ? slotAt(pr, d.c, d.r) : null;
      if (hs) { d.slot = Object.assign({}, hs.slot, d.slot && d.slot.props ? { props: d.slot.props } : {}); d.a0 = hs.end.a0; d.a1 = hs.end.a1; d.value = d.r; delete d.dangling; }
      else d.dangling = true;
      return !!hs;
    }
    return reattachDim(d, pr);
  }
  // (rfS) one reference of a two-pick dimension: a circle / arc (by centre and radius), an edge, or a point (a vertex:
  // the nearest end of a visible edge or circle centre within a thousandth of the view size, else it is gone)
  function reattachRef(r, pr) {
    if (r.kind === 'pt') {
      var b = pr.bounds, tol = Math.max(1e-9, Math.hypot(b.umax - b.umin, b.vmax - b.vmin)) * 1e-3, best = null, bd = tol;
      (pr.all || []).forEach(function (m) { [[m[0], m[1]], [m[2], m[3]]].forEach(function (q) { var dd = Math.hypot(q[0] - r.p[0], q[1] - r.p[1]); if (dd <= bd) { bd = dd; best = q; } }); });
      (pr.circlesAll || []).concat(pr.arcsAll || [], pr.ellipses ? (pr.ellipses.visible || []).concat(pr.ellipses.hidden || []) : []).forEach(function (c) { var dd = Math.hypot(c.c[0] - r.p[0], c.c[1] - r.p[1]); if (dd <= bd) { bd = dd; best = c.c.slice(); } });
      if (!best) return false;
      r.p = best.slice();
      return true;
    }
    if (r.kind === 'arc') { var ra = { kind: 'rad', c: r.c, r: r.r, a0: r.a0, a1: r.a1, ell: r.ell }, ok = reattachDim(ra, pr); if (ok) { r.c = ra.c; r.r = ra.r; if (r.ell) r.ell = ra.ell; } return ok; }
    if (r.kind === 'dia') { var rc = { kind: 'dia', c: r.c, r: r.r, ell: r.ell }, ok2 = reattachDim(rc, pr); if (ok2) { r.c = rc.c; r.r = rc.r; if (r.ell) r.ell = rc.ell; } return ok2; }
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
  // (rfAL) a circle seen obliquely is an ellipse c + cos t ax + sin t ay (ax, ay: the projections of the circle's two
  // radii, conjugate semi-diameters); its semi-major axis is the circle's true radius (an orthographic projection keeps
  // the diameter that lies square to the view direction): sqrt((s + sqrt(s² - 4 p²)) / 2), s = |ax|² + |ay|², p = |ax × ay|
  function ellipseRadius(ax, ay) {
    var s = ax[0] * ax[0] + ax[1] * ax[1] + ay[0] * ay[0] + ay[1] * ay[1], p = Math.abs(ax[0] * ay[1] - ax[1] * ay[0]);
    return Math.sqrt((s + Math.sqrt(Math.max(0, s * s - 4 * p * p))) / 2);
  }
  D.ellipseRadius = ellipseRadius;
  function pickRef(pk) {
    if (pk.edge) return refFrom({ a: pk.edge[0], b: pk.edge[1] });
    // (rfAL) an ellipse (a hole seen in a True / pictorial view): its true diameter, or radius when it is a part arc
    if (pk.ellipse) {
      var el = pk.ellipse, ell = { ax: [+el.ax[0], +el.ax[1]], ay: [+el.ay[0], +el.ay[1]] };
      if (!el.full) { ell.t0 = +el.t0; ell.t1 = +el.t1; }
      return { kind: el.full ? 'dia' : 'arc', c: [+el.c[0], +el.c[1]], r: ellipseRadius(ell.ax, ell.ay), ell: ell };
    }
    if (pk.circle) return { kind: 'dia', c: [+pk.circle.c[0], +pk.circle.c[1]], r: +pk.circle.r };
    if (pk.arc) return { kind: 'arc', c: [+pk.arc.c[0], +pk.arc.c[1]], r: +pk.arc.r, a0: pk.arc.a0, a1: pk.arc.a1 };
    if (pk.center) return { kind: 'pt', p: [+pk.center.c[0], +pk.center.c[1]], center: true };
    if (pk.point) return { kind: 'pt', p: [+pk.point[0], +pk.point[1]] };
    return null;
  }
  // (rfAL) how far from an ellipse's centre its outline is along direction w (any length): 1 / |M⁻¹ ŵ|, M = [ax ay]
  function ellipseReach(ell, w) {
    var L = Math.hypot(w[0], w[1]) || 1, u = [w[0] / L, w[1] / L], ax = ell.ax, ay = ell.ay, det = ax[0] * ay[1] - ax[1] * ay[0];
    if (Math.abs(det) < 1e-300) return Math.hypot(ax[0], ax[1]) + Math.hypot(ay[0], ay[1]);
    var x = (u[0] * ay[1] - u[1] * ay[0]) / det, y = (ax[0] * u[1] - ax[1] * u[0]) / det;
    return 1 / Math.hypot(x, y);
  }
  D.ellipseReach = ellipseReach;
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
    if (opts.lock === 'h' || opts.lock === 'v') return lockedDim(p1, p2, at, opts);   // (lane CT) Horizontal / Vertical Dimension
    var sc = +opts.scale > 0 ? +opts.scale : 1, r1 = p1 && pickRef(p1), r2 = p2 && pickRef(p2), d;
    if (!r1) return null;
    if (!r2) {
      if (r1.kind === 'dia' || r1.kind === 'arc') {
        d = r1.kind === 'dia' ? { kind: 'dia', c: r1.c.slice(), r: r1.r, count: 1, value: 2 * r1.r } : { kind: 'rad', c: r1.c.slice(), r: r1.r, a0: r1.a0, a1: r1.a1, count: 1, value: r1.r };
        if (r1.ell) { d.ell = JSON.parse(JSON.stringify(r1.ell)); if (d.kind === 'rad') { delete d.a0; delete d.a1; } }   // (rfAL) true size of an ellipse
        if (at && Math.hypot(at[0] - r1.c[0], at[1] - r1.c[1]) > (r1.ell ? ellipseReach(r1.ell, [at[0] - r1.c[0], at[1] - r1.c[1]]) : r1.r) * 1.05) d.lead = [(at[0] - r1.c[0]) * sc, (at[1] - r1.c[1]) * sc];
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
  // (lane CA) and which side of the extension lines the click was on, along the dimension: d.tside 0 between them (the
  // text stays between them when it fits there, the arrows going outside when they do not: SolidWorks), -1 / 1 before
  // the low end / past the high end (h: u, v: v, aligned: from a to b; the text goes outside on that side)
  function placeLinear(d, at, sc) {
    if (!at) return d;
    var al = null, lo = 0, hi = 0;
    if (d.kind === 'h') { d.at = at[1]; d.side = at[1] >= (d.a[1] + d.b[1]) / 2 ? 1 : -1; al = at[0]; lo = Math.min(d.a[0], d.b[0]); hi = Math.max(d.a[0], d.b[0]); }
    else if (d.kind === 'v') { d.at = at[0]; d.side = at[0] >= (d.a[0] + d.b[0]) / 2 ? 1 : -1; al = at[1]; lo = Math.min(d.a[1], d.b[1]); hi = Math.max(d.a[1], d.b[1]); }
    else if (d.kind === 'aligned') {
      var t = unit([d.b[0] - d.a[0], d.b[1] - d.a[1]]), n = [-t[1], t[0]], o = ((at[0] - d.a[0]) * n[0] + (at[1] - d.a[1]) * n[1]) * sc;
      if (Math.abs(o) > 1e-9) d.off = o;
      al = (at[0] - d.a[0]) * t[0] + (at[1] - d.a[1]) * t[1]; hi = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
    }
    if (al != null) d.tside = al < lo - 1e-9 ? -1 : al > hi + 1e-9 ? 1 : 0;
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
  // ------------------------------------------------------------------ lane CT: locked, running angle, path length
  // Horizontal / Vertical Dimension (the Smart Dimension flyout): Smart Dimension's picks, the dimension held
  // horizontal (lock 'h': the distance along the view's u) or vertical ('v': along v) wherever the pointer is. One
  // circle: its width across (two references to it, measured side to side: minmax 'max'); one arc: the run between
  // its ends (two point references); one edge: its run
  // along the lock; two picks: a linear dimension of that kind between them (an edge gives its end nearer the other
  // pick, measurePair). The record is an ordinary linear dimension (kind 'h' | 'v') with d.lock.
  function lockedDim(p1, p2, at, opts) {
    var lk = opts.lock, sc = +opts.scale > 0 ? +opts.scale : 1, r1 = p1 && pickRef(p1), r2 = p2 && pickRef(p2), d;
    if (!r1) return null;
    if (!r2) {
      if (r1.kind === 'dia' && !r1.ell) d = { kind: lk, lock: lk, refs: [r1, JSON.parse(JSON.stringify(r1))], minmax: 'max' };
      // an arc (a bend, a corner fillet): the run between its two ends (R.250 quarter round: .250), not its full width
      else if (r1.kind === 'arc' && !r1.ell && r1.a0 != null && r1.a1 != null) {
        var e0 = r1.a0 * Math.PI / 180, e1 = r1.a1 * Math.PI / 180;
        d = { kind: lk, lock: lk, refs: [{ kind: 'pt', p: [r1.c[0] + r1.r * Math.cos(e0), r1.c[1] + r1.r * Math.sin(e0)] }, { kind: 'pt', p: [r1.c[0] + r1.r * Math.cos(e1), r1.c[1] + r1.r * Math.sin(e1)] }] };
      }
      else if (isEdgeRef(r1)) {
        var a = r1.a.slice(), b = r1.b.slice(), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        d = { kind: lk, lock: lk, a: a, b: b, value: lk === 'h' ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]) };
        if (!(d.value > L * 1e-9 + 1e-12)) return null;   // a vertical edge has no horizontal run
        return placeLinear(d, at, sc);
      } else return null;   // a point alone measures nothing
    } else {
      d = { kind: lk, lock: lk, refs: [r1, r2] };
      if ((opts.minmax === 'min' || opts.minmax === 'max') && !(isEdgeRef(r1) && isEdgeRef(r2))) d.minmax = opts.minmax;
    }
    measurePair(d);
    if (!(d.value > 1e-12)) return null;
    return placeLinear(d, at, sc);
  }
  // Angular Running Dimension: a base line (0°), then lines or holes round one vertex, each read as its angle from the
  // base, running one way (0°, 30°, 75° …), in one group record like an ordinate set:
  // { kind: 'angrun', base: edge ref, refs: [edge | circle refs], cw? (running clockwise; chosen when the first pick is
  // past 180° counter-clockwise), cFix? (a vertex the caller gave), rad? (the arc's radius, model units) }. Measured
  // (angRunMeasure, at every render): c (the vertex: where the base line meets the first line not parallel to it; holes
  // only: the base line's end the holes are most evenly round), u (unit directions from c: the base's, then each
  // reference's, toward an edge's far end or a hole's centre), values (degrees, one per reference), value (the last).
  function ctLineMeet(r1, r2) {
    var t1 = [r1.b[0] - r1.a[0], r1.b[1] - r1.a[1]], t2 = [r2.b[0] - r2.a[0], r2.b[1] - r2.a[1]], cr = t1[0] * t2[1] - t1[1] * t2[0];
    if (!(Math.abs(cr) > Math.hypot(t1[0], t1[1]) * Math.hypot(t2[0], t2[1]) * 1e-9)) return null;
    var w = [r2.a[0] - r1.a[0], r2.a[1] - r1.a[1]], s = (w[0] * t2[1] - w[1] * t2[0]) / cr;
    return [r1.a[0] + t1[0] * s, r1.a[1] + t1[1] * s];
  }
  function angRunVertex(d) {
    var c = null;
    d.refs.some(function (r) { if (isEdgeRef(r)) c = ctLineMeet(d.base, r); return !!c; });
    if (c) return c;
    var cs = d.refs.filter(function (r) { return r.c; }).map(function (r) { return r.c; });
    if (!cs.length) return null;
    function spread(p) {
      var ds = cs.map(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1]); }), m = ds.reduce(function (s, x) { return s + x; }, 0) / ds.length;
      return ds.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) - m * 1e-9;   // (a tie: the end farther from the holes)
    }
    return spread(d.base.a) <= spread(d.base.b) ? d.base.a.slice() : d.base.b.slice();
  }
  function angRunMeasure(d) {
    var c = d.cFix ? d.cFix.slice() : angRunVertex(d);
    if (!c) { d.dangling = true; return d; }
    d.c = c;
    function dirOf(r) {
      var q = r.c ? r.c : Math.hypot(r.a[0] - c[0], r.a[1] - c[1]) >= Math.hypot(r.b[0] - c[0], r.b[1] - c[1]) ? r.a : r.b;
      return unit([q[0] - c[0], q[1] - c[1]]);
    }
    var u0 = dirOf(d.base);
    d.u = [u0];
    d.values = d.refs.map(function (r) {
      var u = dirOf(r), a = Math.atan2(u0[0] * u[1] - u0[1] * u[0], u0[0] * u[0] + u0[1] * u[1]) * 180 / Math.PI;
      d.u.push(u);
      if (d.cw) a = -a;
      if (a < 0) a += 360;
      if (a > 360 - 1e-7) a = 0;
      return a;
    });
    d.value = d.values.length ? d.values[d.values.length - 1] : 0;
    return d;
  }
  // addAngularRunning(doc, viewId, { base: { a, b }, refs: [{ a, b } | { c, r }], c?, cw?, rad? }) -> the dimension
  function addAngularRunning(doc, viewId, spec) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    if (!spec || !spec.base || !spec.base.a || !spec.base.b || !(spec.refs || []).length) throw new Error('An angular running dimension needs a base line and at least one more line or hole');
    var d = { kind: 'angrun', base: refFrom(spec.base), refs: spec.refs.map(refFrom) };
    if (spec.c) d.cFix = [+spec.c[0], +spec.c[1]];
    angRunMeasure(d);
    if (!d.c) throw new Error('The lines picked are parallel to the base line: there is no vertex to measure round');
    if (d.values.some(function (x) { return x < 1e-6; })) throw new Error('A line or hole picked lies along the base line (0°)');
    if (spec.cw != null ? !!spec.cw : d.values[0] > 180 + 1e-9) { d.cw = true; angRunMeasure(d); }
    if (+spec.rad > 0) d.rad = +spec.rad;
    delete d.dangling;
    (v.dims || (v.dims = [])).push(d);
    return d;
  }
  // Path Length Dimension: the total length of a chain of edges, as the sketch's (sketch-solver.js rfaqPathLen): a line
  // its length, an arc r × its sweep, a whole circle 2πr. { kind: 'pathlen', refs: [edge | { kind: 'rad', c, r, a0, a1 }
  // (an arc, degrees counter-clockwise) | { kind: 'dia', c, r }], value, lead? (paper offset of the text's leader elbow
  // from the first entity's middle) }. Drawn as SolidWorks does: the value on a leader from the first entity, no
  // dimension lines (ctDimPrims). Each entity after the first meets one picked before it end to end.
  function pathRefFrom(x) {
    if (x.kind === 'rad' || (x.c && x.a0 != null && x.a1 != null)) return { kind: 'rad', c: [+x.c[0], +x.c[1]], r: +x.r, a0: +x.a0, a1: +x.a1 };
    return refFrom(x);
  }
  function arcSweep(r) { var s = ((r.a1 - r.a0) % 360 + 360) % 360; return s < 1e-9 ? 360 : s; }
  function pathLengthOf(refs) {
    return refs.reduce(function (t, r) {
      if (r.kind === 'dia') return t + 2 * Math.PI * r.r;
      if (r.kind === 'rad') return t + r.r * arcSweep(r) * Math.PI / 180;
      return t + Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
    }, 0);
  }
  function arcPoint(r, deg) { var a = deg * Math.PI / 180; return [r.c[0] + r.r * Math.cos(a), r.c[1] + r.r * Math.sin(a)]; }
  function pathRefEnds(r) {
    if (r.kind === 'dia') return [];
    if (r.kind === 'rad') return [arcPoint(r, r.a0), arcPoint(r, r.a0 + arcSweep(r))];
    return [r.a, r.b];
  }
  function pathRefMid(r) {
    if (r.kind === 'dia') return arcPoint(r, 45);
    if (r.kind === 'rad') return arcPoint(r, r.a0 + arcSweep(r) / 2);
    return [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
  }
  // pathChained(refs) -> the index of the first entity that meets none picked before it end to end (-1: a chain)
  function pathChained(refs) {
    var pts = [];
    refs.forEach(function (r) { pts = pts.concat(pathRefEnds(r), r.c ? [r.c] : []); });
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var tol = Math.max(1e-9, 2e-3 * Math.hypot(x1 - x0, y1 - y0));
    for (var i = 1; i < refs.length; i++) {
      var e = pathRefEnds(refs[i]), ok = false;
      for (var j = 0; j < i && !ok; j++) pathRefEnds(refs[j]).forEach(function (q) { e.forEach(function (p) { if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol) ok = true; }); });
      if (!ok) return i;
    }
    return -1;
  }
  // addPathLength(doc, viewId, { refs: [{ a, b } | { c, r, a0, a1 } | { c, r }], lead? }) -> the dimension
  function addPathLength(doc, viewId, spec) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    var refs = (spec && spec.refs || []).map(pathRefFrom);
    if (!refs.length) throw new Error('A path length dimension needs at least one line or arc');
    if (pathChained(refs) >= 0) throw new Error('The edges of a path length must join end to end');
    var d = { kind: 'pathlen', refs: refs, value: pathLengthOf(refs) };
    if (spec.lead) d.lead = [+spec.lead[0], +spec.lead[1]];
    (v.dims || (v.dims = [])).push(d);
    return d;
  }
  // (lane CT2) the lines of an angle follow the same model edge when its angle changes (SolidWorks): an edge still
  // collinear with where it was reattaches as any edge does (reattachDim); else the visible / hidden edge that keeps one
  // of its old ends (the vertex the angle turns about) and whose direction is nearest the old one, not one already
  // taken by a sibling line, not lying along one; else reattachDim (an edge moved parallel). The projection carries no
  // edge ids, so the shared vertex is the identity. The kept end stays first (a stays a), so an angle's sides keep
  // their sense. refs: the edge references of one dimension, in order; returns whether all were found.
  function ctReattachLines(refs, pr) {
    var b = pr.bounds, size = Math.max(1e-9, Math.hypot(b.umax - b.umin, b.vmax - b.vmin)), tol = size * 1e-6, vtol = size * 1e-4, taken = [];
    function dirOf(a, c) { return unit([c[0] - a[0], c[1] - a[1]]); }
    function collinear(r) {
      var t = dirOf(r.a, r.b), L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]);
      return (pr.all || []).some(function (m) {
        var o0 = Math.abs((m[0] - r.a[0]) * t[1] - (m[1] - r.a[1]) * t[0]), o1 = Math.abs((m[2] - r.a[0]) * t[1] - (m[3] - r.a[1]) * t[0]);
        if (o0 > tol || o1 > tol) return false;
        var p0 = (m[0] - r.a[0]) * t[0] + (m[1] - r.a[1]) * t[1], p1 = (m[2] - r.a[0]) * t[0] + (m[3] - r.a[1]) * t[1];
        return Math.min(Math.max(p0, p1), L) - Math.max(Math.min(p0, p1), 0) > tol;
      });
    }
    var old = refs.map(function (r) { return isEdgeRef(r) ? { a: r.a.slice(), b: r.b.slice() } : null; });
    var oks = refs.map(function (r) {
      if (!isEdgeRef(r)) return reattachDim(r, pr);
      var ok = false;
      if (collinear(r)) { var re = { kind: r.kind, a: r.a, b: r.b, value: r.value }; ok = reattachDim(re, pr); if (ok) { r.a = re.a; r.b = re.b; r.value = re.value; } }
      if (!ok) {
        var t0 = dirOf(r.a, r.b), best = null, bs = Infinity;
        (pr.all || []).forEach(function (m) {
          var q0 = [m[0], m[1]], q1 = [m[2], m[3]];
          if (Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) <= tol) return;
          [[r.a, 1], [r.b, -1]].forEach(function (end) {
            var V = end[0], keep = null, other = null;
            if (Math.hypot(q0[0] - V[0], q0[1] - V[1]) <= vtol) { keep = q0; other = q1; } else if (Math.hypot(q1[0] - V[0], q1[1] - V[1]) <= vtol) { keep = q1; other = q0; }
            if (!keep) return;
            var u = dirOf(keep, other), want = [t0[0] * end[1], t0[1] * end[1]];
            if (taken.some(function (x) { return Math.abs(x[0] * u[1] - x[1] * u[0]) < 1e-9; })) return;   // along a sibling line
            var s = Math.acos(Math.max(-1, Math.min(1, u[0] * want[0] + u[1] * want[1])));
            if (s < bs - 1e-12) { bs = s; best = end[1] > 0 ? { a: keep.slice(), b: other.slice() } : { a: other.slice(), b: keep.slice() }; }
          });
        });
        if (best && bs < Math.PI / 2) { var nr = refFrom(best); r.a = nr.a; r.b = nr.b; r.kind = nr.kind; r.value = nr.value; ok = true; }
      }
      if (!ok) { var rg = { kind: r.kind, a: r.a, b: r.b, value: r.value }; ok = reattachDim(rg, pr); if (ok) { r.a = rg.a; r.b = rg.b; r.value = rg.value; } }
      if (ok) taken.push(dirOf(r.a, r.b));
      return ok;
    });
    // (rfDN) the shared vertex itself moved (both ends of the turned edge moved): the vertex the lost line shared with
    // a sibling that was found is now the sibling's end nearest where it was; the lost line is the edge from there
    // whose direction is nearest its old one (within 45°, not along a sibling). Only an edge that is gone dangles.
    oks.forEach(function (ok, i) {
      if (ok || !old[i]) return;
      var r = refs[i];
      for (var j = 0; j < refs.length && !oks[i]; j++) {
        if (j === i || !oks[j] || !old[j] || !isEdgeRef(refs[j])) continue;
        var V = null, sense = 0;
        [[old[i].a, 1], [old[i].b, -1]].forEach(function (e) { [old[j].a, old[j].b].forEach(function (q) { if (!V && Math.hypot(e[0][0] - q[0], e[0][1] - q[1]) <= vtol) { V = e[0]; sense = e[1]; } }); });
        if (!V) continue;
        var sj = refs[j], Vn = Math.hypot(sj.a[0] - V[0], sj.a[1] - V[1]) <= Math.hypot(sj.b[0] - V[0], sj.b[1] - V[1]) ? sj.a : sj.b;
        var t0 = dirOf(old[i].a, old[i].b), want = [t0[0] * sense, t0[1] * sense], best = null, bs = Infinity;
        (pr.all || []).forEach(function (m) {
          var q0 = [m[0], m[1]], q1 = [m[2], m[3]], keep = null, other = null;
          if (Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) <= tol) return;
          if (Math.hypot(q0[0] - Vn[0], q0[1] - Vn[1]) <= vtol) { keep = q0; other = q1; } else if (Math.hypot(q1[0] - Vn[0], q1[1] - Vn[1]) <= vtol) { keep = q1; other = q0; }
          if (!keep) return;
          var u = dirOf(keep, other);
          if (taken.some(function (x) { return Math.abs(x[0] * u[1] - x[1] * u[0]) < 1e-9; })) return;
          var s = Math.acos(Math.max(-1, Math.min(1, u[0] * want[0] + u[1] * want[1])));
          if (s < bs - 1e-12) { bs = s; best = sense > 0 ? { a: keep.slice(), b: other.slice() } : { a: other.slice(), b: keep.slice() }; }
        });
        if (best && bs < Math.PI / 4) { var nr = refFrom(best); r.a = nr.a; r.b = nr.b; r.kind = nr.kind; r.value = nr.value; oks[i] = true; taken.push(dirOf(r.a, r.b)); }
      }
    });
    return oks.every(Boolean);
  }
  function reattachCT(d, pr) {
    var ok = d.kind === 'angrun' ? ctReattachLines([d.base].concat(d.refs), pr) : d.refs.map(function (r) { return reattachDim(r, pr); }).every(Boolean);
    if (ok) delete d.dangling; else d.dangling = true;
    if (d.kind === 'angrun') angRunMeasure(d); else d.value = pathLengthOf(d.refs);
    return ok;
  }
  function ctAngleText(x, prec) { return (prec != null && prec !== '' ? (+x).toFixed(+prec) : fmtAngle(x)) + '°'; }
  // ctDimPrims(d, vw, k, S (sheet sizes: th, ar, aw, gap, ext), units) -> the paper primitives of an angular running or
  // a path length dimension (drawing-render.js dimPrims hands them here). Sets d.radNow / d.leadNow for dragging.
  function ctDimPrims(d, vw, k, S, units) {
    var out = [], L = 'DIMENSIONS', th = S.th;
    function line(a, b) { out.push({ k: 'line', a: a, b: b, layer: L, style: 'thin' }); }
    function arrow(tip, dir) {
      var n = [-dir[1], dir[0]];
      out.push({ k: 'fill', pts: [tip, [tip[0] - dir[0] * S.ar + n[0] * S.aw, tip[1] - dir[1] * S.ar + n[1] * S.aw], [tip[0] - dir[0] * S.ar - n[0] * S.aw, tip[1] - dir[1] * S.ar - n[1] * S.aw]], layer: L });
    }
    var prec = d.prec != null && d.prec !== '' ? +d.prec : null;
    if (d.kind === 'pathlen') {
      var m = vw.toSheet(pathRefMid(d.refs[0])), box = vw.box, cc = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
      var lead = d.lead || [(m[0] >= cc[0] ? 1 : -1) * 10 * k, (m[1] >= cc[1] ? 1 : -1) * 10 * k], el = [m[0] + lead[0], m[1] + lead[1]], lu = Math.hypot(lead[0], lead[1]) || 1, sg = lead[0] >= 0 ? 1 : -1;
      line(m, el); line(el, [el[0] + sg * _.SHOULDER * k, el[1]]); arrow(m, [-lead[0] / lu, -lead[1] / lu]);
      var txt = d.tol || d.label != null ? dimLabel(d, units).text : numText(d.value, units, prec);
      out.push({ k: 'text', p: [el[0] + sg * (_.SHOULDER + _.TEXT_GAP) * k, el[1] - th / 2], h: th, text: txt, anchor: sg > 0 ? 'start' : 'end', layer: L, rot: 0 });
      d.leadNow = lead.slice();
      return out;
    }
    if (d.kind !== 'angrun' || !d.c || !d.u) return out;
    var V0 = vw.toSheet(d.c);
    function dS(u) { var q = vw.toSheet([d.c[0] + u[0], d.c[1] + u[1]]); return unit([q[0] - V0[0], q[1] - V0[1]]); }
    var items = [{ ref: d.base, val: 0, q: dS(d.u[0]) }].concat(d.refs.map(function (r, i) { return { ref: r, val: (d.values || [])[i] || 0, q: dS(d.u[i + 1] || d.u[0]) }; }));
    // the radius: dragged (d.rad), else three quarters of the way to the nearest item's far end / hole centre
    var reachOf = function (it) {
      var r = it.ref;
      if (r.c) return Math.hypot(r.c[0] - d.c[0], r.c[1] - d.c[1]);
      return Math.max(Math.hypot(r.a[0] - d.c[0], r.a[1] - d.c[1]), Math.hypot(r.b[0] - d.c[0], r.b[1] - d.c[1]));
    };
    var rad = d.rad > 0 ? d.rad : 0.75 * Math.min.apply(null, items.map(reachOf)), R = Math.max(6 * k, rad * vw.scale);
    // the running sense on paper (a view may show the model's counter-clockwise either way round)
    var u0 = d.u[0], rot = dS([-u0[1], u0[0]]), q0 = items[0].q, sense = (q0[0] * rot[1] - q0[1] * rot[0] >= 0 ? 1 : -1) * (d.cw ? -1 : 1);
    var th0 = Math.atan2(q0[1], q0[0]), maxV = Math.max.apply(null, items.map(function (it) { return it.val; })) * Math.PI / 180;
    if (maxV > 1e-9) {
      var aLo = sense > 0 ? th0 : th0 - maxV, aHi = sense > 0 ? th0 + maxV : th0;
      out.push({ k: 'arc', c: V0, r: R, a0: aLo * 180 / Math.PI, a1: aHi * 180 / Math.PI, layer: L, style: 'thin' });
    }
    items.forEach(function (it, i) {
      var a = th0 + sense * it.val * Math.PI / 180, q = [Math.cos(a), Math.sin(a)], r = it.ref, lo, hi;
      // the extension line, along the item's direction from where its edge (or hole) stops short of the arc
      if (r.c) { var tc = Math.hypot(r.c[0] - d.c[0], r.c[1] - d.c[1]) * vw.scale, rr = (r.r || 0) * vw.scale; lo = tc - rr; hi = tc + rr; }
      else {
        var A = vw.toSheet(r.a), B = vw.toSheet(r.b), ta = (A[0] - V0[0]) * q[0] + (A[1] - V0[1]) * q[1], tb = (B[0] - V0[0]) * q[0] + (B[1] - V0[1]) * q[1];
        lo = Math.min(ta, tb); hi = Math.max(ta, tb);
      }
      if (!(R >= lo - 1e-9 && R <= hi + 1e-9)) {
        var from = R > hi ? hi + S.gap : lo - S.gap, to = R > hi ? R + S.ext : R - S.ext;
        line([V0[0] + q[0] * from, V0[1] + q[1] * from], [V0[0] + q[0] * to, V0[1] + q[1] * to]);
      }
      var tip = [V0[0] + q[0] * R, V0[1] + q[1] * R];
      if (i > 0 && it.val > 1e-9) arrow(tip, [-sense * q[1], sense * q[0]]);
      // the value just outside the arc, square to the paper
      var text = ctAngleText(it.val, prec), tw = _.textWidth ? _.textWidth(text, th) : text.length * th * 0.78;
      var reach = R + 1.5 * k + Math.abs(q[0]) * tw / 2 + Math.abs(q[1]) * th / 2, C = [V0[0] + q[0] * reach, V0[1] + q[1] * reach];
      out.push({ k: 'text', p: [C[0], C[1] - th / 2], h: th, text: text, anchor: 'middle', layer: L, rot: 0 });
    });
    d.radNow = R / vw.scale;
    return out;
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
      // rfBC: an angle's tolerance is an angle (ASME Y14.5: degrees keep the leading zero, ±0.5°, in inch drawings too);
      // only the lengths of an inch drawing drop it (.500)
      var isAng = d.kind === 'angle';
      var tn = isAng ? function (x) { return (tp != null && +tp >= 0 ? (+x).toFixed(+tp) : fmtAngle(x)) + '°'; } : function (x) { return numText(x, units, tp); };
      if (tol.type === 'symmetric') out.main += ' ±' + tn(plus);
      else if (tol.type === 'bilateral') {
        // (rfM) a zero limit is written at the other limit's precision: inch '-.000' / '+.000' (ASME Y14.5 unilateral,
        // SolidWorks), mm a single '0' with no sign
        var zero = function (other, sign) {
          if (isAng) { var ma = /\.(\d+)/.exec(other); return sign + '0' + (ma ? '.' + new Array(ma[1].length + 1).join('0') : '') + '°'; }
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
  var DIM_PROPS = ['at', 'tx', 'tside', 'lead', 'off', 'flip', 'tol', 'prec', 'label', 'rad'];   // (rad: an angle's arc radius, rfS; tside: placeLinear)
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
    // rfBA: a sketch's own Smart Dimension brought as a model item (d.sketchDim 'sketchId:dimIndex', also in a flat
    // view) takes that dimension's properties directly, never those of another dimension of the same size
    if (d.sketchDim && !d.relSrc) return sketchDimByKey(model, d.sketchDim);
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
  // rfBA: 'sketchId:dimIndex' -> the props of that Smart Dimension (null when it sets none)
  function sketchDimByKey(model, key) {
    var s = String(key), cut = s.lastIndexOf(':'), fid = s.slice(0, cut), i = +s.slice(cut + 1);
    var f = cut > 0 ? (model.features || []).filter(function (x) { return String(x.id) === fid; })[0] : null, x = f && f.dims && f.dims[i];
    return x && hasDimProps(x) ? dimPropsOf(x, f, i + 1) : null;
  }
  // relSrc { f (sketch id), i (relation index) } -> its props ({ …, own: the relation sets one of them }) or null
  // (rfBA: the Chamfer, Path Length and Angular Running dimensions count in the D1, D2 … order too)
  var DIM_RELS = { distance: 1, angle: 1, arclength: 1, chamfer: 1, pathlength: 1, runangle: 1 };
  function relDimProps(model, src) {
    var f = K.findFeature(model, src.f), rel = f && f.rels && f.rels[src.i];
    if (!rel) return null;
    var n = (f.dims || []).length;
    var ST = typeof SketchSolver !== 'undefined' && SketchSolver.TYPES;   // (the sketch's own D1, D2 … order: ui-sketch-dims.js dimList)
    for (var i = 0; i <= src.i; i++) if (f.rels[i] && (ST && ST[f.rels[i].type] ? ST[f.rels[i].type].dim : DIM_RELS[f.rels[i].type])) n++;
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
  // length ('olen', else the centre distance 'len') or centre-line radius ('r') dimensions.
  // rfAF: a slot the Slot tools drew (or Sketch Fillet / Trim exploded: SketchSolver.explodeSlot) is its sides / arcs
  // and a construction centerline (centre-line arc). It is found from that construction entity, the arcs centred on its
  // ends and the sides parallel to it (an arc slot: the outer / inner arcs concentric with it); its dimensions are the
  // centerline's length (an end arc's diameter for the width), the distance relation between the sides (width) or
  // across the end arcs (overall length), the construction arc's R and the radial distance between the inner and the
  // outer arc (width), each with its own tolerance, precision and text.
  function hasSlotDimProps(model) {
    return hasSketchDimProps(model) || !!(model && model.features && model.features.some(function (f) {
      return f.type === 'sketch' && (f.rels || []).some(function (x) { return DIM_RELS[x.type] && hasDimProps(x); });
    }));
  }
  // the parts of the exploded straight slot whose construction centerline is entity c: { caps: [i, j], sides, h (half
  // the width), L (centre distance) }, or null
  function explodedSlotOf(E, c, tol) {
    var e = E[c], A = [e.x1, e.y1], B = [e.x2, e.y2], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (!(L > tol)) return null;
    var u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
    function capsAt(P) { var out = []; E.forEach(function (x, i) { if (x && x.t === 'arc' && !x.construction && Math.hypot(x.cx - P[0], x.cy - P[1]) <= tol) out.push(i); }); return out; }
    var ca = capsAt(A), cb = capsAt(B), caps = null;
    ca.forEach(function (i) { cb.forEach(function (j) { if (!caps && Math.abs(E[i].r - E[j].r) <= tol) caps = [i, j]; }); });
    if (!caps) return null;
    var h = E[caps[0]].r, sides = [];
    E.forEach(function (x, i) {
      if (!x || x.t !== 'line' || x.construction || i === c) return;
      var dx = x.x2 - x.x1, dy = x.y2 - x.y1, l = Math.hypot(dx, dy);
      if (!(l > tol) || Math.abs(dx * u[1] - dy * u[0]) > tol * (1 + l)) return;   // parallel to the centerline
      var o1 = (x.x1 - A[0]) * -u[1] + (x.y1 - A[1]) * u[0], o2 = (x.x2 - A[0]) * -u[1] + (x.y2 - A[1]) * u[0];
      var t1 = (x.x1 - A[0]) * u[0] + (x.y1 - A[1]) * u[1], t2 = (x.x2 - A[0]) * u[0] + (x.y2 - A[1]) * u[1];   // (alongside it: not a collinear slot's side)
      if (Math.abs(Math.abs(o1) - h) <= tol && Math.abs(Math.abs(o2) - h) <= tol && Math.min(t1, t2) >= -tol && Math.max(t1, t2) <= L + tol) sides.push(i);
    });
    return sides.length >= 2 ? { caps: caps, sides: sides, h: h, L: L } : null;
  }
  // the parts of the exploded arc slot (half width hw) whose construction centre-line arc is entity c: { caps, outer,
  // inner }, or null
  function explodedArcSlotOf(E, c, hw, tol) {
    var e = E[c], R2 = Math.PI / 180, P1 = [e.cx + e.r * Math.cos(e.a0 * R2), e.cy + e.r * Math.sin(e.a0 * R2)], P2 = [e.cx + e.r * Math.cos(e.a1 * R2), e.cy + e.r * Math.sin(e.a1 * R2)];
    var g = { caps: [], outer: -1, inner: -1 };
    E.forEach(function (x, i) {
      if (!x || x.t !== 'arc' || x.construction || i === c) return;
      if (Math.hypot(x.cx - e.cx, x.cy - e.cy) <= tol) {
        if (g.outer < 0 && Math.abs(x.r - (e.r + hw)) <= tol) g.outer = i;
        else if (g.inner < 0 && Math.abs(x.r - (e.r - hw)) <= tol) g.inner = i;
      } else if (Math.abs(x.r - hw) <= tol && (Math.hypot(x.cx - P1[0], x.cy - P1[1]) <= tol || Math.hypot(x.cx - P2[0], x.cy - P2[1]) <= tol)) g.caps.push(i);
    });
    return g.outer >= 0 && g.inner >= 0 && g.caps.length >= 2 ? g : null;
  }
  // what the dimensions and dimension relations on an exploded slot's entities bring: [{ part, olen, p (props) }]
  function explodedSlotItems(model, raw, arc, c, g) {
    var items = [], all = [c].concat(g.caps, arc ? [g.outer, g.inner] : g.sides);
    function inG(i) { return all.indexOf(i) >= 0; }
    (raw.dims || []).forEach(function (x, i) {
      if (!hasDimProps(x) || !inG(x.e)) return;
      var part = x.e === c ? (arc ? (x.k === 'r' ? 'R' : null) : (x.k === 'len' ? 'len' : null)) : (g.caps.indexOf(x.e) >= 0 && x.k === 'dia' ? 'w' : null);
      if (part) items.push({ part: part, olen: false, p: dimPropsOf(x, raw, i + 1) });
    });
    (raw.rels || []).forEach(function (rel, i) {
      if (rel.type !== 'distance' || !hasDimProps(rel) || !rel.refs || rel.refs.length !== 2) return;
      var P = rel.refs.map(function (r) { var m = /^(\d+)(?:\.([a-z]+)\d*)?$/.exec(String(r)); return m ? { e: +m[1], s: m[2] || null } : null; });
      if (!P[0] || !P[1] || !inG(P[0].e) || !inG(P[1].e) || P[0].e === P[1].e) return;
      var whole = !P[0].s && !P[1].s, part = null, olen = false;
      function both(list) { return list.indexOf(P[0].e) >= 0 && list.indexOf(P[1].e) >= 0; }
      if (arc) { if (whole && both([g.outer, g.inner])) part = 'w'; }
      else if (whole && both(g.sides)) part = 'w';
      else if (whole && both(g.caps)) { part = 'len'; olen = true; }
      else if (P.every(function (p) { return (p.e === c && p.s === 'p') || (g.caps.indexOf(p.e) >= 0 && p.s === 'c'); })) part = 'len';
      if (!part) return;
      var p = relDimProps(model, { f: raw.id, i: i });
      if (!p) return;
      delete p.own;
      items.push({ part: part, olen: olen, p: p });
    });
    return items;
  }
  function slotDimProps(model, build, w, d) {
    if (!hasSlotDimProps(model) || !w || !w.frame || w.flat || !isOrthoFrame(w.frame)) return null;
    var F = w.frame, planes = build && build.planes || {}, s = d.slot, tolV = 1e-6 * (1 + Math.abs(s.len || s.R || 0) + s.w);
    var rm; try { rm = K.resolvedModel(model).model; } catch (e) { rm = model; }
    var best = null;
    rm.features.forEach(function (rf, fi) {
      var raw = model.features[fi];
      if (rf.type !== 'sketch' || rf.suppressed || !raw || (!raw.dims && !raw.rels)) return;
      var pl; try { pl = K.resolvePlane(rf.plane, rm, planes); } catch (e) { return; }
      if (Math.abs(Math.abs(V.dot(pl.n, F.e)) - 1) > 1e-9) return;
      function view2(x, y) { var p = K.to3D(pl, x, y); return [V.dot(p, F.u), V.dot(p, F.v)]; }
      var E = rf.entities || [];
      E.forEach(function (e, ei) {
        if (!e) return;
        var items = [], score, g = null, c1, c2, cc, sc;
        if (!s.arc && e.t === 'slot') {
          var L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
          if (Math.abs(e.w - s.w) > tolV || Math.abs(L + e.w - s.len) > tolV) return;
        } else if (s.arc && e.t === 'aslot') {
          if (Math.abs(e.r - s.R) > tolV || Math.abs(e.w - s.w) > tolV) return;
        } else if (!s.arc && e.t === 'line' && e.construction) {   // rfAF: an exploded straight slot
          g = explodedSlotOf(E, ei, tolV);
          if (!g || Math.abs(2 * g.h - s.w) > tolV || Math.abs(g.L + 2 * g.h - s.len) > tolV) return;
          items = explodedSlotItems(model, raw, false, ei, g);
        } else if (s.arc && e.t === 'arc' && e.construction) {     // rfAF: an exploded arc slot
          if (Math.abs(e.r - s.R) > tolV) return;
          g = explodedArcSlotOf(E, ei, s.w / 2, tolV);
          if (!g) return;
          items = explodedSlotItems(model, raw, true, ei, g);
        } else return;
        if (!g) (raw.dims || []).forEach(function (x, i) {
          if (x.e !== ei || !hasDimProps(x)) return;
          var k = x.k, part = s.arc ? (k === 'r' ? 'R' : k === 'w' ? 'w' : null) : (k === 'w' ? 'w' : k === 'olen' || k === 'len' ? 'len' : null);
          if (part) items.push({ part: part, olen: k === 'olen', p: dimPropsOf(x, raw, i + 1) });
        });
        if (!items.length) return;
        if (s.arc) { cc = view2(e.cx, e.cy); sc = s.center || d.c; score = Math.hypot(cc[0] - sc[0], cc[1] - sc[1]); }
        else { c1 = view2(e.x1, e.y1); c2 = view2(e.x2, e.y2); score = Math.min(Math.hypot(c1[0] - d.c[0], c1[1] - d.c[1]), Math.hypot(c2[0] - d.c[0], c2[1] - d.c[1])); }
        if (!best || score < best.score) best = { score: score, items: items };
      });
    });
    if (!best) return null;
    var props = {}, name = null, olen = {};
    best.items.forEach(function (o) {
      if (props[o.part] && (olen[o.part] || !o.olen)) return;   // the overall length wins over the centre distance
      props[o.part] = o.p; olen[o.part] = o.olen;
      name = name || o.p.name;
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
    // (rfAJ) the part's Hole Wizard holes ride along, so a hole callout reads the feature's text (wizardAt)
    out.wizard = wizardHoles(model);
    return out;
  }
  // (rfAJ, shop audit 2 #2 / #3) wizardHoles(model) -> [{ feature, units, n (axis), pts (centres on the face), ra
  // (the largest drilled radius: a callout's anchor circle), rmax (with the thread) }] of the part's Hole Wizard holes.
  // SolidWorks reads a Hole Wizard hole's callout from the feature, not from the faces: a CSK whose cone goes through a
  // thin sheet has no drill cylinder at all, yet its callout reads 'Ø.281 THRU ALL' / '⌵ Ø.507 X 82°'.
  function wizardHoles(model) {
    var out = [];
    if (!model || model.type === 'assembly' || typeof HoleWizard === 'undefined' || !HoleWizard.positions || !HoleWizard.callout) return out;
    var mu = model.units === 'in' ? 'in' : 'mm';
    (model.features || []).forEach(function (f) {
      if (!f || f.type !== 'hole' || f.suppressed) return;
      try {
        var pos = HoleWizard.positions(f, model, null), s = HoleWizard.spec(f, mu);
        var ra = Math.max(+s.dia || 0, s.cbore ? +s.cbore.dia : 0, s.csk ? +s.csk.dia : 0) / 2;
        out.push({ feature: f, units: mu, n: pos.plane.n, pts: pos.pts.map(function (q) { return q.p; }), ra: ra, rmax: Math.max(ra, s.thread ? +s.thread.major / 2 : 0) });
      } catch (e) { }
    });
    return out;
  }
  // wizardAt(list, F, c, r) -> { hole, c } the Hole Wizard hole of the view frame F (its axis along the view) with a
  // centre under view point c (a few mils / .08 mm), the circle no bigger than the hole; null when none
  function wizardAt(list, F, c, r) {
    for (var i = 0; i < (list || []).length; i++) {
      var h = list[i], tol = h.units === 'in' ? 0.003 : 0.08;
      if (Math.abs(Math.abs(V.dot(h.n, F.e)) - 1) > 1e-6 || (r != null && r > h.rmax + tol)) continue;
      for (var j = 0; j < h.pts.length; j++) {
        var q = [V.dot(h.pts[j], F.u), V.dot(h.pts[j], F.v)];
        if (Math.hypot(q[0] - c[0], q[1] - c[1]) <= tol) return { hole: h, c: q };
      }
    }
    return null;
  }
  // wizardLines(hole, units, count, prec) -> the Hole Wizard hole's callout as SolidWorks 2022 writes it (measured,
  // test-reports/2026-11-02-solidworks-reference-2.md section 5; a space after each symbol, digits at the document's
  // precision or the callout's own): 'Ø .28 ↧ .75'. The drill line is always on top (its text sits in the dimension's
  // Callout Above slot; the sheet exported to DXF shows it above the other line, rfGW): 'Ø .20 ↧ .75' over the thread
  // '1/4-20 UNC ↧ .50'; 'Ø .27 THRU ALL' over the counterbore '⌴ Ø .44 ↧ .25' or the countersink '⌵ Ø .51 X 82°'. A
  // Through All end reads THRU ALL, several positions 'nX' on the first line. HoleWizard.callout (the PM's spec text)
  // keeps its own words.
  function wizardLines(h, units, count, prec) {
    var u = units === 'in' || units === 'mm' ? units : h.units, f = h.feature, s = HoleWizard.spec(f, u), thru = f.end === 'through';
    var k = u === h.units ? 1 : u === 'in' ? 1 / 25.4 : 25.4;   // the feature's depths are in the part's units
    function n(x) { return numText(x, u, prec); }
    var lines = ['Ø ' + n(s.dia) + (thru ? ' THRU ALL' : ' ↧ ' + n(+f.depth * k))];
    if (s.thread) lines.push(s.thread.label.replace(/ - 2B$/, '') + (thru ? ' THRU ALL' : ' ↧ ' + n(+(f.threadDepth || f.depth) * k)));
    if (s.cbore) lines.push('⌴ Ø ' + n(s.cbore.dia) + ' ↧ ' + n(s.cbore.depth));
    if (s.csk) lines.push('⌵ Ø ' + n(s.csk.dia) + ' X ' + s.csk.angle + '°');
    if (count > 1) lines[0] = count + 'X ' + lines[0];
    return lines;
  }
  // insertWizardCallouts(doc, model, ids, opts) -> the number inserted: Model Items ▸ Hole callouts. Its earlier
  // callouts (an.mi) in the views (ids, null: all) go; with opts.on, one hole callout per Hole Wizard feature goes on
  // the first projected view that looks along the hole (every such view without opts.dedupe), on the position farthest
  // from the feature's centre. A view that already has a callout on one of the feature's holes counts as done.
  function insertWizardCallouts(doc, model, ids, opts) {
    opts = opts || {};
    var n = 0, inIds = function (v) { return !ids || ids.indexOf(v.id) >= 0; };
    doc.views.forEach(function (v) {
      if (inIds(v) && v.annotations) v.annotations = v.annotations.filter(function (a) { return !(a.type === 'holeCallout' && a.mi); });
    });
    if (!opts.on) return 0;
    var roleOrder = { front: 0, top: 1, right: 2 };
    var views = doc.views.filter(function (v) { return inIds(v) && (!v.kind || v.kind === 'projected'); })
      .sort(function (a, b) { return (roleOrder[a.role] != null ? roleOrder[a.role] : 5) - (roleOrder[b.role] != null ? roleOrder[b.role] : 5) || a.id - b.id; });
    wizardHoles(model).forEach(function (h) {
      if (opts.feature != null && String(opts.feature) !== String(h.feature.id)) return;
      views.some(function (v) {
        var F = D.viewFrame(doc, v);
        if (Math.abs(Math.abs(V.dot(h.n, F.e)) - 1) > 1e-6) return false;
        var tol = h.units === 'in' ? 0.003 : 0.08, cs = h.pts.map(function (p) { return [V.dot(p, F.u), V.dot(p, F.v)]; });
        var had = (v.annotations || []).some(function (a) { return a.type === 'holeCallout' && cs.some(function (q) { return Math.hypot(q[0] - a.c[0], q[1] - a.c[1]) <= tol; }); });
        if (!had) {
          var m = [0, 0];
          cs.forEach(function (q) { m[0] += q[0] / cs.length; m[1] += q[1] / cs.length; });
          var pick = cs.slice().sort(function (p, q) { return Math.hypot(q[0] - m[0], q[1] - m[1]) - Math.hypot(p[0] - m[0], p[1] - m[1]) || (q[0] + q[1]) - (p[0] + p[1]); })[0];
          addHoleCallout(doc, v.id, { c: pick, r: h.ra }).mi = true;
          n++;
        }
        return opts.dedupe !== false;
      });
    });
    return n;
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
      // (rfAJ) a Hole Wizard hole under the callout: the feature's own text (SolidWorks), not the faces' analysis
      var hw = !w.flat && w.ortho && ends && ends.wizard ? wizardAt(ends.wizard, w.frame, an.c, an.r) : null;
      var h = hw ? null : w.flat ? { c: an.c.slice(), dia: 2 * an.r, thru: true } : w.ortho ? holeInfo(mesh, w.frame, an.c, an.r) : null, lines;
      // (rfV) THRU ALL when the cut that makes this drill size ends Through All
      var allOf = function (q) { if (q && q.thru && thruAllFor(ends, q.dia)) q.thruAll = true; return q; };
      allOf(h);
      if (hw) {
        var hwn = hw.hole.pts.length;
        lines = wizardLines(hw.hole, units, hwn, an.prec);
        info = { hole: { c: an.c.slice(), dia: +HoleWizard.spec(hw.hole.feature, hw.hole.units).dia, thru: hw.hole.feature.end === 'through' }, count: hwn, feature: hw.hole.feature.id };
      } else if (h && w.flat) {
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
      var sz = hw ? null : holeNameFor(holeNames, h ? h.dia : 2 * an.r);
      if (sz && lines.join(' ').indexOf(sz) < 0) { lines.push(sz); info = info || {}; info.size = sz; }
      if (an.text) lines = String(an.text).split('\n').map(function (s) { return s.split('<HOLE>').join(lines.join(' ')); });
      // (lane BX) the callout text and arrow are the dimension style's (.125 in on an inch drawing, as the dimensions)
      var c = w.toSheet(an.c), rr2 = an.r * w.scale, box = w.box, th = (_.DIMGEO && +_.DIMGEO.text > 0 ? +_.DIMGEO.text : 3.5) * k, mid = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
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
      var ar = (_.DIMGEO && +_.DIMGEO.arrow > 0 ? +_.DIMGEO.arrow : 3) * k, aw = _.ARROW_W * k, dv = [-uu[0], -uu[1]], nn = [-dv[1], dv[0]];
      out.push({ k: 'fill', pts: [tip, [tip[0] - dv[0] * ar + nn[0] * aw, tip[1] - dv[1] * ar + nn[1] * aw], [tip[0] - dv[0] * ar - nn[0] * aw, tip[1] - dv[1] * ar - nn[1] * aw]], layer: L });
      lines.forEach(function (s, i) { out.push({ k: 'text', p: [elbow[0] + sg * (_.SHOULDER + _.TEXT_GAP) * k, elbow[1] - th / 2 + ((lines.length - 1) / 2 - i) * th * 1.6], h: th, text: s, anchor: sg > 0 ? 'start' : 'end', layer: L, rot: 0 }); });
      an.leadNow = lead.slice();
      text = lines.join(' ');
      info = info || {};
      info.lines = lines;
    } else if (an.type === 'cosmeticThread' || an.type === 'dowelPin') {   // (rfCU)
      var cu = cuAnnotPrims(an, w, k, units, out, L);
      dangling = cu.dangling; text = cu.text; info = cu.info;
    }
    if (dangling) out.forEach(function (x) { x.color = 'dangling'; });
    return { prims: out, dangling: dangling, text: text, info: info };
  }

  D.circlesAlong = circlesAlong; D.holeInfo = holeInfo; D.holeText = holeText; D.cylAxes = cylAxes; D.fitCircle = fitCircle; D.lineIntervals = lineIntervals;
  D.addCenterMark = addCenterMark; D.autoCenterMarks = autoCenterMarks; D.addCenterline = addCenterline; D.autoCenterlines = autoCenterlines; D.autoInsert = autoInsert;
  D.addHoleCallout = addHoleCallout; D.slotAt = slotAt; D.addSlotCallout = addSlotCallout; D.insertWizardCallouts = insertWizardCallouts; D.wizardHoles = wizardHoles; D.findAnnotation = findAnnotation; D.deleteAnnotation = deleteAnnotation; D.docOptions = docOptions; D.markPaper = markPaper;
  D.addOrdinate = addOrdinate; D.addBaseline = addBaseline; D.addChamferDim = addChamferDim; D.refFrom = refFrom;
  D.TOL_TYPES = TOL_TYPES; D.dimLabel = dimLabel; D.numText = numText; D.styleKey = styleKey; D.setDimProps = setDimProps; D.DIM_PROPS = DIM_PROPS;
  D.dimSource = dimSource; D.driveDim = driveDim; D.addBalloon = addBalloon; D.STACK_DIRS = STACK_DIRS;
  D.sketchDimProps = sketchDimProps; D.sketchOrdinateProps = sketchOrdinateProps; D.ordinateValueText = ordinateValueText; D.slotDimProps = slotDimProps;

  // ------------------------------------------------------------------ rfBA: the sketches' angular dimensions as model items
  // SolidWorks' Insert Model Items ▸ Marked for drawing brings every kind of sketch dimension with its tolerance,
  // precision, text and name. Drawing.autoDims (drawing-sheet.js) brings the linear ones (entity Smart Dimensions,
  // location distances — point to point, to the origin, to converted model edges —, ordinate sets, slot callouts);
  // sketchAngularItems adds the others a drawing can show: an angle between two lines (angle relation: the arc between
  // the two drawn lines, or its supplement as the sketch shows it), each value of an Angular Running set up to 180°
  // (from the datum ray) and a Chamfer Dimension ("0.100 X 45°"), each marked for drawing (rel.mark: on unless false;
  // a driven one only when set true), in the first orthographic view that looks square at its sketch, with relSrc so
  // sketchDimProps gives it the relation's properties and name (sketchAng 'sketchId:relIndex'). (rfDD) A Path Length
  // dimension comes as the drawing's Path Length dimension (kind 'pathlen': its lines and arcs in the view, the value
  // on a leader from the first). Model Items ▸ Selected feature brings its sketch's only.
  var ANG_RELS = { angle: 1, chamfer: 1, runangle: 1, pathlength: 1 };
  function sketchAngularItems(doc, projections) {
    var ctx = _.CTX, model = ctx && ctx.model, S = typeof SketchSolver !== 'undefined' ? SketchSolver : null, out = [];
    if (!doc || !projections || !model || model.type === 'assembly' || !model.features || !S || !S.refCurve || !D.modelItems || !D.viewFrame) return out;
    var MI = D.modelItems(doc), only = null;
    if (!MI.marked) return out;
    if (MI.source === 'feature') {
      var sf = K.findFeature(model, MI.feature);
      only = sf ? (sf.type === 'sketch' ? sf.id : sf.sketch) : null;
      if (only == null) return out;
    }
    var roleOrder = { front: 0, top: 1, right: 2 }, ORTHO = _.ORTHO || {};
    var order = (doc.views || []).filter(function (v) { return ORTHO[v.orient] && (!v.kind || v.kind === 'projected') && projections[v.id] && !projections[v.id].error && (!MI.views || MI.views.indexOf(v.id) >= 0); });
    order.sort(function (a, b) { return (roleOrder[a.role] != null ? roleOrder[a.role] : 5) - (roleOrder[b.role] != null ? roleOrder[b.role] : 5) || a.id - b.id; });
    if (!order.length) return out;
    var rm; try { rm = K.resolvedModel(model).model; } catch (e) { rm = model; }
    var planes = ctx.build && ctx.build.planes || {};
    function len2(p, q) { return Math.hypot(q[0] - p[0], q[1] - p[1]); }
    (rm.features || []).forEach(function (f) {
      if (f.type !== 'sketch' || f.suppressed || !f.rels || (only != null && f.id !== only)) return;
      var list = [];
      f.rels.forEach(function (rel, i) {
        if (!rel || !ANG_RELS[rel.type] || rel.suppressed || !rel.refs || rel.mark === false || (rel.driven && rel.mark !== true)) return;
        list.push(i);
      });
      if (!list.length) return;
      var pl; try { pl = K.resolvePlane(f.plane, rm, planes); } catch (e) { return; }
      var v = null, F = null;
      for (var j = 0; j < order.length && !v; j++) { var Fj = D.viewFrame(doc, order[j]); if (Fj && Math.abs(Math.abs(V.dot(pl.n, Fj.e)) - 1) < 1e-9) { v = order[j]; F = Fj; } }
      if (!v) return;
      function at(p) { var q = K.to3D(pl, p[0], p[1]); return [V.dot(q, F.u), V.dot(q, F.v)]; }
      function line(r) { var c = S.refCurve(f, r); return c && c.kind === 'line' && len2(c.a, c.b) > 1e-12 ? c : null; }
      function pt(r) { var p = S.refPoint(f, r); if (p) return p; var c = S.refCurve(f, r); return c && c.kind === 'circle' ? c.c : null; }
      list.forEach(function (i) {
        var rel = f.rels[i], d = null, src = { f: f.id, i: i };
        if (rel.type === 'pathlength') {
          // each line as an edge, each arc / circle in the view's frame (a view that shows the sketch mirrored turns
          // the arc's sense round: its ends swap)
          var o0 = at([0, 0]), ux = at([1, 0]), uy = at([0, 1]);
          var flip = ((ux[0] - o0[0]) * (uy[1] - o0[1]) - (ux[1] - o0[1]) * (uy[0] - o0[0])) < 0;
          var ang = function (p, c) { return Math.atan2(p[1] - c[1], p[0] - c[0]) * 180 / Math.PI; };
          var prefs = [], okp = true;
          rel.refs.forEach(function (r) {
            var c = S.refCurve(f, r);
            if (!okp || !c) { okp = false; return; }
            if (c.kind === 'line') { prefs.push(refFrom({ a: at(c.a), b: at(c.b) })); return; }
            var e = f.entities[parseInt(String(r), 10)], C = at(c.c);
            if (!e) { okp = false; return; }
            if (e.t === 'circle') { prefs.push({ kind: 'dia', c: C, r: Math.abs(c.r) }); return; }
            var R0 = Math.abs(e.r), d2r = Math.PI / 180;
            var P0 = at([e.cx + R0 * Math.cos(e.a0 * d2r), e.cy + R0 * Math.sin(e.a0 * d2r)]), P1 = at([e.cx + R0 * Math.cos(e.a1 * d2r), e.cy + R0 * Math.sin(e.a1 * d2r)]);
            var A0 = ang(flip ? P1 : P0, C), A1 = ang(flip ? P0 : P1, C);
            prefs.push({ kind: 'rad', c: C, r: R0, a0: A0, a1: A1 });
          });
          if (!okp || !prefs.length) return;
          d = { view: v.id, kind: 'pathlen', refs: prefs, value: pathLengthOf(prefs), auto: true, relSrc: src, sketchAng: f.id + ':' + i };
          if (!(d.value > 1e-12)) return;
        } else if (rel.type === 'chamfer') {
          var C = line(rel.refs[0]), A = line(rel.refs[1]);
          if (!C || !A) return;
          d = { view: v.id, kind: 'chamfer', a: at(C.a), b: at(C.b), ref: refFrom({ a: at(A.a), b: at(A.b) }), auto: true, relSrc: src, sketchAng: f.id + ':' + i };
          chamferValue(d);
          if (!(d.angle > 1e-6 && d.angle < 90 - 1e-6) || !(d.value > 1e-12)) return;
        } else {
          var e1, e2, target;
          if (rel.type === 'angle') {
            var L1 = line(rel.refs[0]), L2 = line(rel.refs[1]);
            if (!L1 || !L2) return;
            e1 = [L1.a, L1.b]; e2 = [L2.a, L2.b];
            target = S.measure(f, 'angle', rel.refs, null, rel.sup);
          } else {   // an Angular Running value: from the vertex along the datum and to the member
            var P0 = pt(rel.refs[0]), P1 = pt(rel.refs[1]), P2 = pt(rel.refs[2]);
            if (!P0 || !P1 || !P2 || len2(P0, P1) < 1e-12 || len2(P0, P2) < 1e-12) return;
            e1 = [P0, P1]; e2 = [P0, P2];
            target = S.measure(f, 'runangle', rel.refs, rel.dir);
            if (target != null && target > 180) target = 360 - target;   // (drawn the short way round, as the drawing's angle shows it)
          }
          if (target == null || !(target > 1e-6) || !(target < 180 - 1e-6)) return;
          d = { view: v.id, kind: 'angle', refs: [refFrom({ a: at(e1[0]), b: at(e1[1]) }), refFrom({ a: at(e2[0]), b: at(e2[1]) })], auto: true, relSrc: src, sketchAng: f.id + ':' + i };
          measurePair(d);
          if (d.dangling || !d.c) return;
          // each ray toward its line's far end from the vertex (the arc between the lines as drawn); the supplement when
          // the sketch's value is that one (rel.sup, or two lines meeting the other way)
          var far = d.refs.map(function (r) { return len2(r.a, d.c) >= len2(r.b, d.c) ? r.a : r.b; });
          var t1 = [d.refs[0].b[0] - d.refs[0].a[0], d.refs[0].b[1] - d.refs[0].a[1]], t2 = [d.refs[1].b[0] - d.refs[1].a[0], d.refs[1].b[1] - d.refs[1].a[1]];
          d.s = [(far[0][0] - d.c[0]) * t1[0] + (far[0][1] - d.c[1]) * t1[1] >= 0 ? 1 : -1, (far[1][0] - d.c[0]) * t2[0] + (far[1][1] - d.c[1]) * t2[1] >= 0 ? 1 : -1];
          measurePair(d);
          if (Math.abs(d.value - target) > 1e-6) { d.s[1] = -d.s[1]; measurePair(d); }
          if (Math.abs(d.value - target) > 1e-6) return;
          d.rad = 0.6 * Math.min(len2(d.c, far[0]), len2(d.c, far[1]));
        }
        out.push(d);
      });
    });
    return out;
  }
  // (rfDD) Drawing.autoDims (drawing-sheet.js) calls it directly through _.sketchAngularItems, after the linear items
  D.sketchAngularItems = _.sketchAngularItems = sketchAngularItems;
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
        if (a.jogs) a.jogs = a.jogs.map(function (q) { return [q[0] + dx, q[1] + dy]; });   // (rfCU) a multi-jog leader
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
    cleanNoteFmt(nt, spec);   // (rfCU) border, list
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
    cleanNoteFmt(nt, props);   // (rfCU) border, list
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
  // (lane drawing) setAnnotationHidden(doc, ref, hidden) -> true when ref named one: View ▸ Hide/Show Annotations.
  // ref: { kind: 'dim', key } (a model item: doc.hiddenAnn) | { kind: 'dim', view, index } (view.dims[index].hidden) |
  // { kind: 'annot', id } (a centre mark, callout … : its record's hidden) | { kind: 'flat', view, key } (a flat view's
  // bend note / Cross-Break note / table: view.flatAnn) | { kind: 'note' | 'symbol', id } | { kind: 'balloon', view, index }.
  // The flag rides on the record, so it is saved with the drawing; render leaves hidden ones off (grey while the tool runs).
  function setAnnotationHidden(doc, ref, hidden) {
    hidden = !!hidden;
    function flag(rec) { if (!rec) return false; if (hidden) rec.hidden = true; else delete rec.hidden; return true; }
    if (!ref) return false;
    if (ref.kind === 'dim' && ref.key) {
      var l = (doc.hiddenAnn || []).filter(function (k) { return k !== ref.key; });
      if (hidden) l.push(ref.key);
      if (l.length) doc.hiddenAnn = l; else delete doc.hiddenAnn;
      return true;
    }
    var v = ref.view != null ? findView(doc, ref.view) : null;
    if (ref.kind === 'dim') return flag(v && v.dims && v.dims[ref.index]);
    if (ref.kind === 'flat') { if (!v) return false; flatAnnotation(doc, v.id, ref.key, { hidden: hidden }); return true; }
    if (ref.kind === 'annot') { var f = findAnnotation(doc, ref.id); return flag(f && f.annotation); }
    if (ref.kind === 'note') return flag(findNote(doc, ref.id));
    if (ref.kind === 'symbol') return flag((doc.symbols || []).filter(function (y) { return y.id === ref.id; })[0]);
    if (ref.kind === 'balloon') return flag(v && v.balloons && v.balloons[ref.index]);
    return false;
  }
  // hiddenAnnotationCount(doc) -> how many annotations of the active sheet are hidden (for the tool's status line)
  function hiddenAnnotationCount(doc) {
    var n = (doc.hiddenAnn || []).length;
    (doc.notes || []).concat(doc.symbols || []).forEach(function (r) { if (r && r.hidden) n++; });
    (doc.views || []).forEach(function (v) {
      (v.dims || []).concat(v.annotations || [], v.balloons || []).forEach(function (r) { if (r && r.hidden) n++; });
      Object.keys(v.flatAnn || {}).forEach(function (k) { if (v.flatAnn[k].hidden) n++; });
    });
    return n;
  }
  D.setAnnotationHidden = setAnnotationHidden; D.hiddenAnnotationCount = hiddenAnnotationCount;
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
  var SYMBOL_TYPES = { surfaceFinish: 1, datum: 1, gtol: 1, revision: 1, revCloud: 1, weld: 1, datumTarget: 1, leader: 1 };   // (rfCU: Datum Target, Multi-jog Leader)   // (rfAN: Revision Symbol, Revision Cloud, Weld Symbol)
  // the next datum letter: A, B, C … skipping I, O, Q (ASME Y14.5), past the ones the drawing uses
  function nextDatum(doc) {
    var used = {}; (doc.symbols || []).forEach(function (s) { if (s.type === 'datum') used[String(s.label).toUpperCase()] = 1; });
    var L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    for (var i = 0; i < L.length; i++) if (!used[L[i]]) return L[i];
    return 'AA';
  }
  function cleanSymbol(s, spec) {
    if (CU_SYMBOLS[s.type]) return cleanCU(s, spec);   // (rfCU)
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
    } else if (s.type === 'revision') {
      if (spec.rev != null) { var rv = String(spec.rev).trim().toUpperCase(); if (rv) s.rev = rv; }
      if (spec.row !== undefined) { if (spec.row == null || spec.row === '') delete s.row; else s.row = +spec.row; }
      if (!s.rev) throw new Error('A revision symbol needs a revision letter');
    } else if (s.type === 'revCloud') {
      cleanCloud(s, spec);
    } else if (s.type === 'weld') {
      cleanWeld(s, spec);
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
    if (spec.type === 'revCloud' && !spec.p && (spec.a || spec.points)) spec = Object.assign({ p: spec.a || spec.points[0] }, spec);   // (rfAN: cleanCloud centres it)
    if (!spec.p || !isFinite(+spec.p[0]) || !isFinite(+spec.p[1])) throw new Error('A symbol needs a position on the sheet');
    var s = { id: nextAnnotId(doc), type: spec.type };
    if (spec.type === 'datum' && spec.label == null) spec = Object.assign({}, spec, { label: nextDatum(doc) });
    if (spec.type === 'datumTarget' && spec.num == null) spec = Object.assign({}, spec, { num: nextTargetNum(doc, String(spec.datum || 'A').trim().toUpperCase()) });   // (rfCU)
    // (rfAN) a Revision Symbol names the latest revision of the Revision Table (A when there is none) and its row
    if (spec.type === 'revision') {
      var rows = doc.revisions && doc.revisions.show !== false && doc.revisions.rows || [], rr = spec.rev != null ? D.revRow(doc, { rev: spec.rev }) : rows[rows.length - 1];
      spec = Object.assign({}, spec, { rev: spec.rev != null ? spec.rev : rr ? rr.rev : 'A' });
      if (spec.row === undefined && rr && rr.id != null) spec.row = rr.id;
    }
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
  function symbolText(s, doc) {
    if (CU_SYMBOLS[s.type]) return cuSymbolText(s, doc);   // (rfCU)
    if (s.type === 'datum') return 'DATUM ' + s.label;
    if (s.type === 'revision') return 'REVISION ' + revOf(s, doc);
    if (s.type === 'revCloud') return 'REVISION CLOUD (' + (CLOUD_SHAPES.filter(function (c) { return c[0] === s.shape; })[0] || ['', 'Rectangle'])[1].toUpperCase() + ')';
    if (s.type === 'weld') return weldText(s);
    if (s.type === 'surfaceFinish') return 'SURFACE FINISH' + (s.ra ? ' ' + s.ra : '') + (s.method ? ' ' + s.method : '') + (s.symbol === 'machined' ? ' (MACHINED)' : s.symbol === 'prohibited' ? ' (NO MACHINING)' : '');
    var nm = (GTOL_CHARS.filter(function (c) { return c[0] === s.char; })[0] || ['', ''])[1].toUpperCase();
    return [nm + ' ' + (s.dia ? 'Ø' : '') + s.tol + (s.mod ? '(' + s.mod + ')' : '')].concat(s.datums || []).join(' | ');
  }
  // symbolPrims(s, k, textWidth) -> { prims, box, text }: the symbol as sheet primitives on the SYMBOLS layer
  // (k: paper mm -> paper units; textWidth from drawing-render.js)
  function symbolPrims(s, k, textWidth, arrowW, doc) {
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
    } else if (s.type === 'gtol') {
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
    } else if (s.type === 'revision') {
      // (rfAN) ASME Y14.35: the revision letter in an equilateral triangle (point up), a leader to the change
      var rl = revOf(s, doc), th3 = 3 * k, side = Math.max(8 * k, textWidth(rl, th3) * 1.9 + 3 * k), hgt = side * Math.sqrt(3) / 2;
      var T = [p[0], p[1] + hgt * 2 / 3], BL = [p[0] - side / 2, p[1] - hgt / 3], BR = [p[0] + side / 2, p[1] - hgt / 3];
      ln(T, BL); ln(BL, BR); ln(BR, T);
      tx([p[0], p[1] - hgt * 0.06 - th3 / 2], rl, 'middle', th3);
      if (s.leader) {
        // (the leader leaves the triangle where the line from its centre to the tip crosses its outline)
        var lu = [s.leader[0] - p[0], s.leader[1] - p[1]], ll = Math.hypot(lu[0], lu[1]) || 1, ud = [lu[0] / ll, lu[1] / ll], tHit = hgt / 3;
        [[T, BL], [BL, BR], [BR, T]].forEach(function (e) {
          var ex = e[1][0] - e[0][0], ey = e[1][1] - e[0][1], den = ud[0] * ey - ud[1] * ex;
          if (Math.abs(den) < 1e-12) return;
          var qx = e[0][0] - p[0], qy = e[0][1] - p[1], tt = (qx * ey - qy * ex) / den, ss = (qx * ud[1] - qy * ud[0]) / den;
          if (tt > 0 && ss >= -1e-9 && ss <= 1 + 1e-9) tHit = tt;
        });
        var from2 = [p[0] + ud[0] * tHit, p[1] + ud[1] * tHit];
        if (ll > tHit + 0.5 * k) { ln(from2, s.leader); arrow(s.leader, from2); }
      }
    } else if (s.type === 'revCloud') {
      cloudArcs(s, k).forEach(function (a) { out.push({ k: 'arc', c: a.c, r: a.r, a0: a.a0, a1: a.a1, layer: L, style: 'thin', symbol: s.id }); });
    } else if (s.type === 'weld') {
      weldPrims(s, k, textWidth, ln, tx, circ, fill, arrow);
    } else if (CU_SYMBOLS[s.type]) {
      var cuPts = cuSymbolPrims(s, k, textWidth, ln, tx, circ, fill, arrow, out, doc);   // (rfCU)
    }
    var r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    function grow(q) { r.x0 = Math.min(r.x0, q[0]); r.x1 = Math.max(r.x1, q[0]); r.y0 = Math.min(r.y0, q[1]); r.y1 = Math.max(r.y1, q[1]); }
    out.forEach(function (x2) {
      if (x2.a) { grow(x2.a); grow(x2.b); }
      if (x2.k === 'circle') { grow([x2.c[0] - x2.r, x2.c[1] - x2.r]); grow([x2.c[0] + x2.r, x2.c[1] + x2.r]); }
      if (x2.k === 'arc') { for (var ai = 0; ai <= 8; ai++) { var aa = (x2.a0 + (((x2.a1 - x2.a0) % 360 + 360) % 360 || 360) * ai / 8) * Math.PI / 180; grow([x2.c[0] + x2.r * Math.cos(aa), x2.c[1] + x2.r * Math.sin(aa)]); } }
      if (x2.k === 'fill') x2.pts.forEach(grow);
      if (x2.k === 'text') { var w2 = textWidth(x2.text, x2.h), s0 = x2.anchor === 'middle' ? -w2 / 2 : x2.anchor === 'end' ? -w2 : 0; grow([x2.p[0] + s0, x2.p[1]]); grow([x2.p[0] + s0 + w2, x2.p[1] + x2.h]); }
    });
    return { prims: out, box: r, text: symbolText(s, doc), pts: cuPts || null };
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
  // ------------------------------------------------------------------ rfAN: Revision Symbol, Revision Cloud, Weld Symbol
  // revision: { rev: 'B', row: (the Revision Table row id it was placed for) }, p the triangle's centre; the letter
  //   follows its row when the row's REV is edited (D.revRow), else it keeps its own
  // revCloud: { shape: 'rect' | 'ellipse' | 'polygon' | 'freehand', w, h (rect / ellipse: the full size, paper), pts
  //   ([[dx, dy]] from p, paper: polygon / freehand), arc (the largest arc radius, paper mm, default 3) }, p its centre
  //   (rect / ellipse) or reference point; drawn as a ring of outward arcs (SolidWorks' Revision Cloud)
  // weld: { arrow: { type, size, length }, other: { type, size, length }, allAround, field, tail }, p the junction of
  //   the arrow and the reference line, leader the arrow tip (AWS A2.4: arrow-side symbol below the reference line,
  //   other side above, the fillet's upright leg to the left, size left of the symbol, length-pitch right of it, the
  //   all-around circle and the field-weld flag at the junction, the tail at the far end)
  function revOf(s, doc) { var r = doc ? D.revRow(doc, s) : null; return r && r.rev ? String(r.rev) : s.rev || '?'; }
  var CLOUD_SHAPES = [['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['polygon', 'Irregular Polygon'], ['freehand', 'Freehand']];
  var CLOUD_ARC = 3;
  function cleanCloud(s, spec) {
    if (spec.shape != null) { if (!CLOUD_SHAPES.some(function (c) { return c[0] === spec.shape; })) throw new Error('No revision cloud shape ' + spec.shape); s.shape = spec.shape; }
    if (!s.shape) s.shape = 'rect';
    // a / b: two opposite corners of a rectangle / ellipse (paper); points: a polygon's corners (paper)
    if (spec.a && spec.b) { s.p = [(+spec.a[0] + +spec.b[0]) / 2, (+spec.a[1] + +spec.b[1]) / 2]; s.w = Math.abs(spec.b[0] - spec.a[0]); s.h = Math.abs(spec.b[1] - spec.a[1]); }
    if (spec.points) {
      var P = spec.points.map(function (q) { return [+q[0], +q[1]]; }), bx = [Infinity, Infinity, -Infinity, -Infinity];
      P.forEach(function (q) { bx[0] = Math.min(bx[0], q[0]); bx[1] = Math.min(bx[1], q[1]); bx[2] = Math.max(bx[2], q[0]); bx[3] = Math.max(bx[3], q[1]); });
      s.p = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2];
      s.pts = P.map(function (q) { return [q[0] - s.p[0], q[1] - s.p[1]]; });
    }
    ['w', 'h'].forEach(function (q) { if (spec[q] != null) s[q] = Math.abs(+spec[q]); });
    if (spec.pts) s.pts = spec.pts.map(function (q) { return [+q[0], +q[1]]; });
    if (spec.arc !== undefined) { if (+spec.arc > 0) s.arc = +spec.arc; else delete s.arc; }
    if (s.shape === 'rect' || s.shape === 'ellipse') {
      delete s.pts;
      if (!(s.w > 0 && s.h > 0)) throw new Error('A revision cloud needs a width and a height');
    } else {
      delete s.w; delete s.h;
      if (!s.pts || s.pts.length < 3) throw new Error('A revision cloud needs at least three points');
    }
    delete s.leader;
  }
  // the cloud's outline (paper, counter-clockwise)
  function cloudOutline(s) {
    var P, p = s.p;
    if (s.shape === 'rect') P = [[-s.w / 2, -s.h / 2], [s.w / 2, -s.h / 2], [s.w / 2, s.h / 2], [-s.w / 2, s.h / 2]];
    else if (s.shape === 'ellipse') { P = []; for (var i = 0; i < 96; i++) { var t = i / 96 * 2 * Math.PI; P.push([s.w / 2 * Math.cos(t), s.h / 2 * Math.sin(t)]); } }
    else P = s.pts.slice();
    var A = 0;
    for (var j = 0; j < P.length; j++) { var q = P[j], r = P[(j + 1) % P.length]; A += q[0] * r[1] - r[0] * q[1]; }
    if (A < 0) P = P.slice().reverse();
    return P.map(function (q) { return [p[0] + q[0], p[1] + q[1]]; });
  }
  // cloudArcs(s, k) -> [{ c, r, a0, a1 }]: scallops of 150° along the outline, each chord about 1.93 × the arc radius,
  // bulging outward; a rectangle / polygon keeps a scallop end on every corner
  function cloudArcs(s, k) {
    var P = cloudOutline(s), R = (s.arc || CLOUD_ARC) * k, chord = 2 * R * Math.sin(75 * Math.PI / 180), pts = [];
    var n = P.length, keep = s.shape === 'rect' || s.shape === 'polygon', i;
    if (keep) {
      for (i = 0; i < n; i++) {
        var a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.round(L / chord));
        for (var j = 0; j < m; j++) pts.push([a[0] + (b[0] - a[0]) * j / m, a[1] + (b[1] - a[1]) * j / m]);
      }
    } else {
      var per = 0, seg = [];
      for (i = 0; i < n; i++) { var L2 = Math.hypot(P[(i + 1) % n][0] - P[i][0], P[(i + 1) % n][1] - P[i][1]); seg.push(L2); per += L2; }
      var m2 = Math.max(6, Math.round(per / chord)), si = 0, acc = 0;
      for (var q = 0; q < m2; q++) {
        var at = per * q / m2;
        while (si < n - 1 && acc + seg[si] < at) { acc += seg[si]; si++; }
        var f = seg[si] ? (at - acc) / seg[si] : 0, A0 = P[si], B0 = P[(si + 1) % n];
        pts.push([A0[0] + (B0[0] - A0[0]) * f, A0[1] + (B0[1] - A0[1]) * f]);
      }
    }
    var out = [], c75 = Math.cos(75 * Math.PI / 180), s75 = Math.sin(75 * Math.PI / 180);
    for (var e = 0; e < pts.length; e++) {
      var u = pts[e], v = pts[(e + 1) % pts.length], dx = v[0] - u[0], dy = v[1] - u[1], Lc = Math.hypot(dx, dy);
      if (Lc < 1e-9) continue;
      var rr = Lc / (2 * s75), th = Math.atan2(dy, dx) * 180 / Math.PI, mid = [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2], nl = [-dy / Lc, dx / Lc];
      out.push({ c: [mid[0] + nl[0] * rr * c75, mid[1] + nl[1] * rr * c75], r: rr, a0: th + 195, a1: th + 345 });
    }
    return out;
  }
  var WELD_TYPES = [['none', 'None'], ['fillet', 'Fillet'], ['square', 'Square groove'], ['v', 'V groove'], ['bevel', 'Bevel groove'], ['plug', 'Plug / slot']];
  var WELD_NAMES = { fillet: 'FILLET', square: 'SQUARE GROOVE', v: 'V GROOVE', bevel: 'BEVEL GROOVE', plug: 'PLUG' };
  function cleanWeld(s, spec) {
    ['arrow', 'other'].forEach(function (side) {
      var o = spec[side];
      if (o === undefined) return;
      if (!o || o.type === 'none') { delete s[side]; return; }
      var c = Object.assign({}, s[side] || {});
      if (o.type != null) { if (!WELD_NAMES[o.type]) throw new Error('No weld symbol ' + o.type); c.type = o.type; }
      ['size', 'length'].forEach(function (q) { if (o[q] != null) { var t = String(o[q]).trim(); if (t) c[q] = t; else delete c[q]; } });
      if (!c.type) c.type = 'fillet';
      s[side] = c;
    });
    ['allAround', 'field'].forEach(function (q) { if (spec[q] != null) { if (spec[q]) s[q] = true; else delete s[q]; } });
    if (spec.tail != null) { var tl = String(spec.tail).trim(); if (tl) s.tail = tl; else delete s.tail; }
    if (!s.arrow && !s.other) s.arrow = { type: 'fillet' };
  }
  function weldText(s) {
    var part = function (nm, o) { return o ? nm + ' ' + [WELD_NAMES[o.type], o.size, o.length].filter(Boolean).join(' ') : null; };
    return ['WELD'].concat([part('ARROW SIDE', s.arrow), part('OTHER SIDE', s.other), s.allAround ? 'ALL AROUND' : null, s.field ? 'FIELD WELD' : null, s.tail ? 'TAIL ' + s.tail : null].filter(Boolean)).join(' | ');
  }
  // weldGeom(s, k, textWidth) -> { dir, end, x0, xs }: the reference line (from the junction p away from the arrow)
  function weldPrims(s, k, textWidth, ln, tx, circ, fill, arrow) {
    var p = s.p, tip = s.leader || [p[0] - 8 * k, p[1] - 6 * k], dir = tip[0] <= p[0] ? 1 : -1, H = 4 * k, th = 3 * k, y = p[1];
    var symW = { fillet: H, square: 1.6 * k, v: 1.16 * H, bevel: 0.6 * H, plug: 1.2 * H };
    var sides = [['arrow', -1], ['other', 1]].filter(function (q) { return s[q[0]]; });
    var szW = 0, smW = 0, lnW = 0;
    sides.forEach(function (q) { var o = s[q[0]]; szW = Math.max(szW, o.size ? textWidth(o.size, th) + k : 0); smW = Math.max(smW, symW[o.type] || H); lnW = Math.max(lnW, o.length ? textWidth(o.length, th) + k : 0); });
    var W = szW + smW + lnW, Lr = Math.max(20 * k, W + 12 * k), end = [p[0] + dir * Lr, y];
    ln(p, end);
    // the arrow: from the junction to the joint
    ln(p, tip); arrow(tip, p);
    var x0 = dir > 0 ? p[0] + 6 * k : end[0] + 6 * k, xs = x0 + szW;
    sides.forEach(function (q) {
      var o = s[q[0]], sg = q[1], w = symW[o.type] || H, xc = xs + w / 2, Y = function (f) { return y + sg * f; };
      if (o.type === 'fillet') { ln([xs, y], [xs, Y(H)]); ln([xs, Y(H)], [xs + H, y]); }
      else if (o.type === 'square') { ln([xs, y], [xs, Y(H)]); ln([xs + w, y], [xs + w, Y(H)]); }
      else if (o.type === 'v') { ln([xc, y], [xs, Y(H)]); ln([xc, y], [xs + w, Y(H)]); }
      else if (o.type === 'bevel') { ln([xs, y], [xs, Y(H)]); ln([xs, y], [xs + w, Y(H)]); }
      else if (o.type === 'plug') { ln([xs, y], [xs, Y(0.6 * H)]); ln([xs, Y(0.6 * H)], [xs + w, Y(0.6 * H)]); ln([xs + w, Y(0.6 * H)], [xs + w, y]); }
      var base = sg > 0 ? y + H / 2 - th / 2 : y - H / 2 - th / 2;
      if (o.size) tx([xs - k, base], o.size, 'end', th);
      if (o.length) tx([xs + w + k, base], o.length, 'start', th);
    });
    if (s.allAround) circ(p, 1.6 * k);
    if (s.field) {
      var top = [p[0], y + 6 * k];
      ln(p, top);
      fill([top, [p[0], y + 3.4 * k], [p[0] + dir * 3.6 * k, y + 4.7 * k]]);
    }
    if (s.tail) {
      ln(end, [end[0] + dir * 3 * k, y + 3 * k]); ln(end, [end[0] + dir * 3 * k, y - 3 * k]);
      tx([end[0] + dir * 4 * k, y - th / 2], s.tail, dir > 0 ? 'start' : 'end', th);
    }
  }

  // ------------------------------------------------------------------ rfAN: Hole Table (Annotation ▸ Tables ▸ Hole Table)
  // doc.holeTables (one list per sheet, a SHEET_KEYS entry) = [{ id, view, origin: { kind: 'pt', p: [u, v] } (a
  // vertex) | { x: edge, y: edge } (the X-axis and Y-axis edges, { kind, a, b }: the origin is where they meet), holes:
  // [{ c, r }] (picked holes, view model units), sizes: [dia] (Select all holes of the same size: every hole of the view
  // with that diameter, so holes of that size added later join), all (every hole of the view), tagStyle: 'alpha' (A1,
  // A2 … B1: a letter per size) | 'numeric' (1, 2, 3 …), combineTags (one tag per size, its TAG cell merged),
  // combineSizes (the SIZE cell of a size merged over its rows), prec (decimal places of X / Y LOC; null: the
  // document's), x, y (the table's top-left corner, paper; unset: right of the view) }]. Every compute reattaches the
  // origin and the picked holes to the view's current geometry (a moved hole moves its row), works out the sizes
  // (a Hole Wizard hole: its callout text; else the hole read from the solid; a flat-pattern hole: Ø THRU ALL) and
  // tags; a flat-pattern view gives flat coordinates (the laser / punch locations). The table (TAG / X LOC / Y LOC /
  // SIZE) is drawn on the TABLES layer, the tags beside the holes and the X / Y datum arrows on ANNOTATIONS.
  var HT_ROW = 6, HT_TEXT = 2.5, HT_COLS = [['TAG', 12], ['X LOC', 18], ['Y LOC', 18], ['SIZE', 30]];
  function findHoleTable(doc, id) { var l = doc.holeTables || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function edgeOf(e) {
    if (!e || !e.a || !e.b) throw new Error('A hole table axis needs an edge (two points)');
    var a = [+e.a[0], +e.a[1]], b = [+e.b[0], +e.b[1]], dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]);
    return { kind: dy <= dx * 1e-9 ? 'h' : dx <= dy * 1e-9 ? 'v' : 'aligned', a: a, b: b, value: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  }
  function cleanHoleTable(t, spec) {
    if (spec.origin !== undefined) {
      var o = spec.origin;
      if (o && o.x && o.y) t.origin = { x: edgeOf(o.x), y: edgeOf(o.y) };
      else if (o && (o.p || (Array.isArray(o) && o.length === 2 && isFinite(+o[0])))) { var q = o.p || o; t.origin = { kind: 'pt', p: [+q[0], +q[1]] }; }
      else throw new Error('A hole table needs an origin: a vertex, or an X-axis and a Y-axis edge');
    }
    if (spec.holes !== undefined) t.holes = (spec.holes || []).filter(function (h) { return h && h.c && +h.r > 0; }).map(function (h) { return { c: [+h.c[0], +h.c[1]], r: +h.r }; });
    if (spec.sizes !== undefined) t.sizes = (spec.sizes || []).map(Number).filter(function (d) { return d > 0; });
    ['all', 'combineTags', 'combineSizes'].forEach(function (q) { if (spec[q] != null) { if (spec[q]) t[q] = true; else delete t[q]; } });
    if (spec.tagStyle != null) { if (spec.tagStyle === 'numeric') t.tagStyle = 'numeric'; else delete t.tagStyle; }
    if (spec.prec !== undefined) { if (spec.prec == null || spec.prec === '' || !(+spec.prec >= 0)) delete t.prec; else t.prec = Math.min(6, Math.round(+spec.prec)); }
    if (spec.x != null && spec.y != null) { t.x = +spec.x; t.y = +spec.y; }
    if (spec.x === null) { delete t.x; delete t.y; }
    if (!t.origin) throw new Error('A hole table needs an origin: a vertex, or an X-axis and a Y-axis edge');
    if (!t.all && !(t.holes && t.holes.length) && !(t.sizes && t.sizes.length)) throw new Error('A hole table needs holes: pick hole edges, or Select all holes of the same size');
    return t;
  }
  // addHoleTable(doc, viewId, { origin, holes, sizes, all, tagStyle, combineTags, combineSizes, prec, x, y }) -> the table
  function addHoleTable(doc, viewId, spec) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    var t = cleanHoleTable({ id: nextAnnotId(doc), view: v.id, holes: [], sizes: [] }, spec || {});
    (doc.holeTables || (doc.holeTables = [])).push(t);
    return t;
  }
  function editHoleTable(doc, id, props) {
    var t = findHoleTable(doc, id);
    if (!t) throw new Error('No hole table ' + id);
    var c = cleanHoleTable(JSON.parse(JSON.stringify(t)), props || {});
    Object.keys(t).forEach(function (q) { delete t[q]; }); Object.assign(t, c);
    return t;
  }
  function deleteHoleTable(doc, id) { var l = doc.holeTables || [], n = l.length; doc.holeTables = l.filter(function (t) { return t.id !== id; }); return doc.holeTables.length < n; }
  function moveHoleTable(doc, id, x, y) { var t = findHoleTable(doc, id); if (!t) throw new Error('No hole table ' + id); t.x = +x; t.y = +y; return t; }
  // viewHoles(w, mesh) -> [{ c, r }] the holes seen along their axis in view record w (one per centre, its smallest
  // circle: the drill of a counterbore / countersink); a flat-pattern view: every circle but a round blank's outline
  function viewHoles(w, mesh) {
    var pr = w.proj, out = [], b = pr.bounds, sz = Math.hypot(b.umax - b.umin, b.vmax - b.vmin), tol = sz * 1e-7 + 1e-9;
    if (!w.ortho && !w.flat) return out;
    (pr.circles.visible || []).forEach(function (c) {
      for (var i = 0; i < out.length; i++) if (Math.hypot(out[i].c[0] - c.c[0], out[i].c[1] - c.c[1]) <= tol * 10) { if (c.r < out[i].r) out[i].r = c.r; return; }
      out.push({ c: c.c.slice(), r: c.r });
    });
    if (w.flat) return out.filter(function (h) { return !(Math.abs(h.c[0] - h.r - b.umin) <= tol * 10 && Math.abs(h.c[0] + h.r - b.umax) <= tol * 10); });
    var m = w.section ? w.section.mesh : mesh;
    return out.filter(function (h) { return !!holeInfo(m, w.frame, h.c, h.r); });
  }
  function holeTag(i) { var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; return i < 26 ? A[i] : A[(Math.floor(i / 26) - 1) % 26] + A[i % 26]; }
  function lineMeet(e1, e2) {
    var d1 = [e1.b[0] - e1.a[0], e1.b[1] - e1.a[1]], d2 = [e2.b[0] - e2.a[0], e2.b[1] - e2.a[1]], cr = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(cr) < 1e-12 * (Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1]) || 1)) return [e2.a[0], e1.a[1]];
    var t = ((e2.a[0] - e1.a[0]) * d2[1] - (e2.a[1] - e1.a[1]) * d2[0]) / cr;
    return [e1.a[0] + d1[0] * t, e1.a[1] + d1[1] * t];
  }
  // holeTableRows(t, w, mesh, units, ends, holeNames) -> { origin: [u, v], rows: [{ tag, c, r, x, y, xText, yText,
  // size: [lines], group, dangling }], dangling }
  function holeTableRows(t, w, mesh, units, ends, holeNames) {
    var pr = w.proj, dangling = false, O;
    if (t.origin.kind === 'pt') {
      var po = { kind: 'pt', p: t.origin.p.slice() };
      if (reattachRef(po, pr)) t.origin.p = po.p.slice(); else dangling = true;
      O = t.origin.p;
    } else {
      var ex = JSON.parse(JSON.stringify(t.origin.x)), ey = JSON.parse(JSON.stringify(t.origin.y));
      if (reattachRef(ex, pr)) t.origin.x = ex; else dangling = true;
      if (reattachRef(ey, pr)) t.origin.y = ey; else dangling = true;
      O = lineMeet(t.origin.x, t.origin.y);
    }
    var b = pr.bounds, sz = Math.hypot(b.umax - b.umin, b.vmax - b.vmin), tol = sz * 1e-7 + 1e-9, list = [];
    function add(h) { if (!list.some(function (q) { return Math.hypot(q.c[0] - h.c[0], q.c[1] - h.c[1]) <= tol * 10; })) list.push(h); }
    var vh = (t.all || (t.sizes && t.sizes.length)) ? viewHoles(w, mesh) : [];
    (t.holes || []).forEach(function (h) {
      var ref = { kind: 'dia', c: h.c, r: h.r };
      if (reattachDim(ref, pr)) { h.c = ref.c.slice(); h.r = ref.r; add({ c: h.c.slice(), r: h.r }); }
      else { dangling = true; add({ c: h.c.slice(), r: h.r, dangling: true }); }
    });
    // (a same-size pick names the drilled diameter: the view's smallest circle at the hole)
    if (t.sizes && t.sizes.length) vh.forEach(function (h) { if (t.sizes.some(function (d) { return Math.abs(2 * h.r - d) <= Math.max(1e-6, d * 1e-6); })) add(h); });
    if (t.all) vh.forEach(add);
    var m = w.section ? w.section.mesh : mesh, wiz = ends && ends.wizard || [];
    function sizeOf(h) {
      var lines = null, dia = 2 * h.r;
      if (!w.flat && w.ortho) {
        var hw = wizardAt(wiz, w.frame, h.c, h.r);
        if (hw) return { lines: wizardLines(hw.hole, units, 1, t.prec), dia: +HoleWizard.spec(hw.hole.feature, hw.hole.units).dia };
        var hi = holeInfo(m, w.frame, h.c, h.r);
        if (hi) {
          if (hi.thru && thruAllFor(ends, hi.dia)) hi.thruAll = true;
          lines = holeText(hi, units, 1, t.prec);
          var nm = holeNameFor(holeNames, hi.dia);
          if (nm && lines.join(' ').indexOf(nm) < 0) lines.push(nm);
          return { lines: lines, dia: hi.dia };
        }
      }
      if (w.flat && wiz.length) {
        // a flat pattern's hole of a Hole Wizard feature (those of that drilled or largest diameter all read alike): its callout
        var mu = units === 'in' ? 0.0005 : 0.01, fw = wiz.filter(function (q) { var sp = HoleWizard.spec(q.feature, q.units); return Math.abs(+sp.dia - dia) <= mu || Math.abs(2 * q.ra - dia) <= mu; });
        if (fw.length && fw.every(function (q) { return JSON.stringify(wizardLines(q, units, 1, t.prec)) === JSON.stringify(wizardLines(fw[0], units, 1, t.prec)); })) return { lines: wizardLines(fw[0], units, 1, t.prec), dia: dia };
      }
      return { lines: ['Ø' + numText(dia, units, t.prec) + ' THRU ALL'], dia: dia };
    }
    var groups = {}, order = [];
    list.forEach(function (h) {
      var s = sizeOf(h), key = s.lines.join('\n');
      if (!groups[key]) { groups[key] = { key: key, lines: s.lines, dia: s.dia, holes: [] }; order.push(groups[key]); }
      groups[key].holes.push(h);
    });
    var q6 = function (x) { return Math.round(x / (tol * 100)); };
    order.sort(function (g1, g2) { return g1.dia - g2.dia || (g1.key < g2.key ? -1 : g1.key > g2.key ? 1 : 0); });
    var rows = [], n = 0;
    order.forEach(function (g, gi) {
      g.holes.sort(function (h1, h2) { return q6(h1.c[0]) - q6(h2.c[0]) || q6(h1.c[1]) - q6(h2.c[1]); });
      g.holes.forEach(function (h, j) {
        var x = h.c[0] - O[0], y = h.c[1] - O[1];
        if (Math.abs(x) < tol) x = 0;
        if (Math.abs(y) < tol) y = 0;
        n++;
        var tag = t.tagStyle === 'numeric' ? String(n) : holeTag(gi) + (t.combineTags ? '' : String(j + 1));
        rows.push({ tag: tag, c: h.c.slice(), r: h.r, x: x, y: y, xText: numText(x, units, t.prec), yText: numText(y, units, t.prec), size: g.lines.slice(), group: gi, dangling: !!h.dangling });
      });
    });
    return { origin: O.slice(), rows: rows, dangling: dangling };
  }
  // holeTablePrims(t, w, k, mesh, doc, units, ends, holeNames, textWidth, sheetBox) -> { prims, box (the table), tagBoxes,
  // rows, origin (paper), dangling, text }
  function holeTablePrims(t, w, k, mesh, doc, units, ends, holeNames, textWidth, sheetBox) {
    var R = holeTableRows(t, w, mesh, units, ends, holeNames), out = [], TL = 'TABLES', AL = 'ANNOTATIONS', th = HT_TEXT * k, rh = HT_ROW * k, id = t.id;
    function ln(a, b2, layer, st) { out.push({ k: 'line', a: a, b: b2, layer: layer, style: st || 'thin', holeTable: id }); }
    function tx(p, s, anchor, layer) { out.push({ k: 'text', p: p, h: th, text: s, anchor: anchor || 'start', layer: layer, rot: 0, holeTable: id }); }
    function arrowAt(tip, d) { var aw = (_.ARROW_W || 0.5) * k, al = 3 * k; out.push({ k: 'fill', pts: [tip, [tip[0] - d[0] * al + d[1] * aw, tip[1] - d[1] * al - d[0] * aw], [tip[0] - d[0] * al - d[1] * aw, tip[1] - d[1] * al + d[0] * aw]], layer: AL, holeTable: id }); }
    // tags beside the holes, up and right of each (paper), and the X / Y datum arrows at the origin
    var tagBoxes = [];
    R.rows.forEach(function (row) {
      var c = w.toSheet(row.c), o = row.r * w.scale * 0.72 + 0.8 * k, p = [c[0] + o, c[1] + o];
      tx(p, row.tag, 'start', AL);
      out[out.length - 1].holeTag = row.tag;
      if (row.dangling) out[out.length - 1].color = 'dangling';
      tagBoxes.push({ x0: p[0], y0: p[1], x1: p[0] + textWidth(row.tag, th), y1: p[1] + th });
    });
    var Os = w.toSheet(R.origin), L = 10 * k, n0 = out.length;
    ln(Os, [Os[0] + L, Os[1]], AL); arrowAt([Os[0] + L, Os[1]], [1, 0]); tx([Os[0] + L + 1.2 * k, Os[1] - th / 2], 'X', 'start', AL);
    ln(Os, [Os[0], Os[1] + L], AL); arrowAt([Os[0], Os[1] + L], [0, 1]); tx([Os[0], Os[1] + L + 1.2 * k], 'Y', 'middle', AL);
    if (R.dangling) for (var di = n0; di < out.length; di++) out[di].color = 'dangling';
    var nTags = out.length;
    // the table: TAG / X LOC / Y LOC / SIZE, a row per hole (a size of several lines: a taller row), merged cells
    var colW = HT_COLS.map(function (c) { return c[1] * k; });
    R.rows.forEach(function (row) {
      row.size.forEach(function (s) { colW[3] = Math.max(colW[3], textWidth(s, th) + 3 * k); });
      colW[0] = Math.max(colW[0], textWidth(row.tag, th) + 3 * k);
      colW[1] = Math.max(colW[1], textWidth(row.xText, th) + 3 * k);
      colW[2] = Math.max(colW[2], textWidth(row.yText, th) + 3 * k);
    });
    var heights = R.rows.map(function (row) { return t.combineSizes ? rh : rh * Math.max(1, row.size.length); });
    if (t.combineSizes) {
      // a merged SIZE cell is as tall as its rows, or as its lines when they need more: the last row of the size grows
      var gi0 = 0;
      for (var gi = 1; gi <= R.rows.length; gi++) {
        if (gi < R.rows.length && R.rows[gi].group === R.rows[gi0].group) continue;
        var need = rh * Math.max(1, R.rows[gi0].size.length), have = rh * (gi - gi0);
        if (need > have) heights[gi - 1] += need - have;
        gi0 = gi;
      }
    }
    var W = colW.reduce(function (s, x) { return s + x; }, 0), Ht = rh + heights.reduce(function (s, x) { return s + x; }, 0), x0, y1;
    if (t.x != null && t.y != null) { x0 = t.x; y1 = t.y; }
    else {
      // beside the view: right of it, under it, left of it, over it — the first spot on the sheet clear of the other
      // views, the title block and the tables (sheetBox.avoid), else right of it
      var wb = w.box, g12 = 12 * k, spots = [[wb.x1 + g12, wb.y1], [wb.x0, wb.y0 - g12], [wb.x0 - g12 - W, wb.y1], [wb.x0, wb.y1 + g12 + Ht]];
      var clear = function (sp) {
        var bb = { x0: sp[0], x1: sp[0] + W, y0: sp[1] - Ht, y1: sp[1] };
        if (sheetBox && (bb.x0 < sheetBox.x0 || bb.x1 > sheetBox.x1 || bb.y0 < sheetBox.y0 || bb.y1 > sheetBox.y1)) return false;
        return !((sheetBox && sheetBox.avoid) || []).some(function (o) { return o.x0 < bb.x1 && bb.x0 < o.x1 && o.y0 < bb.y1 && bb.y0 < o.y1; });
      };
      var pick = spots.filter(clear)[0] || spots[0];
      x0 = pick[0]; y1 = pick[1];
    }
    var colX = [x0]; colW.forEach(function (cw) { colX.push(colX[colX.length - 1] + cw); });
    var rowY = [y1, y1 - rh]; heights.forEach(function (h) { rowY.push(rowY[rowY.length - 1] - h); });
    var y0 = y1 - Ht;
    ln([x0, y0], [x0 + W, y0], TL, 'thick'); ln([x0 + W, y0], [x0 + W, y1], TL, 'thick'); ln([x0 + W, y1], [x0, y1], TL, 'thick'); ln([x0, y1], [x0, y0], TL, 'thick');
    for (var ci = 1; ci < 4; ci++) ln([colX[ci], y0], [colX[ci], y1], TL);
    ln([x0, rowY[1]], [x0 + W, rowY[1]], TL);
    for (var ri = 1; ri < R.rows.length; ri++) {
      var same = R.rows[ri].group === R.rows[ri - 1].group, yy = rowY[ri + 1];
      for (var cj = 0; cj < 4; cj++) {
        if (same && ((cj === 0 && t.combineTags) || (cj === 3 && t.combineSizes))) continue;
        ln([colX[cj], yy], [colX[cj + 1], yy], TL);
      }
    }
    HT_COLS.forEach(function (c, i) { tx([(colX[i] + colX[i + 1]) / 2, rowY[1] + (rh - th) / 2], c[0], 'middle', TL); });
    // the middle of the cells of rows i0 … i1
    function cellMid(i0, i1) { return (rowY[i0 + 1] + rowY[i1 + 2]) / 2; }
    function sizeLines(lines, mid) { lines.forEach(function (s, j) { tx([colX[3] + 1.5 * k, mid - th / 2 + ((lines.length - 1) / 2 - j) * rh], s, 'start', TL); }); }
    var r0 = 0;
    R.rows.forEach(function (row, i) {
      var mid = cellMid(i, i), last = i === R.rows.length - 1 || R.rows[i + 1].group !== row.group;
      if (!t.combineTags) tx([(colX[0] + colX[1]) / 2, mid - th / 2], row.tag, 'middle', TL);
      tx([(colX[1] + colX[2]) / 2, mid - th / 2], row.xText, 'middle', TL);
      tx([(colX[2] + colX[3]) / 2, mid - th / 2], row.yText, 'middle', TL);
      if (!t.combineSizes) sizeLines(row.size, mid);
      if (last) {
        var gm = cellMid(r0, i);
        if (t.combineTags) tx([(colX[0] + colX[1]) / 2, gm - th / 2], row.tag, 'middle', TL);
        if (t.combineSizes) sizeLines(row.size, gm);
        r0 = i + 1;
      }
    });
    if (R.dangling || R.rows.some(function (row) { return row.dangling; })) for (var dj = nTags; dj < out.length; dj++) out[dj].color = 'dangling';
    return { prims: out, box: { x0: x0, y0: y0, x1: x0 + W, y1: y1 }, tagBoxes: tagBoxes, rows: R.rows, origin: Os, originView: R.origin, dangling: R.dangling, colX: colX, rowY: rowY,
      text: 'Hole Table (' + R.rows.length + ' hole' + (R.rows.length === 1 ? '' : 's') + ')' };
  }
  // holeTableAt(sheet, p) -> the sheet's hole table whose box holds paper point p, or null
  function holeTableAt(sheet, p) {
    var hit = null;
    (sheet && sheet.holeTables || []).forEach(function (t) { var b = t.box; if (b && p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1) hit = t; });
    return hit;
  }
  // ------------------------------------------------------------------ rfCU: Cosmetic Thread, Dowel Pin Symbol, Datum
  // Target, Multi-jog Leader (SolidWorks' Insert ▸ Annotations). The first two sit on a hole circle of a view
  // (view.annotations, reattached to the circle on every render like a hole callout, dangling when it is gone):
  //  cosmeticThread: { c, r (the picked circle, view model units), size ('#10-32 UNF', ANSI Inch, HoleWizard.ANSI_THREADS),
  //    end: 'blind' | 'through', depth (blind, model units), callout (false: no callout), lead (the callout's elbow from
  //    the centre, paper), text (replaces the callout; <THREAD> is the standard one), external (a shaft / boss: size
  //    'auto' by major diameter, else by tap drill) }. Drawn as the end view of a thread: a thin 3/4 circle at the
  //    major diameter round a tapped hole (2B), at the minor diameter on a shaft (2A); the callout
  //    '#10-32 UNF - 2B ↧ .375' / '… THRU' on a leader.
  //  dowelPin: { c, r }: the hole circle with a cross and two opposite quadrants filled.
  // The other two are paper symbols (doc.symbols, they follow a view like the others):
  //  datumTarget: { datum: 'A', num: 1, area: 'point' | 'circle' | 'rect', aw, ah (the target area: diameter / width,
  //    height, model units, drawn at the view's scale), size (the upper half's text; default: the area's size), p the
  //    symbol's centre, leader the target point }: ASME Y14.5 — a circle split across, size above, A1 below, a leader
  //    to an X (point) or to a dot in a phantom outline (area).
  //  leader: { p (the start), jogs: [[x, y] …] (paper, the bend points in order), leader (the tip), end: 'arrow' |
  //    'dot' | 'none', note (a note id: the start follows that note's nearer side) }.
  var CU_DIM_SYM = 'Ø';
  function cuThreads() { return typeof HoleWizard !== 'undefined' && HoleWizard.ANSI_THREADS ? HoleWizard.ANSI_THREADS : []; }
  function cuThreadRow(size) { var k = String(size || '').replace(/\s+/g, ' ').trim().toUpperCase(); return cuThreads().filter(function (r) { return r.size.toUpperCase() === k; })[0] || null; }
  // the thread a hole of diameter dia (model units) is most likely tapped for: the nearest tap drill; external (a
  // shaft picked at its outside): the nearest major diameter; UNC before UNF on a tie
  function threadForDia(dia, units, external) {
    var din = units === 'mm' ? dia / 25.4 : dia, best = null, bs = Infinity;
    cuThreads().forEach(function (r) {
      var s = (external ? Math.abs(r.d - din) / r.d : Math.abs(r.tap - din) / r.tap) + (/UNF/.test(r.size) ? 1e-4 : 0);
      if (s < bs) { bs = s; best = r; }
    });
    return best;
  }
  function cuViewAnn(doc, viewId, spec, type) {
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    if (!spec || !spec.c || !(+spec.r > 0)) throw new Error((type === 'dowelPin' ? 'A dowel pin symbol' : 'A cosmetic thread') + ' needs a hole circle');
    return { v: v, an: { id: nextAnnotId(doc), type: type, c: [+spec.c[0], +spec.c[1]], r: +spec.r } };
  }
  function cleanThread(an, spec, units) {
    // external: a thread on a shaft / boss (class 2A, drawn at the minor diameter); a hole otherwise
    if (spec.external != null) { if (spec.external) an.external = true; else delete an.external; }
    var auto = spec.size === 'auto' || spec.size === '';
    if (spec.size != null || !an.size) {
      var row = spec.size != null && !auto ? cuThreadRow(spec.size) : threadForDia(2 * an.r, units, an.external);
      if (!row) throw new Error('No ANSI Inch thread ' + spec.size);
      an.size = row.size;
    }
    if (spec.end != null) an.end = spec.end === 'through' ? 'through' : 'blind';
    if (!an.end) an.end = 'through';
    if (spec.depth !== undefined) { if (+spec.depth > 0) an.depth = +spec.depth; else delete an.depth; }
    if (an.end === 'blind' && !(an.depth > 0)) throw new Error('A blind cosmetic thread needs a depth');
    if (an.end === 'through') delete an.depth;
    if (spec.callout != null) { if (spec.callout === false) an.callout = false; else delete an.callout; }
    if (spec.lead !== undefined) { if (spec.lead) an.lead = [+spec.lead[0], +spec.lead[1]]; else delete an.lead; }
    if (spec.text !== undefined) { if (spec.text && String(spec.text).trim()) an.text = String(spec.text); else delete an.text; }
    return an;
  }
  // addCosmeticThread(doc, viewId, { c, r, size, end, depth, callout, lead, text }) -> the annotation
  function addCosmeticThread(doc, viewId, spec) {
    var q = cuViewAnn(doc, viewId, spec, 'cosmeticThread');
    cleanThread(q.an, spec, doc.units);
    (q.v.annotations || (q.v.annotations = [])).push(q.an);
    return q.an;
  }
  function addDowelPin(doc, viewId, spec) {
    var q = cuViewAnn(doc, viewId, spec, 'dowelPin');
    (q.v.annotations || (q.v.annotations = [])).push(q.an);
    return q.an;
  }
  // editAnnotation(doc, id, props): a cosmetic thread's size / end / depth / callout / lead / text, a callout's lead
  function editAnnotation(doc, id, props) {
    var f = findAnnotation(doc, id);
    if (!f) throw new Error('No annotation ' + id);
    var an = f.annotation;
    if (an.type === 'cosmeticThread') { var c = JSON.parse(JSON.stringify(an)); cleanThread(c, props || {}, doc.units); Object.keys(an).forEach(function (q) { delete an[q]; }); Object.assign(an, c); }
    else if (props && props.lead !== undefined && an.type === 'holeCallout') { if (props.lead) an.lead = [+props.lead[0], +props.lead[1]]; else delete an.lead; }
    return an;
  }
  // the callout's text: '#10-32 UNF - 2B ↧ .375' / '#10-32 UNF - 2B THRU' (2A on a shaft)
  function threadCallout(an, units, external) {
    var std = an.size + ' - ' + (external ? '2A' : '2B') + (an.end === 'blind' && an.depth > 0 ? ' ↧ ' + numText(an.depth, units) : ' THRU');
    return an.text ? String(an.text).split('<THREAD>').join(std) : std;
  }
  function cuAnnotPrims(an, w, k, units, out, L) {
    var ref = { kind: 'dia', c: an.c, r: an.r }, dangling = false;
    if (reattachDim(ref, w.proj)) { an.c = ref.c; an.r = ref.r; } else dangling = true;
    var c = w.toSheet(an.c), rr = an.r * w.scale, text, info = { c: c, r: rr };
    if (an.type === 'dowelPin') {
      // the hole's circle, a cross through it past the circle and quadrants I and III filled
      out.push({ k: 'circle', c: c, r: rr, layer: L, style: 'thin' });
      var e = rr + 1.5 * k;
      out.push({ k: 'line', a: [c[0] - e, c[1]], b: [c[0] + e, c[1]], layer: L, style: 'thin' }, { k: 'line', a: [c[0], c[1] - e], b: [c[0], c[1] + e], layer: L, style: 'thin' });
      [0, 180].forEach(function (a0) {
        var pts = [c.slice()];
        for (var i = 0; i <= 12; i++) { var t = (a0 + 90 * i / 12) * Math.PI / 180; pts.push([c[0] + rr * Math.cos(t), c[1] + rr * Math.sin(t)]); }
        out.push({ k: 'fill', pts: pts, layer: L });
      });
      return { dangling: dangling, text: 'Dowel Pin ' + CU_DIM_SYM + numText(2 * an.r, units), info: info };
    }
    var row = cuThreadRow(an.size), inch = units === 'mm' ? 25.4 : 1;
    var major = row ? row.d * inch : 2 * an.r, external = !!an.external;
    // a tapped hole: the major diameter outside the drilled one; a shaft: the minor diameter (major − 1.299 P) inside
    var dT = external && row ? (row.d - 1.299 / row.tpi) * inch : major, rT = dT / 2 * w.scale;
    out.push({ k: 'arc', c: c, r: rT, a0: 105, a1: 15, layer: L, style: 'thin', thread: an.size });
    text = threadCallout(an, units, external);
    info.thread = an.size; info.major = major; info.external = external; info.drawnDia = dT; info.callout = an.callout !== false ? text : null;
    if (an.callout !== false) {
      var R = Math.max(rr, rT), lead = an.lead || [R + 8 * k, R + 8 * k], ll = Math.hypot(lead[0], lead[1]) || 1, u = [lead[0] / ll, lead[1] / ll];
      var tip = [c[0] + u[0] * R, c[1] + u[1] * R], elbow = [c[0] + lead[0], c[1] + lead[1]], sg = lead[0] >= 0 ? 1 : -1;
      var th = (_.DIMGEO && +_.DIMGEO.text > 0 ? +_.DIMGEO.text : 3.5) * k, ar = (_.DIMGEO && +_.DIMGEO.arrow > 0 ? +_.DIMGEO.arrow : 3) * k, aw = (_.ARROW_W || 0.5) * k, sh = (_.SHOULDER || 4) * k;
      out.push({ k: 'line', a: tip, b: elbow, layer: L, style: 'thin' }, { k: 'line', a: elbow, b: [elbow[0] + sg * sh, elbow[1]], layer: L, style: 'thin' });
      out.push({ k: 'fill', pts: [tip, [tip[0] + u[0] * ar - u[1] * aw, tip[1] + u[1] * ar + u[0] * aw], [tip[0] + u[0] * ar + u[1] * aw, tip[1] + u[1] * ar - u[0] * aw]], layer: L });
      text.split('\n').forEach(function (s, i, all) { out.push({ k: 'text', p: [elbow[0] + sg * (sh + (_.TEXT_GAP || 1) * k), elbow[1] - th / 2 + ((all.length - 1) / 2 - i) * th * 1.6], h: th, text: s, anchor: sg > 0 ? 'start' : 'end', layer: L, rot: 0 }); });
      an.leadNow = lead.slice();
    }
    return { dangling: dangling, text: 'Cosmetic Thread ' + text.replace(/\n/g, ' '), info: info };
  }
  var CU_SYMBOLS = { datumTarget: 1, leader: 1 };
  var TARGET_AREAS = [['point', 'Point'], ['circle', 'Circular area'], ['rect', 'Rectangular area']];
  var LEADER_ENDS = [['arrow', 'Arrow'], ['dot', 'Dot'], ['none', 'None']];
  function nextTargetNum(doc, datum) {
    var n = 0; (doc.symbols || []).forEach(function (s) { if (s.type === 'datumTarget' && s.datum === datum) n = Math.max(n, s.num || 0); });
    return n + 1;
  }
  function cleanCU(s, spec, doc) {
    var old = s.p ? s.p.slice() : null;
    if (spec.p) s.p = [+spec.p[0], +spec.p[1]];
    setAttach(s, spec.view);
    if (spec.leader !== undefined) { if (spec.leader) s.leader = [+spec.leader[0], +spec.leader[1]]; else delete s.leader; }
    if (s.type === 'datumTarget') {
      if (spec.datum != null) s.datum = String(spec.datum).trim().toUpperCase();
      if (!s.datum) s.datum = 'A';
      if (!/^[A-Z]{1,2}$/.test(s.datum)) throw new Error('A datum target needs a datum letter');
      if (spec.num != null) s.num = Math.max(1, Math.round(+spec.num) || 1);
      if (!s.num) s.num = doc ? nextTargetNum(doc, s.datum) : 1;
      if (spec.area != null) { if (!TARGET_AREAS.some(function (a) { return a[0] === spec.area; })) throw new Error('No datum target area ' + spec.area); s.area = spec.area; }
      if (!s.area) s.area = 'point';
      ['aw', 'ah'].forEach(function (q) { if (spec[q] !== undefined) { if (+spec[q] > 0) s[q] = +spec[q]; else delete s[q]; } });
      if (spec.size !== undefined) { var sz = String(spec.size == null ? '' : spec.size).trim(); if (sz) s.size = sz; else delete s.size; }
      if (s.area === 'point') { delete s.aw; delete s.ah; }
      else if (!(s.aw > 0) || (s.area === 'rect' && !(s.ah > 0))) throw new Error('A datum target area needs its size');
      if (s.area === 'circle') delete s.ah;
      if (!s.leader) throw new Error('A datum target needs a target point (leader)');
    } else {
      // a move of the whole leader (p alone) carries its jogs and tip along
      if (old && spec.p && !spec.jogs && spec.leader === undefined) {
        var dx = s.p[0] - old[0], dy = s.p[1] - old[1];
        if (s.jogs) s.jogs = s.jogs.map(function (q) { return [q[0] + dx, q[1] + dy]; });
        if (s.leader) s.leader = [s.leader[0] + dx, s.leader[1] + dy];
      }
      if (spec.jogs) s.jogs = spec.jogs.map(function (q) { return [+q[0], +q[1]]; }).filter(function (q) { return isFinite(q[0]) && isFinite(q[1]); });
      if (spec.jog != null && spec.at) { var j = +spec.jog; if (!s.jogs || !s.jogs[j]) throw new Error('No jog ' + spec.jog); s.jogs[j] = [+spec.at[0], +spec.at[1]]; }
      if (!s.jogs) s.jogs = [];
      if (spec.end != null) { if (!LEADER_ENDS.some(function (a) { return a[0] === spec.end; })) throw new Error('No leader end ' + spec.end); s.end = spec.end; }
      if (!s.end) s.end = 'arrow';
      if (spec.note !== undefined) { if (spec.note != null && spec.note !== false) s.note = +spec.note; else delete s.note; }
      if (!s.leader) throw new Error('A leader needs an end point');
    }
    return s;
  }
  function areaText(s, units) {
    if (s.size) return s.size;
    if (s.area === 'circle') return CU_DIM_SYM + numText(s.aw, units);
    if (s.area === 'rect') return numText(s.aw, units) + 'X' + numText(s.ah, units);
    return '';
  }
  function cuSymbolText(s, doc) {
    if (s.type === 'datumTarget') { var at = areaText(s, doc && doc.units); return 'DATUM TARGET ' + s.datum + s.num + (at ? ' ' + at : ''); }
    var nj = (s.jogs || []).length;
    return 'LEADER (' + (nj + 1) + ' segment' + (nj ? 's' : '') + (s.note != null ? ', NOTE' + s.note : '') + ')';
  }
  // the start of a leader attached to a note: the note's nearer side, middle of its first line
  function noteAnchor(doc, s, k, textWidth, toward) {
    var nt = null;
    (doc && doc.notes || []).forEach(function (n) { if (n.id === s.note) nt = n; });
    if (!nt) return null;
    var h = (+nt.h > 0 ? +nt.h : _.DIMGEO && +_.DIMGEO.text > 0 ? +_.DIMGEO.text : 3.5) * k, lines = String(nt.text).split('\n'), w = 0;
    lines.forEach(function (t) { w = Math.max(w, textWidth(t, h)); });
    var ind = nt.list ? textWidth(nt.list === 'number' ? lines.length + '. ' : '•  ', h) + 0.5 * k : 0, x0 = nt.p[0] - (nt.border ? 2 * k : 0), x1 = nt.p[0] + ind + w + (nt.border ? 2 * k : 0);
    var left = toward[0] < (x0 + x1) / 2;
    return [left ? x0 - k : x1 + k, nt.p[1] + h / 2];
  }
  // cuSymbolPrims(…) -> a leader's polyline (paper points) or null
  function cuSymbolPrims(s, k, textWidth, ln, tx, circ, fill, arrow, out, doc) {
    var L = 'SYMBOLS', p = s.p, units = doc && doc.units, h = (_.DIMGEO && +_.DIMGEO.text > 0 ? +_.DIMGEO.text : 3.5) * k;
    if (s.type === 'datumTarget') {
      var top = areaText(s, units), bot = s.datum + s.num, R = Math.max(5 * k, (Math.max(textWidth(top, h), textWidth(bot, h)) + 2 * k) / 2 / 0.8);
      circ(p, R);
      ln([p[0] - R, p[1]], [p[0] + R, p[1]]);
      if (top) tx([p[0], p[1] + R * 0.18], top, 'middle', h);
      tx([p[0], p[1] - R * 0.18 - h], bot, 'middle', h);
      var tip = s.leader, d = [tip[0] - p[0], tip[1] - p[1]], n = Math.hypot(d[0], d[1]) || 1, u = [d[0] / n, d[1] / n];
      if (n > R) ln([p[0] + u[0] * R, p[1] + u[1] * R], tip);
      if (s.area === 'point') {
        var x = 1.8 * k;
        ln([tip[0] - x, tip[1] - x], [tip[0] + x, tip[1] + x], 'thick'); ln([tip[0] - x, tip[1] + x], [tip[0] + x, tip[1] - x], 'thick');
      } else {
        // the target area drawn at its view's scale (phantom outline), the leader ends in a dot inside it
        var v = s.view && doc ? findView(doc, s.view) : null, sc = v && v.scale || doc && doc.sheet && doc.sheet.scale || [1, 1], f = sc[0] / sc[1];
        var ph = function (a, b) { out.push({ k: 'line', a: a, b: b, layer: L, style: 'chain', symbol: s.id }); };
        if (s.area === 'circle') out.push({ k: 'circle', c: tip.slice(), r: s.aw / 2 * f, layer: L, style: 'chain', symbol: s.id });
        else {
          var hw = s.aw / 2 * f, hh = s.ah / 2 * f;
          ph([tip[0] - hw, tip[1] - hh], [tip[0] + hw, tip[1] - hh]); ph([tip[0] + hw, tip[1] - hh], [tip[0] + hw, tip[1] + hh]);
          ph([tip[0] + hw, tip[1] + hh], [tip[0] - hw, tip[1] + hh]); ph([tip[0] - hw, tip[1] + hh], [tip[0] - hw, tip[1] - hh]);
        }
        var dr = 0.6 * k, dp = [];
        for (var i = 0; i < 12; i++) dp.push([tip[0] + dr * Math.cos(i * Math.PI / 6), tip[1] + dr * Math.sin(i * Math.PI / 6)]);
        fill(dp);
      }
      return null;
    }
    // multi-jog leader: the start (or the note's side), the jogs, the tip with its end
    var jogs = s.jogs || [], first = jogs[0] || s.leader, start = s.note != null ? noteAnchor(doc, s, k, textWidth, first) || p : p;
    var pts = [start].concat(jogs, [s.leader]);
    for (var j = 1; j < pts.length; j++) ln(pts[j - 1], pts[j]);
    var last = pts[pts.length - 2], tp = s.leader;
    if (s.end === 'arrow') arrow(tp, last);
    else if (s.end === 'dot') { var dq = [], rd = 0.75 * k; for (var q = 0; q < 12; q++) dq.push([tp[0] + rd * Math.cos(q * Math.PI / 6), tp[1] + rd * Math.sin(q * Math.PI / 6)]); fill(dq); }
    return pts;
  }
  // (rfCU) note borders and lists: border 'circle' | 'triangle' | 'square' | 'hexagon' | 'flag' (Flag Triangle: the
  // flag note) round the note, list 'number' (1. 2. … per line, hanging indent) | 'bullet'
  var NOTE_BORDERS = [['none', 'None'], ['circle', 'Circle'], ['triangle', 'Triangle'], ['square', 'Square'], ['hexagon', 'Hexagon'], ['flag', 'Flag Triangle']];
  var NOTE_LISTS = [['none', 'None'], ['number', 'Numbered'], ['bullet', 'Bulleted']];
  function cleanNoteFmt(nt, spec) {
    if (spec.border !== undefined) {
      if (spec.border && spec.border !== 'none') { if (!NOTE_BORDERS.some(function (b) { return b[0] === spec.border; })) throw new Error('No note border ' + spec.border); nt.border = spec.border; } else delete nt.border;
    }
    if (spec.list !== undefined) {
      if (spec.list && spec.list !== 'none') { if (!NOTE_LISTS.some(function (b) { return b[0] === spec.list; })) throw new Error('No note list ' + spec.list); nt.list = spec.list; } else delete nt.list;
    }
    return nt;
  }
  // noteLayout(nt, lines, h, k, textWidth) -> { prims, box } (rfCU): the note's lines with their list markers (the text
  // on a hanging indent) and its border; box the text's box, or the border's
  function noteLayout(nt, lines, h, k, textWidth) {
    var out = [], r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, n = lines.length;
    var mark = function (i) { return nt.list === 'number' ? (i + 1) + '.' : nt.list === 'bullet' ? '•' : ''; };
    var ind = nt.list ? textWidth(nt.list === 'number' ? n + '. ' : '•  ', h) + 0.5 * k : 0;
    lines.forEach(function (s, i) {
      var p = [nt.p[0], nt.p[1] - i * h * 1.6];
      if (s.length) {
        if (nt.list && s.trim()) out.push({ k: 'text', p: p.slice(), h: h, text: mark(i), anchor: 'start', layer: 'NOTES', rot: 0, note: nt.id });
        out.push({ k: 'text', p: [p[0] + ind, p[1]], h: h, text: s, anchor: 'start', layer: 'NOTES', rot: 0, note: nt.id });
      }
      r.x0 = Math.min(r.x0, p[0]); r.x1 = Math.max(r.x1, p[0] + ind + Math.max(textWidth(s, h), h * 0.5)); r.y0 = Math.min(r.y0, p[1]); r.y1 = Math.max(r.y1, p[1] + h);
    });
    if (nt.border) {
      var m = 1.5 * k, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, W = r.x1 - r.x0 + 2 * m, H = r.y1 - r.y0 + 2 * m, P = null, b = nt.border;
      if (b === 'circle') { var rc = Math.hypot(W, H) / 2; out.push({ k: 'circle', c: [cx, cy], r: rc, layer: 'NOTES', style: 'thin', note: nt.id }); r = { x0: cx - rc, x1: cx + rc, y0: cy - rc, y1: cy + rc }; }
      else if (b === 'square') { var sq = Math.max(W, H) / 2; P = [[cx - sq, cy - sq], [cx + sq, cy - sq], [cx + sq, cy + sq], [cx - sq, cy + sq]]; }
      else if (b === 'hexagon') { var hr = Math.max(W / Math.sqrt(3), H / 1.5) * 0.75 + m; P = []; for (var i = 0; i < 6; i++) { var t = 60 * i * Math.PI / 180; P.push([cx + hr * Math.cos(t), cy + hr * Math.sin(t)]); } }
      else {
        // an equilateral triangle, point up, round the text (a Flag Triangle at least 7 mm a side, as a flag note)
        var side = Math.max(W + 2 * H / Math.sqrt(3), (b === 'flag' ? 7 : 0) * k), yb = r.y0 - m;
        P = [[cx - side / 2, yb], [cx + side / 2, yb], [cx, yb + side * Math.sqrt(3) / 2]];
      }
      if (P) {
        for (var e = 0; e < P.length; e++) out.push({ k: 'line', a: P[e], b: P[(e + 1) % P.length], layer: 'NOTES', style: 'thin', note: nt.id });
        r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        P.forEach(function (q) { r.x0 = Math.min(r.x0, q[0]); r.x1 = Math.max(r.x1, q[0]); r.y0 = Math.min(r.y0, q[1]); r.y1 = Math.max(r.y1, q[1]); });
      }
    }
    return { prims: out, box: r };
  }
  D.addCosmeticThread = addCosmeticThread; D.addDowelPin = addDowelPin; D.editAnnotation = editAnnotation; D.threadForDia = threadForDia; D.threadCallout = threadCallout;
  D.TARGET_AREAS = TARGET_AREAS; D.LEADER_ENDS = LEADER_ENDS; D.NOTE_BORDERS = NOTE_BORDERS; D.NOTE_LISTS = NOTE_LISTS; D.nextTargetNum = nextTargetNum;
  _.noteLayout = noteLayout;

  D.CLOUD_SHAPES = CLOUD_SHAPES; D.WELD_TYPES = WELD_TYPES; D.cloudArcs = cloudArcs; D.weldText = weldText;
  D.findHoleTable = findHoleTable; D.addHoleTable = addHoleTable; D.editHoleTable = editHoleTable; D.deleteHoleTable = deleteHoleTable; D.moveHoleTable = moveHoleTable;
  D.viewHoles = viewHoles; D.holeTableRows = holeTableRows; D.holeTablePrims = holeTablePrims; D.holeTableAt = holeTableAt;
  D.GTOL_CHARS = GTOL_CHARS; D.SF_SYMBOLS = SF_SYMBOLS; D.nextDatum = nextDatum; D.addSymbol = addSymbol; D.findSymbol = findSymbol; D.editSymbol = editSymbol; D.deleteSymbol = deleteSymbol;
  D.symbolText = symbolText; D.symbolPrims = symbolPrims; D.datumRef = datumRef;

  D.addNote = addNote; D.followViews = followViews; D.findNote = findNote; D.editNote = editNote; D.deleteNote = deleteNote; D.flatAnnotation = flatAnnotation;
  D.holeSizeNames = holeSizeNames;
  D.addAngularRunning = addAngularRunning; D.addPathLength = addPathLength; D.angRunMeasure = angRunMeasure; D.pathLengthOf = pathLengthOf;   // (lane CT)
  D.pathRefFrom = pathRefFrom; D.pathRefEnds = pathRefEnds; D.pathRefMid = pathRefMid; D.pathChained = pathChained; D.ctAngleText = ctAngleText; _.ctDimPrims = ctDimPrims;
  D.smartDim = smartDim; D.addSmartDim = addSmartDim; D.measurePair = measurePair; D.finishAngles = finishAngles; D._anglePrims = anglePrims;
  _.holeEnds = holeEnds; _.finishAngles = finishAngles; _.refPos = refPos; _.reattachUserDim = reattachUserDim; _.partThreads = partThreads; _.threadsAlong = threadsAlong; _.annotationPrims = annotationPrims;
})(Drawing, Drawing._);
