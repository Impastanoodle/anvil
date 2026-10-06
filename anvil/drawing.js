// drawing.js — 2D drawings of the active part or assembly (SolidWorks: File ▸ Make Drawing from Part / Assembly).
// An assembly is drawn from its solved mesh (one body per component, so hidden lines run across components and
// section views hatch each component at its own angle) and gets a Bill of Materials table and Auto Balloons.
// The drawing engine `Drawing` (no UI needed: loaded by tests/kernel-tests.html and by drawing-worker.js) is spread
// over this file and the drawing-*.js files after it, in load order:
//   * drawing.js (this file): the `Drawing` object, view orientations and frames, the view-independent model edges;
//   * drawing-curves.js: true curves from the kernel's analytic records (exact circles, arcs, ellipses, cylinder / cone
//     silhouettes, the surface records' distance functions and intersection curves);
//   * drawing-hlr.js: orthographic and isometric projection of a mesh with exact hidden-line removal (every candidate
//     edge is clipped against the front-facing triangles, not a screenshot), chains, circles and arcs fitted to chords;
//   * drawing-views.js: section views (an exact CSG cut and its hatching), detail views, dimensions that follow the part;
//   * drawing-sheet.js: sheets and scales, the drawing document and its views, the title block, automatic model
//     dimensions (overall sizes, hole / boss diameters), the Bill of Materials and balloon placement;
//   * drawing-annotations.js: centre marks, centrelines, hole callouts read from the solid, ordinate / baseline /
//     chamfer dimensions, tolerances and precision, model dimensions that drive the part, manual and stacked balloons;
//   * drawing-render.js: the sheet primitives (compute) and the writers for SVG, DXF (one layer per view) and PDF.
//   The drawing document UI (only when `UI` exists: File ▸ Make Drawing from Part, the View Layout and Annotation
//   ribbon tabs, the drawing FeatureManager, the sheet with pan / zoom and view dragging, the PropertyManagers) is
//   drawing-ui.js, drawing-ui-tools.js and drawing-ui-panels.js.
// Coordinates: a view maps a world point p to (u, v) = (p·u, p·v) in model units; the sheet is in paper units (the
// model's units, mm or in) with the origin at the lower-left corner and y up. Sheet scale s: paper = model × s.
//
// Drawing is one object, made here and extended by each engine file: `(function (D, _) { … })(Drawing, Drawing._)`
// adds that file's public members to D. Drawing._ is the engine's internal namespace: the private helpers, constants
// and module-level state that more than one engine file uses (frameKey, meshDiag, TWO_PI, the sheet sizes, textWidth,
// LAZY …). A file aliases what an earlier file put there (`var meshDiag = _.meshDiag;`) and calls through `_.name` or
// `D.name` for what a later file adds, so late binding works; state that is reassigned (LAZY) is always read as _.LAZY.
// Nothing on Drawing._ is API: tests, the worker and the app use Drawing's own members only, and the property is not
// enumerable, so Object.keys(Drawing) lists the API alone.
var Drawing = {};
Object.defineProperty(Drawing, '_', { value: {}, enumerable: false, configurable: true, writable: true });
(function (D, _) {
  'use strict';
  var K = Kernel, V = K.vec;
  var TWO_PI = 2 * Math.PI;

  // ------------------------------------------------------------------ view orientations
  // [toward the viewer, up] — the same pairs as the viewport's standard views (ui-core.js VIEWS)
  var ORIENTS = {
    Front: [[0, 0, 1], [0, 1, 0]], Back: [[0, 0, -1], [0, 1, 0]], Left: [[-1, 0, 0], [0, 1, 0]], Right: [[1, 0, 0], [0, 1, 0]],
    Top: [[0, 1, 0], [0, 0, -1]], Bottom: [[0, -1, 0], [0, 0, 1]], Isometric: [[1, 1, 1], [0, 1, 0]],
    Dimetric: [[1, 0.6, 1], [0, 1, 0]], Trimetric: [[0.55, 0.45, 1], [0, 1, 0]]
  };
  var ORTHO = { Front: 1, Back: 1, Left: 1, Right: 1, Top: 1, Bottom: 1 };
  // orientation(name) -> { name, e (unit, toward the viewer), u (sheet right), v (sheet up) }; u × v = e
  function orientation(name) {
    var o = ORIENTS[name];
    if (!o) throw new Error('Unknown view orientation "' + name + '"');
    var e = V.norm(o[0]), u = V.norm(V.cross(o[1], e)), v = V.cross(e, u);
    return { name: name, e: e, u: u, v: v };
  }
  // frameOf(orient | { e, u, v, name? }): a named orientation, or a stored frame (projected and section views, whose
  // direction comes from their parent). A stored frame that equals a named one takes its name.
  function frameOf(o) {
    if (typeof o === 'string') return orientation(o);
    var F = { e: o.e.slice(), u: o.u.slice(), v: o.v.slice() };
    F.name = o.name || matchOrient(F) || 'Projected';
    return F;
  }
  function matchOrient(F) {
    var names = Object.keys(ORIENTS);
    for (var i = 0; i < names.length; i++) {
      var O = orientation(names[i]);
      if (V.dot(O.e, F.e) > 1 - 1e-9 && V.dot(O.u, F.u) > 1 - 1e-9) return names[i];
    }
    return null;
  }
  function frameKey(F) { return [F.e, F.u, F.v].map(function (a) { return a.map(function (x) { return Math.round(x * 1e9); }).join(','); }).join('|'); }
  // a view looks straight along a model axis: edges parallel to the sheet are drawn at true length
  function isOrthoFrame(F) { return Math.max(Math.abs(F.e[0]), Math.abs(F.e[1]), Math.abs(F.e[2])) > 1 - 1e-9; }
  // projectedFrame(parentFrame, dir, projection): the view seen from the side it is placed on ('up' | 'down' | 'left' |
  // 'right' of its parent) in third-angle projection, from the opposite side in first angle. Vertical neighbours share
  // the parent's u (so they line up in x), horizontal ones its v (level in y). Front + up = Top, Front + right = Right.
  var DIRS = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
  function projectedFrame(P, dir, projection) {
    var d = DIRS[dir];
    if (!d) throw new Error('Projection direction must be up, down, left or right');
    var sg = projection === 'first' ? -1 : 1;
    var e = V.add(V.scale(P.u, sg * d[0]), V.scale(P.v, sg * d[1])), F;
    if (d[0] === 0) F = { e: e, u: P.u.slice(), v: V.cross(e, P.u) };
    else F = { e: e, u: V.cross(P.v, e), v: P.v.slice() };
    return frameOf(F);
  }
  // sectionFrame(parentFrame, axis, sign): a cutting line horizontal ('h', at v = at) or vertical ('v', at u = at) in
  // the parent. The viewer stands on the +e side (e = sign × the parent's v or u) and looks back at the cut face.
  function sectionFrame(P, axis, sign) {
    return projectedFrame(P, axis === 'h' ? (sign > 0 ? 'up' : 'down') : (sign > 0 ? 'right' : 'left'), 'third');
  }

  // ------------------------------------------------------------------ model edges (view independent)
  // The kernel's coarsest curved facets turn 22.5° (a 16-gon circle, a slot end, a 90° fillet in 4 steps), so faces
  // meeting at less than 23° are treated as one smooth surface: drawn only where they form a silhouette.
  var COS_SMOOTH = Math.cos(23 * Math.PI / 180);
  var COS_CREASE = Math.cos(2 * Math.PI / 180);   // true normals further apart than this: a crease, not tangent (r5/drawings5)
  function meshDiag(mesh) {
    var p = mesh.positions64 || mesh.positions, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) { var x = p[i + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
    return p.length ? Math.max(1e-9, V.len(V.sub(mx, mn))) : 1;
  }
  // Every face-outline segment, split at every endpoint of a collinear segment (T-junctions between faces whose
  // polygons were split differently), then paired by position: [{ a, b, faces: [i…], normals: [n…] }].
  // Cached on the mesh object (meshes are immutable once built).
  function meshEdges(mesh) {
    if (mesh._drawingEdges) return mesh._drawingEdges;
    var diag = meshDiag(mesh), q = diag * 1e-7 + 1e-12;
    var lines = {}, order = [];
    for (var fi = 0; fi < mesh.faces.length; fi++) {
      var o;
      try { o = K.faceOutline(mesh, fi); } catch (err) { o = null; }
      if (!o) continue;
      o.loops.forEach(function (loop) {
        var pts = loop.map(function (p2) { return K.to3D(o.plane, p2[0], p2[1]); });
        for (var k = 0; k < pts.length; k++) {
          var a = pts[k], b = pts[(k + 1) % pts.length], d = V.sub(b, a), L = V.len(d);
          if (L < q * 10) continue;
          d = V.scale(d, 1 / L);
          // canonical direction: first clearly non-zero component positive
          var c = Math.abs(d[0]) > 1e-9 ? d[0] : Math.abs(d[1]) > 1e-9 ? d[1] : d[2];
          if (c < 0) d = V.scale(d, -1);
          var p0 = V.sub(a, V.scale(d, V.dot(a, d)));
          var key = Math.round(d[0] * 1e6) + ',' + Math.round(d[1] * 1e6) + ',' + Math.round(d[2] * 1e6) + '|' +
            Math.round(p0[0] / (q * 100)) + ',' + Math.round(p0[1] / (q * 100)) + ',' + Math.round(p0[2] / (q * 100));
          var ln = lines[key];
          if (!ln) { ln = lines[key] = { d: d, segs: [], ts: [] }; order.push(key); }
          var ta = V.dot(a, ln.d), tb = V.dot(b, ln.d);
          ln.segs.push({ a: a, t0: Math.min(ta, tb), t1: Math.max(ta, tb), face: fi });
          ln.ts.push(ta, tb);
        }
      });
    }
    var tolT = q * 100;
    var out = [];
    order.forEach(function (key) {
      var ln = lines[key];
      var ts = ln.ts.slice().sort(function (x, y) { return x - y; }), uniq = [];
      ts.forEach(function (t) { if (!uniq.length || t - uniq[uniq.length - 1] > tolT) uniq.push(t); });
      var pieces = {}, porder = [];
      ln.segs.forEach(function (s) {
        var cuts = [s.t0];
        uniq.forEach(function (t) { if (t > s.t0 + tolT && t < s.t1 - tolT) cuts.push(t); });
        cuts.push(s.t1);
        var ta = V.dot(s.a, ln.d);
        for (var i = 0; i + 1 < cuts.length; i++) {
          // pieces are kept per body: where two bodies (assembly components) share an edge position, each body's
          // edge is judged sharp or smooth on its own faces (a pin in a hole must not turn its facet lines sharp)
          var k0 = Math.round(cuts[i] / tolT), k1 = Math.round(cuts[i + 1] / tolT), pk = (mesh.faces[s.face].body || 0) + ':' + k0 + ':' + k1;
          var pc = pieces[pk];
          if (!pc) {
            pc = pieces[pk] = { a: V.add(s.a, V.scale(ln.d, cuts[i] - ta)), b: V.add(s.a, V.scale(ln.d, cuts[i + 1] - ta)), faces: [], normals: [] };
            porder.push(pk);
          }
          if (pc.faces.indexOf(s.face) < 0) { pc.faces.push(s.face); pc.normals.push(mesh.faces[s.face].normal); }
        }
      });
      porder.forEach(function (pk) {
        var pc = pieces[pk];
        pc.smooth = false;
        if (pc.normals.length === 2) pc.smooth = V.dot(pc.normals[0], pc.normals[1]) > COS_SMOOTH;
        out.push(pc);
      });
    });
    out = pairOpenEdges(mesh, out, diag * 1e-4 + 1e-9);
    mesh._drawingEdges = out;
    return out;
  }
  // The line keys above round a direction and a foot point, so two copies of one edge whose float coordinates differ
  // in the last digits (OpenCascade's triangulation: a sliver triangle's vertex a micron off, a long chord whose
  // direction straddles a rounding step) can land on different keys and each come out with one face, i.e. as an open
  // "sharp" edge: a stray line across a smooth face. Pieces left with one face are paired again here with a distance
  // tolerance: collinear open pieces of one body (every end within tolD of the other's line, overlapping) are split
  // at each other's ends and the pieces get both faces, so they are judged smooth / same-surface like any other edge.
  function pairOpenEdges(mesh, out, tolD) {
    var open = [];
    out.forEach(function (pc, i) { if (pc.faces.length === 1) open.push(i); });
    if (open.length < 2 || open.length > 6000) return out;
    var info = open.map(function (i) {
      var pc = out[i], d = V.sub(pc.b, pc.a), L = V.len(d);
      return { i: i, pc: pc, d: L > 0 ? V.scale(d, 1 / L) : [1, 0, 0], L: L, body: mesh.faces[pc.faces[0]].body || 0,
        lo: [Math.min(pc.a[0], pc.b[0]) - tolD, Math.min(pc.a[1], pc.b[1]) - tolD, Math.min(pc.a[2], pc.b[2]) - tolD],
        hi: [Math.max(pc.a[0], pc.b[0]) + tolD, Math.max(pc.a[1], pc.b[1]) + tolD, Math.max(pc.a[2], pc.b[2]) + tolD] };
    });
    function off(p, x) { var w = V.sub(p, x.pc.a), t = V.dot(w, x.d); return V.len(V.sub(w, V.scale(x.d, t))); }
    var par = info.map(function (x, k) { return k; });
    function find(k) { while (par[k] !== k) k = par[k] = par[par[k]]; return k; }
    var hit = false;
    // sweep along x so only pieces whose boxes meet are compared
    var ord = info.map(function (x, k) { return k; }).sort(function (p, q) { return info[p].lo[0] - info[q].lo[0]; });
    for (var s = 0; s < ord.length; s++) {
      var A = info[ord[s]];
      for (var t = s + 1; t < ord.length; t++) {
        var B = info[ord[t]];
        if (B.lo[0] > A.hi[0]) break;
        if (B.body !== A.body || B.pc.faces[0] === A.pc.faces[0]) continue;
        if (B.lo[1] > A.hi[1] || B.hi[1] < A.lo[1] || B.lo[2] > A.hi[2] || B.hi[2] < A.lo[2]) continue;
        var lng = A.L >= B.L ? A : B, sht = lng === A ? B : A;
        if (off(sht.pc.a, lng) > tolD || off(sht.pc.b, lng) > tolD) continue;
        var ta = V.dot(V.sub(sht.pc.a, lng.pc.a), lng.d), tb = V.dot(V.sub(sht.pc.b, lng.pc.a), lng.d);
        if (Math.min(Math.max(ta, tb), lng.L) - Math.max(Math.min(ta, tb), 0) <= tolD) continue;   // only touching
        par[find(ord[s])] = find(ord[t]); hit = true;
      }
    }
    if (!hit) return out;
    var groups = {}, drop = {}, extra = [];
    info.forEach(function (x, k) { var r = find(k); (groups[r] || (groups[r] = [])).push(x); });
    Object.keys(groups).forEach(function (r) {
      var g = groups[r];
      if (g.length < 2) return;
      var ref = g.reduce(function (m, x) { return x.L > m.L ? x : m; }, g[0]), o = ref.pc.a, d = ref.d;
      var segs = g.map(function (x) { var t0 = V.dot(V.sub(x.pc.a, o), d), t1 = V.dot(V.sub(x.pc.b, o), d); return { t0: Math.min(t0, t1), t1: Math.max(t0, t1), x: x }; });
      var ts = [];
      segs.forEach(function (sg) { ts.push(sg.t0, sg.t1); });
      ts.sort(function (p, q) { return p - q; });
      var uniq = [];
      ts.forEach(function (t) { if (!uniq.length || t - uniq[uniq.length - 1] > tolD) uniq.push(t); });
      function snap(t) { for (var j = 0; j < uniq.length; j++) if (Math.abs(uniq[j] - t) <= tolD) return j; return -1; }
      var pieces = {}, porder = [];
      segs.forEach(function (sg) {
        var j0 = snap(sg.t0), j1 = snap(sg.t1);
        for (var j = j0; j < j1; j++) {
          var pc = pieces[j];
          if (!pc) { pc = pieces[j] = { a: V.add(o, V.scale(d, uniq[j])), b: V.add(o, V.scale(d, uniq[j + 1])), faces: [], normals: [] }; porder.push(j); }
          var f = sg.x.pc.faces[0];
          if (pc.faces.indexOf(f) < 0) { pc.faces.push(f); pc.normals.push(sg.x.pc.normals[0]); }
        }
      });
      g.forEach(function (x) { drop[x.i] = 1; });
      porder.forEach(function (j) {
        var pc = pieces[j];
        pc.smooth = pc.normals.length === 2 && V.dot(pc.normals[0], pc.normals[1]) > COS_SMOOTH;
        extra.push(pc);
      });
    });
    return out.filter(function (pc, i) { return !drop[i]; }).concat(extra);
  }

  // closeEnds(lines, ellipses, arcs, circles, tol) (r7/drawings7): a visible line, arc or ellipse cut short by an
  // occluder ends on that occluder's drawn outline. The hidden parts are found against the facets, and where the
  // occluder is a curved face (a hole's wall seen into in an isometric view) its chordal facets stand inside the true
  // surface while its rim is drawn as the true ellipse: the far edge stopped up to 0.013 mm short of the near rim. An
  // end within tol of another piece of linework (not meeting it, not the same curve) is moved along its own line /
  // curve to where it crosses that linework, if it crosses within tol of the end.
  function closeEnds(lines, ells, arcs, circs, tol) {
    var els = [];
    lines.forEach(function (l) { els.push({ k: 'l', o: l }); });
    ells.forEach(function (q) { els.push({ k: 'c', o: q, c: q.c, ax: q.ax, ay: q.ay, t0: q.full ? 0 : q.t0, t1: q.full ? TWO_PI : q.t1, full: q.full }); });
    arcs.forEach(function (a) { els.push({ k: 'c', o: a, arc: true, c: a.c, ax: [a.r, 0], ay: [0, a.r], t0: a.a0 * Math.PI / 180, t1: a.a1 * Math.PI / 180 }); });
    circs.forEach(function (c) { els.push({ k: 'c', o: c, c: c.c, ax: [c.r, 0], ay: [0, c.r], t0: 0, t1: TWO_PI, full: true }); });
    if (els.length < 2 || els.length > 20000 || !(tol > 0)) return;
    function cp(E, t) { return [E.c[0] + Math.cos(t) * E.ax[0] + Math.sin(t) * E.ay[0], E.c[1] + Math.cos(t) * E.ax[1] + Math.sin(t) * E.ay[1]]; }
    function hyp(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }
    function segD(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
    els.forEach(function (E) {
      if (E.k === 'l') { var l = E.o; E.b = [Math.min(l[0], l[2]), Math.min(l[1], l[3]), Math.max(l[0], l[2]), Math.max(l[1], l[3])]; return; }
      var rx = Math.hypot(E.ax[0], E.ay[0]), ry = Math.hypot(E.ax[1], E.ay[1]);
      E.b = [E.c[0] - rx, E.c[1] - ry, E.c[0] + rx, E.c[1] + ry];
      var det = E.ax[0] * E.ay[1] - E.ax[1] * E.ay[0];
      E.det = det; E.rm = Math.sqrt(Math.abs(det));
    });
    // distance from p to what is drawn of E
    function dist(E, p) {
      if (E.k === 'l') return segD(p, E.o);
      var n = 48, h = (E.t1 - E.t0) / n, bt = E.t0, bd = Infinity;
      for (var i = 0; i <= n; i++) { var t = E.t0 + h * i, d = hyp(cp(E, t), p); if (d < bd) { bd = d; bt = t; } }
      var lo = Math.max(E.t0, bt - h), hi = Math.min(E.t1, bt + h);
      for (var it = 0; it < 70 && hi - lo > 1e-15; it++) {
        var m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618;
        if (hyp(cp(E, m1), p) < hyp(cp(E, m2), p)) hi = m2; else lo = m1;
      }
      return Math.min(bd, hyp(cp(E, (lo + hi) / 2), p));
    }
    // signed distance-like function of E's whole line / curve (zero on it)
    function side(E, p) {
      if (E.k === 'l') { var l = E.o, dx = l[2] - l[0], dy = l[3] - l[1], L = Math.hypot(dx, dy); return L ? ((p[0] - l[0]) * dy - (p[1] - l[1]) * dx) / L : Infinity; }
      if (!E.det) return Infinity;
      var qx = p[0] - E.c[0], qy = p[1] - E.c[1], a = (qx * E.ay[1] - qy * E.ay[0]) / E.det, b = (E.ax[0] * qy - E.ax[1] * qx) / E.det;
      return (Math.hypot(a, b) - 1) * E.rm;
    }
    function sameCurve(A, B) {
      if (A.k !== B.k) return false;
      if (A.k === 'l') {
        var a = A.o, b = B.o, dx = a[2] - a[0], dy = a[3] - a[1], L = Math.hypot(dx, dy) || 1;
        return Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / L < 1e-9 && Math.abs((b[2] - a[0]) * dy - (b[3] - a[1]) * dx) / L < 1e-9;
      }
      var e9 = 1e-9 * (1 + A.rm);
      return hyp(A.c, B.c) < e9 && [0.7, 2.1, 4.0].every(function (t) { return Math.abs(side(B, cp(A, t))) < e9; });
    }
    // own[i] at the end: P(s), s the distance moved outward along the piece (negative: shortened)
    function mover(E, end) {
      if (E.k === 'l') {
        var l = E.o, p = end ? [l[2], l[3]] : [l[0], l[1]], q = end ? [l[0], l[1]] : [l[2], l[3]], L = hyp(p, q);
        if (L < 1e-12) return null;
        var d = [(p[0] - q[0]) / L, (p[1] - q[1]) / L];
        return { p: p, max: L * 0.5, at: function (s) { return [p[0] + d[0] * s, p[1] + d[1] * s]; },
          set: function (s) { var r = this.at(s); if (end) { l[2] = r[0]; l[3] = r[1]; } else { l[0] = r[0]; l[1] = r[1]; } } };
      }
      if (E.full) return null;
      var te = end ? E.t1 : E.t0, sg = end ? 1 : -1, dv = [-Math.sin(te) * E.ax[0] + Math.cos(te) * E.ay[0], -Math.sin(te) * E.ax[1] + Math.cos(te) * E.ay[1]], sp = Math.hypot(dv[0], dv[1]);
      if (sp < 1e-12) return null;
      return { p: cp(E, te), max: (E.t1 - E.t0) * sp * 0.5, at: function (s) { return cp(E, te + sg * s / sp); },
        set: function (s) {
          var t = te + sg * s / sp;
          if (end) E.t1 = t; else E.t0 = t;
          if (E.arc) { if (end) E.o.a1 = t * 180 / Math.PI; else E.o.a0 = t * 180 / Math.PI; } else if (end) E.o.t1 = t; else E.o.t0 = t;
        } };
    }
    els.forEach(function (E) {
      [0, 1].forEach(function (end) {
        var M = mover(E, end);
        if (!M) return;
        var p = M.p, eps = 1e-9 * (1 + Math.abs(p[0]) + Math.abs(p[1])), best = null, bd = Infinity, met = false;
        for (var i = 0; i < els.length && !met; i++) {
          var O = els[i];
          if (O === E || p[0] < O.b[0] - tol || p[0] > O.b[2] + tol || p[1] < O.b[1] - tol || p[1] > O.b[3] + tol) continue;
          var d = dist(O, p);
          if (d <= eps) met = true;
          else if (d < tol && d < bd && !sameCurve(E, O)) { bd = d; best = O; }
        }
        if (met || !best) return;
        // the crossing nearest the end, within tol of it
        var R = Math.min(tol * 2, M.max), N = 32, g0 = side(best, p), sol = null;
        if (!isFinite(g0)) return;
        for (var k = 1; k <= N && sol == null; k++) {
          [1, -1].forEach(function (sg) {
            if (sol != null) return;
            var a = sg * R * (k - 1) / N, b = sg * R * k / N, ga = side(best, M.at(a)), gb = side(best, M.at(b));
            if (ga === 0) { sol = a; return; }
            if (ga * gb > 0) return;
            for (var it = 0; it < 80; it++) { var m = (a + b) / 2, gm = side(best, M.at(m)); if (ga * gm <= 0) b = m; else { a = m; ga = gm; } }
            sol = (a + b) / 2;
          });
        }
        var lim = 1e-6 * (1 + tol);
        if (sol == null) {
          // no crossing: a curve meeting a line or curve tangentially (a silhouette running into a rim) touches it
          // where |side| is least
          // (near a tangency a gap bd lies about sqrt(2 bd ρ) along the curve from the touching point)
          var rho = Math.max(best.rm || 0, E.rm || 0), R2 = Math.min(M.max, Math.max(R, 2 * Math.sqrt(2 * bd * rho)));
          var bs = 0, bg = Math.abs(g0), h = R2 / N;
          for (var j = -N; j <= N; j++) { var gj = Math.abs(side(best, M.at(j * h))); if (gj < bg) { bg = gj; bs = j * h; } }
          var lo = bs - h, hi = bs + h;
          for (var it2 = 0; it2 < 80; it2++) { var m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618; if (Math.abs(side(best, M.at(m1))) < Math.abs(side(best, M.at(m2)))) hi = m2; else lo = m1; }
          sol = (lo + hi) / 2; lim = Math.min(1e-4, bd * 0.05);
        }
        var q = M.at(sol), dq = dist(best, q);
        if (dq < bd * 0.05 && dq < lim) M.set(sol);
      });
    });
  }

  // closeFreeEnds(lines, ellipses, arcs, tol) (r8/drawings8): ends that meet no other linework at all (closeEnds
  // only reaches tol = chordTol of the outline that hid them), two cases.
  // (a) A rim (exact ellipse / arc) between a front- and a back-facing face is visible up to the face's true
  // silhouette, but the facets turn away a facet step early: the rim stopped up to one facet (Rounded handle grip,
  // 0.41 mm) short of the exact silhouette line, whose free end lies on the rim's curve and runs tangent to it. The
  // rim is lengthened to that end.
  // (b) The silhouette of a faceted surface with no exact form (a sweep's tube, a torus) jumps between mesh edges: a
  // piece stops up to a few chord tolerances beside the next (Mug handle, Handlebar bend, 0.03-0.14 mm). A free line
  // end within 3 tol of another visible line (and under a fifth of its own length) is carried to that line: to the
  // crossing if it lies within 3 gaps along the piece, else to the nearest point on it.
  function closeFreeEnds(lines, ells, arcs, tol) {
    if (!(tol > 0) || lines.length > 20000) return;
    function segD(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return { d: Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy), q: [l[0] + t * dx, l[1] + t * dy] }; }
    function near(p, l, r) { return p[0] >= Math.min(l[0], l[2]) - r && p[0] <= Math.max(l[0], l[2]) + r && p[1] >= Math.min(l[1], l[3]) - r && p[1] <= Math.max(l[1], l[3]) + r; }
    var cs = [];
    ells.forEach(function (q) { cs.push({ o: q, c: q.c, ax: q.ax, ay: q.ay, t0: q.full ? 0 : q.t0, t1: q.full ? TWO_PI : q.t1, full: q.full }); });
    arcs.forEach(function (a) { cs.push({ o: a, arc: true, c: a.c, ax: [a.r, 0], ay: [0, a.r], t0: a.a0 * Math.PI / 180, t1: a.a1 * Math.PI / 180 }); });
    function cp(E, t) { return [E.c[0] + Math.cos(t) * E.ax[0] + Math.sin(t) * E.ay[0], E.c[1] + Math.cos(t) * E.ax[1] + Math.sin(t) * E.ay[1]]; }
    cs.forEach(function (E) { E.det = E.ax[0] * E.ay[1] - E.ax[1] * E.ay[0]; E.rm = Math.sqrt(Math.abs(E.det)); });
    function curveD(E, p) {
      var n = 96, bd = Infinity;
      for (var i = 0; i <= n; i++) { var t = E.t0 + (E.t1 - E.t0) * i / n, q = cp(E, t); bd = Math.min(bd, Math.hypot(q[0] - p[0], q[1] - p[1])); }
      return bd;
    }
    // free: within eps of nothing drawn but its own piece
    function free(p, self, eps, also) {
      for (var i = 0; i < lines.length; i++) if (lines[i] !== self && lines[i] !== also && near(p, lines[i], eps) && segD(p, lines[i]).d <= eps) return false;
      for (var j = 0; j < cs.length; j++) if (cs[j].o !== self && curveD(cs[j], p) <= Math.max(eps, cs[j].rm * 2e-3)) return false;
      return true;
    }
    function epsAt(p) { return 1e-6 * (1 + Math.abs(p[0]) + Math.abs(p[1])); }
    // (a) rims up to a silhouette line's free end
    cs.forEach(function (E) {
      if (E.full || !E.det) return;
      [0, 1].forEach(function (end) {
        var te = end ? E.t1 : E.t0, pe = cp(E, te);
        if (!free(pe, E.o, epsAt(pe))) return;
        var best = null, bd = E.rm * Math.PI / 12;
        lines.forEach(function (l) {
          [0, 1].forEach(function (le) {
            var p = le ? [l[2], l[3]] : [l[0], l[1]], d = Math.hypot(p[0] - pe[0], p[1] - pe[1]);
            if (!(d < bd)) return;
            var qx = p[0] - E.c[0], qy = p[1] - E.c[1], a = (qx * E.ay[1] - qy * E.ay[0]) / E.det, b = (E.ax[0] * qy - E.ax[1] * qx) / E.det;
            if (Math.abs(Math.hypot(a, b) - 1) * E.rm > epsAt(p)) return;          // on the rim's curve
            var t = Math.atan2(b, a), tv = [-Math.sin(t) * E.ax[0] + Math.cos(t) * E.ay[0], -Math.sin(t) * E.ax[1] + Math.cos(t) * E.ay[1]];
            var lx = l[2] - l[0], ly = l[3] - l[1], L = Math.hypot(lx, ly), tn = Math.hypot(tv[0], tv[1]);
            if (!L || !tn || Math.abs(lx * tv[1] - ly * tv[0]) / (L * tn) > 1e-3) return; // tangent to it
            if (!free(p, l, epsAt(p))) return;
            bd = d; best = { t: t };
          });
        });
        if (!best) return;
        // lengthen only, on the side the curve runs on past te
        var t = best.t;
        while (t < te - Math.PI) t += TWO_PI;
        while (t > te + Math.PI) t -= TWO_PI;
        if (end ? t <= te : t >= te) return;
        if (E.t1 - E.t0 + Math.abs(t - te) >= TWO_PI) return;
        if (end) E.t1 = t; else E.t0 = t;
        if (E.arc) { if (end) E.o.a1 = t * 180 / Math.PI; else E.o.a0 = t * 180 / Math.PI; } else if (end) E.o.t1 = t; else E.o.t0 = t;
      });
    });
    // (b) faceted silhouette pieces onto the next line
    // (an end can be freed by a later piece moving off it: a second pass picks it up)
    var R = 3 * tol, moved = true;
    for (var pass = 0; pass < 3 && moved; pass++) { moved = false; lines.forEach(function (l) {
      [0, 1].forEach(function (end) {
        var p = end ? [l[2], l[3]] : [l[0], l[1]], q0 = end ? [l[0], l[1]] : [l[2], l[3]], L = Math.hypot(p[0] - q0[0], p[1] - q0[1]);
        if (L < 1e-9 || !free(p, l, epsAt(p))) return;
        // a line broken into pieces (an edge seen nearly end-on, its pieces hidden in turn by the facets beside it: the
        // Tray's bend mitres in the Top view on OpenCascade, 0.005-0.03 mm apart): the next piece running on ahead,
        // its near end free too, within R: the end is carried onto that end (r9/drawings9)
        var ud = [(p[0] - q0[0]) / L, (p[1] - q0[1]) / L], join = null, jd = R;
        lines.forEach(function (o) {
          if (o === l || !near(p, o, R)) return;
          [0, 1].forEach(function (oe) {
            var p2 = oe ? [o[2], o[3]] : [o[0], o[1]], q2 = oe ? [o[0], o[1]] : [o[2], o[3]], gx = p2[0] - p[0], gy = p2[1] - p[1], g = Math.hypot(gx, gy), Lo = Math.hypot(q2[0] - p2[0], q2[1] - p2[1]);
            if (!(g < jd) || !(Lo > 1e-9) || gx * ud[0] + gy * ud[1] < 0.95 * g || ((q2[0] - p2[0]) * ud[0] + (q2[1] - p2[1]) * ud[1]) < 0.95 * Lo) return;
            if (!free(p2, o, epsAt(p2), l)) return;
            jd = g; join = p2;
          });
        });
        if (join) { if (end) { l[2] = join[0]; l[3] = join[1]; } else { l[0] = join[0]; l[1] = join[1]; } moved = true; return; }
        var best = null, bd = Math.min(R, L * 0.2);
        lines.forEach(function (o) { if (o === l || !near(p, o, bd)) return; var s = segD(p, o); if (s.d < bd) { bd = s.d; best = { o: o, q: s.q }; } });
        if (!best) return;
        var o = best.o, d = [(p[0] - q0[0]) / L, (p[1] - q0[1]) / L], ox = o[2] - o[0], oy = o[3] - o[1], den = d[0] * oy - d[1] * ox, to = best.q;
        // two pieces side by side (under 30°), each with a free end beside (or on) the other: both ends meet halfway
        for (var oe = 0; oe < 2; oe++) {
          var p2 = oe ? [o[2], o[3]] : [o[0], o[1]], Lo = Math.hypot(ox, oy);
          if (Math.abs(den) > 0.5 * Lo || Math.hypot(p2[0] - p[0], p2[1] - p[1]) > 0.8 * Math.min(L, Lo) || segD(p2, l).d >= Math.min(R, Lo * 0.2) || !free(p2, o, epsAt(p2), l)) continue;
          var mid = [(p[0] + p2[0]) / 2, (p[1] + p2[1]) / 2];
          if (end) { l[2] = mid[0]; l[3] = mid[1]; } else { l[0] = mid[0]; l[1] = mid[1]; }
          if (oe) { o[2] = mid[0]; o[3] = mid[1]; } else { o[0] = mid[0]; o[1] = mid[1]; }
          moved = true;
          return;
        }
        if (Math.abs(den) > 1e-12) {
          var s = ((o[0] - p[0]) * oy - (o[1] - p[1]) * ox) / den, x = [p[0] + d[0] * s, p[1] + d[1] * s];
          if (Math.abs(s) <= 3 * bd && s > -L * 0.5 && segD(x, o).d <= epsAt(x)) to = x;
        }
        if (end) { l[2] = to[0]; l[3] = to[1]; } else { l[0] = to[0]; l[1] = to[1]; }
        moved = true;
      });
    }); }
  }

  // closeSmallGaps(lines, ellipses, arcs, circles, G) (r10/drawings10): what closeEnds / closeFreeEnds leave — a free
  // end (meeting nothing drawn) under G from other linework — is carried onto it: a line's end is moved to the nearest
  // point of that linework, an arc's or ellipse's end 0.0005 mm or more off gets a bridging line to it. These are short
  // facet pieces at corners and rims, 0.002-0.03 mm off (OpenCascade's Tray corners in the Top view, the Rounded
  // handle's grip ends in the isometric, the Hex nut's chamfer curves); a true drawing has no such gap.
  function closeSmallGaps(lines, ells, arcs, circs, G) {
    if (!(G > 0) || lines.length > 20000) return lines;
    var cs = [];
    ells.forEach(function (q) { cs.push({ o: q, c: q.c, ax: q.ax, ay: q.ay, t0: q.full ? 0 : q.t0, t1: q.full ? TWO_PI : q.t1, full: q.full }); });
    arcs.forEach(function (a) { cs.push({ o: a, c: a.c, ax: [a.r, 0], ay: [0, a.r], t0: a.a0 * Math.PI / 180, t1: a.a1 * Math.PI / 180 }); });
    circs.forEach(function (c) { cs.push({ o: c, c: c.c, ax: [c.r, 0], ay: [0, c.r], t0: 0, t1: TWO_PI, full: true }); });
    cs.forEach(function (E) {
      var rx = Math.hypot(E.ax[0], E.ay[0]), ry = Math.hypot(E.ax[1], E.ay[1]), det = E.ax[0] * E.ay[1] - E.ax[1] * E.ay[0];
      var qa = E.ax[0] * E.ax[0] + E.ax[1] * E.ax[1], qb = E.ay[0] * E.ay[0] + E.ay[1] * E.ay[1];
      E.b = [E.c[0] - rx, E.c[1] - ry, E.c[0] + rx, E.c[1] + ry]; E.det = det;
      E.semi = Math.sqrt(Math.max(0, (qa + qb) / 2 - Math.hypot((qa - qb) / 2, E.ax[0] * E.ay[0] + E.ax[1] * E.ay[1])));   // the smaller semi-axis
    });
    function cp(E, t) { return [E.c[0] + Math.cos(t) * E.ax[0] + Math.sin(t) * E.ay[0], E.c[1] + Math.cos(t) * E.ax[1] + Math.sin(t) * E.ay[1]]; }
    function hyp(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }
    function segQ(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return [l[0] + t * dx, l[1] + t * dy]; }
    function curveQ(E, p) {
      var n = 96, h = (E.t1 - E.t0) / n, bt = E.t0, bd = Infinity;
      for (var i = 0; i <= n; i++) { var t = E.t0 + h * i, d = hyp(cp(E, t), p); if (d < bd) { bd = d; bt = t; } }
      var lo = Math.max(E.t0, bt - h), hi = Math.min(E.t1, bt + h);
      for (var it = 0; it < 60 && hi - lo > 1e-15; it++) { var m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618; if (hyp(cp(E, m1), p) < hyp(cp(E, m2), p)) hi = m2; else lo = m1; }
      return cp(E, (lo + hi) / 2);
    }
    // the nearest point of the linework other than `self` within G of p: { q, d } (d <= eps: p meets it), or null
    function nearest(p, self) {
      var best = null, bd = G;
      lines.forEach(function (l) {
        if (l === self || Math.hypot(l[2] - l[0], l[3] - l[1]) <= 1e-9 || p[0] < Math.min(l[0], l[2]) - bd || p[0] > Math.max(l[0], l[2]) + bd || p[1] < Math.min(l[1], l[3]) - bd || p[1] > Math.max(l[1], l[3]) + bd) return;
        var q = segQ(p, l), d = hyp(p, q); if (d <= bd) { bd = d; best = { q: q, d: d }; }
      });
      cs.forEach(function (E) {
        if (E.o === self || p[0] < E.b[0] - bd || p[0] > E.b[2] + bd || p[1] < E.b[1] - bd || p[1] > E.b[3] + bd || !E.det) return;
        // (no nearer than (ρ - 1) × the smaller semi-axis, ρ the point's radius in the curve's unit-circle frame)
        var qx = p[0] - E.c[0], qy = p[1] - E.c[1], rho = Math.hypot((qx * E.ay[1] - qy * E.ay[0]) / E.det, (E.ax[0] * qy - E.ax[1] * qx) / E.det);
        if (Math.abs(rho - 1) * E.semi > bd) return;
        var q = curveQ(E, p), d = hyp(p, q); if (d <= bd) { bd = d; best = { q: q, d: d }; }
      });
      return best;
    }
    function epsAt(p) { return 1e-6 * (1 + Math.abs(p[0]) + Math.abs(p[1])); }
    // line ends shared with another line's end meet something: counted on a grid, kept up to date as ends move
    var cnt = {};
    function ek(x, y) { return Math.round(x * 1e6) + ',' + Math.round(y * 1e6); }
    function bump(x, y, k) { var key = ek(x, y); cnt[key] = (cnt[key] || 0) + k; }
    lines.forEach(function (l) { if (Math.hypot(l[2] - l[0], l[3] - l[1]) > 1e-9) { bump(l[0], l[1], 1); bump(l[2], l[3], 1); } });
    var bridges = [], moved = true;
    // (an end moved off another can free that one: a second pass picks it up)
    for (var pass = 0; pass < 3 && moved; pass++) { moved = false; lines.forEach(function (l) {
      [0, 1].forEach(function (end) {
        var p = end ? [l[2], l[3]] : [l[0], l[1]];
        if (Math.hypot(l[2] - l[0], l[3] - l[1]) <= 1e-9 || cnt[ek(p[0], p[1])] > 1) return;
        var n = nearest(p, l);
        if (!n || n.d <= epsAt(p)) return;
        bump(p[0], p[1], -1); bump(n.q[0], n.q[1], 1);
        if (end) { l[2] = n.q[0]; l[3] = n.q[1]; } else { l[0] = n.q[0]; l[1] = n.q[1]; }
        // (a piece pulled back onto its own other end is gone: its ends no longer count)
        if (Math.hypot(l[2] - l[0], l[3] - l[1]) <= 1e-9) { bump(l[0], l[1], -1); bump(l[2], l[3], -1); }
        moved = true;
      });
    }); }
    cs.forEach(function (E) {
      if (E.full) return;
      [E.t0, E.t1].forEach(function (te) {
        var p = cp(E, te), n = nearest(p, E.o);
        if (n && n.d > Math.max(epsAt(p), 5e-4)) bridges.push([p[0], p[1], n.q[0], n.q[1], E.o.body || 0]);
      });
    });
    return lines.filter(function (l) { return Math.hypot(l[2] - l[0], l[3] - l[1]) > 1e-9; }).concat(bridges);
  }

  // joinCollinear(lines, G, diag) (r11/hatch11): pieces of one body on one straight line (direction within 1e-6 rad,
  // offset within diag · 1e-6) that overlap or leave a gap under G are one line. mergeCollinear joins exactly touching
  // pieces only; what a cut cylinder's facets leave on OpenCascade (a section's cap edge in three pieces 0.002 mm
  // apart, or overlapping once closeSmallGaps moved their ends: Gear train SECTION A-A 26 lines, Anvil 21) is one edge.
  // The longest piece of a run is kept (with its other fields) and stretched over the run.
  function joinCollinear(lines, G, diag) {
    if (!(G > 0) || lines.length < 2 || lines.length > 20000) return lines;
    var angT = 1e-6, cT = diag * 1e-6 + 1e-12, recs = [], drop = {}, any = false;
    lines.forEach(function (l, i) {
      var dx = l[2] - l[0], dy = l[3] - l[1], L = Math.hypot(dx, dy);
      if (!(L > 1e-12)) return;
      var a = Math.atan2(dy, dx);
      if (a < 0) a += Math.PI;
      if (a >= Math.PI - angT) a -= Math.PI;
      recs.push({ i: i, l: l, L: L, a: a });
    });
    // sorted by key, split where consecutive keys are more than tol apart
    function chains(list, key, tol) {
      list.sort(function (x, y) { return x[key] - y[key]; });
      var out = [], cur = [];
      list.forEach(function (r) { if (cur.length && r[key] - cur[cur.length - 1][key] > tol) { out.push(cur); cur = []; } cur.push(r); });
      if (cur.length) out.push(cur);
      return out;
    }
    chains(recs, 'a', angT).forEach(function (ga) {
      if (ga.length < 2) return;
      var n = [-Math.sin(ga[0].a), Math.cos(ga[0].a)];
      ga.forEach(function (r) { r.c = n[0] * (r.l[0] + r.l[2]) / 2 + n[1] * (r.l[1] + r.l[3]) / 2; });
      chains(ga, 'c', cT).forEach(function (gc) {
        if (gc.length < 2) return;
        var byBody = {};
        gc.forEach(function (r) { var b = r.l[4] || 0; (byBody[b] || (byBody[b] = [])).push(r); });
        Object.keys(byBody).forEach(function (b) {
          var g = byBody[b];
          if (g.length < 2) return;
          var lead = g.reduce(function (x, y) { return y.L > x.L ? y : x; }), ll = lead.l;
          var d = [(ll[2] - ll[0]) / lead.L, (ll[3] - ll[1]) / lead.L], o = [ll[0], ll[1]];
          g.forEach(function (r) {
            var t0 = (r.l[0] - o[0]) * d[0] + (r.l[1] - o[1]) * d[1], t1 = (r.l[2] - o[0]) * d[0] + (r.l[3] - o[1]) * d[1];
            r.t0 = Math.min(t0, t1); r.t1 = Math.max(t0, t1);
          });
          g.sort(function (x, y) { return x.t0 - y.t0; });
          var run = [g[0]], hi = g[0].t1;
          var flush = function () {
            if (run.length < 2) return;
            var keep = run.reduce(function (x, y) { return y.L > x.L ? y : x; }), lo = run[0].t0, k = keep.l;
            k[0] = o[0] + d[0] * lo; k[1] = o[1] + d[1] * lo; k[2] = o[0] + d[0] * hi; k[3] = o[1] + d[1] * hi;
            run.forEach(function (r) { if (r !== keep) drop[r.i] = 1; });
            any = true;
          };
          for (var j = 1; j < g.length; j++) {
            if (g[j].t0 <= hi + G) { run.push(g[j]); if (g[j].t1 > hi) hi = g[j].t1; }
            else { flush(); run = [g[j]]; hi = g[j].t1; }
          }
          flush();
        });
      });
    });
    return any ? lines.filter(function (l, i) { return !drop[i]; }) : lines;
  }


  D.ORIENTS = Object.keys(ORIENTS); D.orientation = orientation; D.frameOf = frameOf; D.isOrthoFrame = isOrthoFrame;
  D.projectedFrame = projectedFrame; D.sectionFrame = sectionFrame;
  D.meshEdges = meshEdges; D.pairOpenEdges = pairOpenEdges; D.joinCollinear = joinCollinear;
  _.TWO_PI = TWO_PI; _.ORTHO = ORTHO; _.DIRS = DIRS; _.frameKey = frameKey; _.COS_SMOOTH = COS_SMOOTH; _.COS_CREASE = COS_CREASE;
  _.meshDiag = meshDiag; _.closeEnds = closeEnds; _.closeFreeEnds = closeFreeEnds; _.closeSmallGaps = closeSmallGaps;
})(Drawing, Drawing._);
