// drawing.js — 2D drawings of the active part or assembly (SolidWorks: File ▸ Make Drawing from Part / Assembly).
// An assembly is drawn from its solved mesh (one body per component, so hidden lines run across components and
// section views hatch each component at its own angle) and gets a Bill of Materials table and Auto Balloons.
// Two halves in one file:
//   * `Drawing` (no UI needed, loaded by tests/kernel-tests.html): orthographic and isometric projection of a mesh with
//     exact hidden-line removal (every candidate edge is clipped against the front-facing triangles, not a screenshot),
//     true curves from the kernel's analytic records (exact circles, arcs, ellipses and cylinder / cone silhouettes;
//     silhouette edges of faceted curved faces for meshes without records), a sheet with border and title block, view scale, automatic model
//     dimensions (overall sizes, hole / boss diameters), and writers for SVG, DXF (one layer per view) and PDF.
//   * the drawing document UI (only when `UI` exists): File ▸ Make Drawing from Part, a Drawing ribbon tab
//     (Standard 3 View, Model View, Smart Dimension, Model Items, Sheet Properties, exports), a drawing FeatureManager
//     with Sheet and Drawing View rows, the sheet itself with pan/zoom, view dragging with projected-view alignment.
//   Annotations (both halves): centre marks, centrelines, hole callouts read from the solid, ordinate / baseline /
//   chamfer dimensions, tolerances and precision, model dimensions that drive the part, manual and stacked balloons;
//   in the app an Annotation ribbon tab, the Dimension / Balloon / Center Mark PropertyManagers and dragging.
// Coordinates: a view maps a world point p to (u, v) = (p·u, p·v) in model units; the sheet is in paper units (the
// model's units, mm or in) with the origin at the lower-left corner and y up. Sheet scale s: paper = model × s.
var Drawing = (function () {
  'use strict';
  var K = Kernel, V = K.vec;

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

  // ------------------------------------------------------------------ hidden-line removal
  // projectView(mesh, orientName, opts) -> { orient, lines: { visible, hidden }, circles: { visible, hidden }, bounds, stats }
  // lines are [u1, v1, u2, v2] in model units. Candidate edges: sharp edges (faces meeting at more than 22°, open or
  // non-manifold edges) and silhouettes (a smooth edge between a face turned toward the viewer and one that is not).
  // Each candidate is clipped against every front-facing triangle: along the edge both "inside the triangle's
  // projection" and "behind the triangle's plane" are linear conditions, so each triangle hides one exact parameter
  // interval; what no triangle hides is visible. Collinear pieces are merged, hidden pieces lying under visible ones
  // are dropped, and closed chains that are regular circles come back as circles. A mesh with analytic records
  // (meshCurves) also gives arcs: { visible, hidden } ({ c, r, a0, a1 degrees CCW, body, src: 'arc' | 'circle' }),
  // ellipses: { visible, hidden } ({ c, ax, ay, t0, t1, full, body }: the point at t is c + cos t ax + sin t ay),
  // arcsAll, and exact: true; its circles carry exact: true.
  function projectView(mesh, orientName, opts) {
    opts = opts || {};
    var O = frameOf(orientName), e = O.e, U = O.u, Vv = O.v;
    var diag = meshDiag(mesh), epsZ = diag * 1e-9, epsIn = diag * 1e-9, tol2 = diag * 1e-7;
    var P = mesh.positions64 || mesh.positions;
    // projected bounds of the whole mesh
    var bounds = { umin: Infinity, umax: -Infinity, vmin: Infinity, vmax: -Infinity };
    for (var i = 0; i < P.length; i += 3) {
      var pu = P[i] * U[0] + P[i + 1] * U[1] + P[i + 2] * U[2], pv = P[i] * Vv[0] + P[i + 1] * Vv[1] + P[i + 2] * Vv[2];
      if (pu < bounds.umin) bounds.umin = pu; if (pu > bounds.umax) bounds.umax = pu;
      if (pv < bounds.vmin) bounds.vmin = pv; if (pv > bounds.vmax) bounds.vmax = pv;
    }
    if (!P.length) bounds = { umin: 0, umax: 0, vmin: 0, vmax: 0 };
    // front-facing triangles as occluders
    var tris = [];
    mesh.faces.forEach(function (f, fi) {
      var ne = V.dot(f.normal, e);
      if (ne <= 1e-9) return;
      for (var t = f.start; t < f.start + f.count; t++) {
        var o = t * 9, q2 = [], wmax = -Infinity;
        for (var k = 0; k < 3; k++) {
          var x = P[o + k * 3], y = P[o + k * 3 + 1], z = P[o + k * 3 + 2];
          q2.push([x * U[0] + y * U[1] + z * U[2], x * Vv[0] + y * Vv[1] + z * Vv[2]]);
          var w = x * e[0] + y * e[1] + z * e[2]; if (w > wmax) wmax = w;
        }
        var ar = (q2[1][0] - q2[0][0]) * (q2[2][1] - q2[0][1]) - (q2[1][1] - q2[0][1]) * (q2[2][0] - q2[0][0]);
        if (ar <= tol2 * tol2) continue;
        // edge lines as unit normals pointing inward: h(p) = nx*p.x + ny*p.y + c >= 0 inside
        var hs = [];
        for (var j = 0; j < 3; j++) {
          var a = q2[j], b = q2[(j + 1) % 3], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
          var nx = -dy / L, ny = dx / L;
          hs.push([nx, ny, -(nx * a[0] + ny * a[1])]);
        }
        tris.push({ f: fi, q: q2, hs: hs, n: f.normal, c: V.dot(f.normal, [P[o], P[o + 1], P[o + 2]]), ne: ne, wmax: wmax,
          umin: Math.min(q2[0][0], q2[1][0], q2[2][0]), umax: Math.max(q2[0][0], q2[1][0], q2[2][0]),
          vmin: Math.min(q2[0][1], q2[1][1], q2[2][1]), vmax: Math.max(q2[0][1], q2[1][1], q2[2][1]) });
      }
    });
    // uniform grid over the occluders' 2D boxes
    var G = Math.max(4, Math.min(160, Math.round(Math.sqrt(tris.length) * 1.5)));
    var gu0 = bounds.umin - tol2, gv0 = bounds.vmin - tol2;
    var cw = Math.max((bounds.umax - bounds.umin + 2 * tol2) / G, 1e-12), ch = Math.max((bounds.vmax - bounds.vmin + 2 * tol2) / G, 1e-12);
    var grid = new Array(G * G);
    function cellU(x) { return Math.max(0, Math.min(G - 1, Math.floor((x - gu0) / cw))); }
    function cellV(y) { return Math.max(0, Math.min(G - 1, Math.floor((y - gv0) / ch))); }
    tris.forEach(function (t, ti) {
      for (var cx = cellU(t.umin - epsIn); cx <= cellU(t.umax + epsIn); cx++) for (var cy = cellV(t.vmin - epsIn); cy <= cellV(t.vmax + epsIn); cy++) {
        var c = cy * G + cx; (grid[c] || (grid[c] = [])).push(ti);
      }
    });
    var stamp = new Int32Array(tris.length), stampId = 0;
    function candidates(a2, b2) {
      stampId++;
      var out = [];
      function addCell(cx, cy) {
        if (cx < 0 || cy < 0 || cx >= G || cy >= G) return;
        var lst = grid[cy * G + cx];
        if (!lst) return;
        for (var i = 0; i < lst.length; i++) { var ti = lst[i]; if (stamp[ti] !== stampId) { stamp[ti] = stampId; out.push(ti); } }
      }
      var x0 = cellU(Math.min(a2[0], b2[0]) - epsIn), x1 = cellU(Math.max(a2[0], b2[0]) + epsIn);
      var y0 = cellV(Math.min(a2[1], b2[1]) - epsIn), y1 = cellV(Math.max(a2[1], b2[1]) + epsIn);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 4 * G) {
        for (var cx = x0; cx <= x1; cx++) for (var cy = y0; cy <= y1; cy++) addCell(cx, cy);
      } else {
        // a long diagonal: walk it at a quarter-cell step and take each cell's 3×3 neighbourhood
        var L = Math.hypot((b2[0] - a2[0]) / cw, (b2[1] - a2[1]) / ch), n = Math.ceil(L * 4) + 1, seen = {};
        for (var s = 0; s <= n; s++) {
          var x = a2[0] + (b2[0] - a2[0]) * s / n, y = a2[1] + (b2[1] - a2[1]) * s / n, gx = cellU(x), gy = cellV(y), kk = gx + ',' + gy;
          if (seen[kk]) continue; seen[kk] = 1;
          for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) addCell(gx + dx, gy + dy);
        }
      }
      return out;
    }
    // hidden intervals of one 3D segment (ez: a larger depth tolerance, for exact curves that lie off the facets;
    // skip: a surface key whose own facets cannot hide the segment, the exact silhouette of a cylinder or cone: its
    // chordal facets lie inside the surface, and a sliver facet ending on the silhouette must not cut it short near
    // its end, r5/drawings5)
    function hiddenIntervals(A, B, a2, b2, ez, skip) {
      var wa = V.dot(A, e), wb = V.dot(B, e), wmin = Math.min(wa, wb), AB = V.sub(B, A), eZ = ez > epsZ ? ez : epsZ;
      var ivs = [];
      var cand = candidates(a2, b2);
      for (var ci = 0; ci < cand.length; ci++) {
        var t = tris[cand[ci]];
        if (t.wmax <= wmin + eZ) continue;               // the triangle is nowhere in front of the segment
        if (skip != null && CV.faceSurf[t.f] && CV.faceSurf[t.f].key === skip) continue;
        var lo = 0, hi = 1;
        // in front: s(t) = (c - n·X(t)) / (n·e) > epsZ
        var s0 = (t.c - V.dot(t.n, A)) / t.ne, s1 = (t.c - V.dot(t.n, B)) / t.ne;
        var r = clipLinear(s0 - eZ, s1 - eZ, lo, hi, true); if (!r) continue; lo = r[0]; hi = r[1];
        for (var j = 0; j < 3 && r; j++) {
          var h = t.hs[j], h0 = h[0] * a2[0] + h[1] * a2[1] + h[2] + epsIn, h1 = h[0] * b2[0] + h[1] * b2[1] + h[2] + epsIn;
          r = clipLinear(h0, h1, lo, hi, false); if (r) { lo = r[0]; hi = r[1]; }
        }
        if (r && hi - lo > 1e-12) ivs.push([lo, hi]);
      }
      return mergeIntervals(ivs, 1e-9);
    }
    // keep the part of [lo, hi] where the linear function f(t) = f0 + (f1 - f0) t is > 0 (strict) or >= 0
    function clipLinear(f0, f1, lo, hi, strict) {
      var df = f1 - f0;
      if (Math.abs(df) < 1e-300) return (strict ? f0 > 0 : f0 >= 0) ? [lo, hi] : null;
      var tz = -f0 / df;
      if (df > 0) lo = Math.max(lo, tz); else hi = Math.min(hi, tz);
      return hi > lo ? [lo, hi] : null;
    }

    var vis = [], hid = [], tan = [], tanOn = opts.tangent === 'visible' || opts.tangent === 'font';
    // true curves: edges on a circle or arc of the kernel's analytic records are collected per curve (as angle
    // intervals) and drawn as exact circles, arcs, ellipses or, edge-on, exact lines; silhouettes of cylinders and
    // cones are their exact tangent generators; facets of one analytic surface never show the edge between them
    var CV = meshCurves(mesh), cst = CV ? CV.groups.map(function () { return null; }) : null, silh = [], pend = [], rpend = [], tcs = [];
    // the curve groups of this view: the mesh's true circles plus circles made here, the exact silhouettes of tori and
    // spheres that happen to be circles in this view (a torus seen along its axis, a sphere always) (r3/drawings3)
    var GR = CV ? CV.groups.slice() : [], synth = {};
    // p moved onto the circle (centre c, unit normal n, radius r) along its plane's radial direction
    function onCircle3(p, c, n, r) { var q = V.sub(p, c); q = V.sub(q, V.scale(n, V.dot(q, n))); var L = V.len(q); return L > 1e-12 ? V.add(c, V.scale(q, r / L)) : null; }
    // half: keep only the half of the circle on that side of its centre (a torus tube's cross-section seen face-on)
    function synthGroup(body, c, n, r, half) {
      var sg = (n[0] < -1e-9 || (Math.abs(n[0]) <= 1e-9 && (n[1] < -1e-9 || (Math.abs(n[1]) <= 1e-9 && n[2] < 0)))) ? -1 : 1, qs = diag * 1e-7 + 1e-12;
      n = V.scale(n, sg);
      var key = body + '|' + c.map(function (x) { return Math.round(x / qs); }).join(',') + '|' + n.map(function (x) { return Math.round(x * 1e6); }).join(',') + '|' + Math.round(r / qs);
      if (half) key += '|h' + half.map(function (x) { return Math.round(x * 1e6); }).join(',');
      if (synth[key] == null) {
        var x = V.norm(V.cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
        GR.push({ body: body, c: c.slice(), n: n, x: x, y: V.cross(n, x), r: r, arc: false, sil: true, chords: [], cov: [], half: half || null });
        cst.push(null);
        synth[key] = GR.length - 1;
      }
      return synth[key];
    }
    function edgePiece(ed, ei) {
      var sameSurf = null, sameKey = null;
      if (CV && ed.faces.length === 2) {
        var fs0 = CV.faceSurf[ed.faces[0]], fs1 = CV.faceSurf[ed.faces[1]];
        if (fs0 && fs1 && fs0.key === fs1.key) { sameSurf = fs0.s; sameKey = fs0.key; }
      }
      // faces meeting under 23° count as smooth (facets of a curved face); where both faces' true normals are known
      // (surface records, or flat faces that are not facets of a curved one) a real crease, a shallow chamfer or a
      // drafted face meeting another feature, is drawn as an edge instead of a tangent edge (r5/drawings5)
      if (ed.smooth && !sameSurf && !ed.exactDone && ed.faces.length === 2 && creased(ed)) ed = { a: ed.a, b: ed.b, faces: ed.faces, normals: ed.normals, smooth: false };
      if (ed.smooth || sameSurf) {
        var s0 = V.dot(ed.normals[0], e) > 1e-9, s1 = V.dot(ed.normals[1], e) > 1e-9;
        if (s0 === s1) {
          // a tangent edge, not on the outline: drawn only with Tangent Edges Visible / With Font, and only where two
          // different surfaces meet (a fillet's run-out onto a face, a hole's blend), never between facets of one
          // (r4/drawings4: also where faces of two different features meet smoothly and neither has a surface record,
          // e.g. an Anvil fillet's facets running out onto a cap)
          if (tanOn && s0 && !sameSurf && ed.faces.length === 2 && (CV && (CV.faceSurf[ed.faces[0]] || CV.faceSurf[ed.faces[1]]) || featureOf(ed.faces[0]) !== featureOf(ed.faces[1]))) {
            var ta2 = [V.dot(ed.a, U), V.dot(ed.a, Vv)], tb2 = [V.dot(ed.b, U), V.dot(ed.b, Vv)], tL = Math.hypot(tb2[0] - ta2[0], tb2[1] - ta2[1]), tt = 0;
            var tbody = mesh.faces[ed.faces[0]].body || 0, tg = CV && CV.tanCurve && ei != null ? CV.tanCurve[ei] : -1;
            if (tL < tol2 * 10 && tg >= 0) return;
            if (tg >= 0 && ei != null) {
              // a tangent edge on a true circle (a fillet's run-out onto a face, a blend round a boss): its visible
              // angle ranges go to that circle, drawn as an exact circle, arc or ellipse (r3/drawings3)
              var Gt = GR[tg], tlist = tcs[tg] || (tcs[tg] = []), tA = curveAngle(Gt, ed.a), tv0 = 0;
              var tang = function (x) { return unwrapNear(curveAngle(Gt, V.add(ed.a, V.scale(V.sub(ed.b, ed.a), x))), tA); };
              var tpush = function (x0, x1) { if (x1 - x0 > 1e-12) { var y0 = tang(x0), y1 = tang(x1); tlist.push([Math.min(y0, y1), Math.max(y0, y1)]); } };
              hiddenIntervals(ed.a, ed.b, ta2, tb2).forEach(function (iv) { tpush(tv0, iv[0]); tv0 = iv[1]; });
              tpush(tv0, 1);
              return;
            }
            // the visible parameter ranges, kept until every tangent piece is in: chains of them on one circle in space
            // become that exact circle below (tangentCircles), the rest straight pieces
            var tf = { ed: ed, body: tbody, vis: [], a2: ta2, b2: tb2, L: tL };
            var tseg = function (t0, t1) { if (t1 - t0 > 1e-12) tf.vis.push([t0, t1]); };
            hiddenIntervals(ed.a, ed.b, ta2, tb2).forEach(function (iv) { tseg(tt, iv[0]); tt = iv[1]; });
            tseg(tt, 1);
            tfree.push(tf);
          }
          return;
        }
      }
      var A = ed.a, B = ed.b, g = ed.group != null ? ed.group : ed.exactDone ? -1 : CV && !ed.smooth && !sameSurf && CV.pieceCurve[ei] >= 0 ? CV.pieceCurve[ei] : -1;
      if (sameSurf && !ed.exactDone) {
        if (sameSurf.t === 'tor' || sameSurf.t === 'sph') { rpend.push({ ed: ed, ei: ei, S: sameSurf, key: sameKey }); return; }
        var ex = exactSilhouette(sameSurf, e, ed.a, ed.b);
        if (ex) { pend.push({ ed: ed, ei: ei, S: sameSurf, key: sameKey, ex: ex }); return; }
      }
      if (g < 0 && CV && !ed.exactDone && !ed.smooth && !sameSurf) {
        // a sharp edge on a cylinder seen along its axis (where a handle meets a mug's wall, a pin meets a curved
        // face) projects onto the cylinder's circle: it is drawn as that exact circle's arc (r3/drawings3)
        for (var fi2 = 0; fi2 < ed.faces.length && g < 0; fi2++) {
          var fs2 = CV.faceSurf[ed.faces[fi2]], S2 = fs2 && fs2.s;
          if (!S2 || S2.t !== 'cyl' || Math.abs(V.dot(S2.d, e)) < 1 - 1e-9) continue;
          var A2 = onCircle3(ed.a, S2.o, S2.d, S2.r), B2 = onCircle3(ed.b, S2.o, S2.d, S2.r);
          if (!A2 || !B2) continue;
          // its points keep their depth: only the radial error of the facets is taken off
          A2 = V.add(A2, V.scale(S2.d, V.dot(V.sub(ed.a, A2), S2.d))); B2 = V.add(B2, V.scale(S2.d, V.dot(V.sub(ed.b, B2), S2.d)));
          // only an edge whose ends lie on the cylinder (a facet chord cut short by another face stays as it is)
          if (V.len(V.sub(A2, ed.a)) > diag * 1e-6 + 1e-9 || V.len(V.sub(B2, ed.b)) > diag * 1e-6 + 1e-9) continue;
          if (Math.hypot(V.dot(V.sub(B2, A2), U), V.dot(V.sub(B2, A2), Vv)) < tol2 * 10) continue;
          g = synthGroup(mesh.faces[ed.faces[0]].body || 0, S2.o, S2.d, S2.r);
          ed = { a: ed.a, b: ed.b, faces: ed.faces, normals: ed.normals, exactA: A2, exactB: B2, eps: 2 * Math.max(V.len(V.sub(A2, ed.a)), V.len(V.sub(B2, ed.b))) };
        }
        // any other sharp edge where two different analytic surfaces meet (or one meets a plane): the chord becomes
        // points on the true intersection curve, fine enough to look smooth at any zoom (r4/drawings4)
        // On OpenCascade's solid (its polygons know their B-rep face) every facet edge is a chord of the true edge. On
        // Anvil's, whose approximate booleans can put a chord where the true curve leaves the solid (a hex nut's
        // chamfer cone running past its flats), only a chain that stays within the chord tolerance of the facet chord
        // is taken, its ends move no further than that, and an end where other edges meet (a corner) stays where the
        // facets put it, so the edges still meet (r5/drawings5)
        if (g < 0 && ed.faces.length === 2 && (brepMesh || !(isFacet(ed.faces[0]) || isFacet(ed.faces[1])))) {
          var X1 = faceSurface(ed.faces[0]), X2 = X1 && faceSurface(ed.faces[1]);
          if (X2 && (X1.t !== 'pln' || X2.t !== 'pln') && X1 !== X2) {
            var Lc = V.len(V.sub(ed.b, ed.a)), facTol = 3 * chordTol();
            var chn = intersectionChain(X1, X2, ed.a, ed.b, diag * 1e-7 + 1e-10, diag * 1e-5 + 1e-9, brepMesh ? Lc * 0.25 + diag * 1e-5 : Math.min(Lc * 0.5, facTol));
            if (chn && !brepMesh) {
              if (chn.dev > facTol) chn = null;
              else {
                // at a corner the true curve may run on out of the faceted solid: the chain is bent back onto the
                // corner vertex, the offset fading out along the chord, so it stays smooth and meets the other edges
                var cp = chn.pts, sl = [0], da = isCorner(ed.a, ed.faces) ? V.sub(ed.a, cp[0]) : null, db = isCorner(ed.b, ed.faces) ? V.sub(ed.b, cp[cp.length - 1]) : null;
                for (var si = 1; si < cp.length; si++) sl.push(sl[si - 1] + V.len(V.sub(cp[si], cp[si - 1])));
                var sT = sl[sl.length - 1] || 1;
                chn.pts = cp.map(function (x, i) { var w = sl[i] / sT; if (da) x = V.add(x, V.scale(da, 1 - w)); if (db) x = V.add(x, V.scale(db, w)); return x; });
              }
            }
            if (chn) {
              var ceps = 2 * chn.dev + diag * 1e-6;
              // (on Anvil's solid each piece gets its own depth tolerance, from how far it lies off the facet chord, so
              // a piece pulled back onto a corner does not show through the faces around it)
              var offC = function (x) { return K.pointSegmentDistance ? K.pointSegmentDistance(x, ed.a, ed.b) : chn.dev; };
              for (var ci = 0; ci + 1 < chn.pts.length; ci++) edgePiece({ a: chn.pts[ci], b: chn.pts[ci + 1], faces: ed.faces, normals: ed.normals, exactDone: true, eps: brepMesh ? ceps : 2 * Math.max(offC(chn.pts[ci]), offC(chn.pts[ci + 1])) + diag * 1e-6, isect: true }, null);
              return;
            }
          }
        }
      }
      if (ed.exactA) { A = ed.exactA; B = ed.exactB; }
      var a2 = [V.dot(A, U), V.dot(A, Vv)], b2 = [V.dot(B, U), V.dot(B, Vv)];
      if (g >= 0 && !ed.split && Math.abs(V.dot(GR[g].n, e)) < 1e-9) {
        // A true curve seen edge-on is a line whose ends are the curve's extremes in this view. A chord whose arc runs
        // through an extreme is split there, at the true curve point: otherwise the chord (inside the curve, perhaps
        // seen end-on, perhaps behind the next facet) loses the arc's outermost part and the rim line stops a
        // sagitta short of the side outline (0.025 mm on OpenCascade's Mug in the Front view) (r5/drawings5)
        var Gc = GR[g], ca = curveAngle(Gc, A), cb = unwrapNear(curveAngle(Gc, B), ca), lo = Math.min(ca, cb), hi = Math.max(ca, cb);
        var px = [V.dot(Gc.x, U), V.dot(Gc.x, Vv)], py = [V.dot(Gc.y, U), V.dot(Gc.y, Vv)], td = Math.hypot(px[0], px[1]) >= Math.hypot(py[0], py[1]) ? px : py, tdl = Math.hypot(td[0], td[1]);
        if (hi - lo > 1e-9 && hi - lo < Math.PI && tdl > 1e-12) {
          var ps = Math.atan2((py[0] * td[0] + py[1] * td[1]) / tdl, (px[0] * td[0] + px[1] * td[1]) / tdl);
          for (var j = -6; j <= 6; j++) {
            var th = ps + j * Math.PI;
            if (th <= lo + 1e-9 || th >= hi - 1e-9) continue;
            var X = V.add(Gc.c, V.add(V.scale(Gc.x, Gc.r * Math.cos(th)), V.scale(Gc.y, Gc.r * Math.sin(th))));
            var sag = Gc.r * (1 - Math.cos((hi - lo) / 2)), xe = Math.max(ed.eps || 0, 2 * sag + diag * 1e-7);
            edgePiece({ a: A, b: X, faces: ed.faces, normals: ed.normals, group: g, exactDone: true, split: true, eps: xe }, null);
            edgePiece({ a: X, b: B, faces: ed.faces, normals: ed.normals, group: g, exactDone: true, split: true, eps: xe }, null);
            return;
          }
        }
      }
      var L2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
      if (L2 < tol2 * 10) return;                           // seen end-on
      var body = mesh.faces[ed.faces[0]].body || 0;   // the component (assembly) or solid body the edge belongs to
      var hidden, t = 0;
      if (g >= 0 && Math.abs(V.dot(GR[g].n, e)) > 1 - 1e-9) {
        // a true circle seen face-on: the chord lies up to a sagitta inside the curve, where the facets of a surface
        // that ends on the circle from inside (a handle's bend round its tube seen end-on) cover it and the outline
        // came out in dashes. The true arc is tested too, as short chords between points on the circle (depth
        // tolerance: the chord's distance from its faces' true surfaces, their facets being chords too); a part is
        // hidden only where both are (the true arc alone sinks into a surface ending on the circle from outside, a
        // torus's inner equator, whose facets' inner edges are chords inside the circle) (r5/drawings5)
        var Gf = GR[g], fa = curveAngle(Gf, A), fb = unwrapNear(curveAngle(Gf, B), fa);
        hidden = hiddenIntervals(A, B, a2, b2, ed.eps, ed.skip);
        if (hidden.length && Math.abs(fb - fa) > 1e-9 && Math.abs(fb - fa) < Math.PI / 3) {
          var mid = V.scale(V.add(A, B), 0.5), dev = 0, ezf;
          ed.faces.forEach(function (fi) { var S = faceSurface(fi), f = S && S.t !== 'pln' ? surfDist(S, mid) : null; if (f) dev = Math.max(dev, Math.abs(f[0])); });
          ezf = Math.max(ed.eps || 0, 2 * dev);
          // the circle's point at angle th, at the chord's depth there (a sharp edge drawn on a cylinder's circle keeps
          // its own depth)
          var at = function (th) {
            var X = V.add(A, V.scale(V.sub(B, A), tOf(th)));
            return V.add(V.add(Gf.c, V.scale(Gf.n, V.dot(V.sub(X, Gf.c), Gf.n))), V.add(V.scale(Gf.x, Gf.r * Math.cos(th)), V.scale(Gf.y, Gf.r * Math.sin(th))));
          };
          // chord parameter of the point at angle th (where the ray from the centre crosses the chord)
          var pa = [V.dot(V.sub(A, Gf.c), Gf.x), V.dot(V.sub(A, Gf.c), Gf.y)], pb = [V.dot(V.sub(B, Gf.c), Gf.x), V.dot(V.sub(B, Gf.c), Gf.y)];
          var tOf = function (th) { var dx = Math.cos(th), dy = Math.sin(th), den = (pb[0] - pa[0]) * dy - (pb[1] - pa[1]) * dx; return Math.abs(den) < 1e-15 ? 0 : Math.max(0, Math.min(1, -(pa[0] * dy - pa[1] * dx) / den)); };
          var ns = Math.max(2, Math.min(16, Math.ceil(Math.abs(fb - fa) / 0.02))), ht = [];
          for (var k = 0; k < ns; k++) {
            var th0 = fa + (fb - fa) * k / ns, th1 = fa + (fb - fa) * (k + 1) / ns, P0 = at(th0), P1 = at(th1);
            hiddenIntervals(P0, P1, [V.dot(P0, U), V.dot(P0, Vv)], [V.dot(P1, U), V.dot(P1, Vv)], ezf, ed.skip).forEach(function (q) {
              var x0 = tOf(th0 + (th1 - th0) * q[0]), x1 = tOf(th0 + (th1 - th0) * q[1]);
              ht.push([Math.min(x0, x1), Math.max(x0, x1)]);
            });
          }
          ht = mergeIntervals(ht, 1e-9);
          var both = [];
          // (slivers inside the chord shorter than twice its sagitta, where the true arc dips under a facet vertex of the
          // other surface, are not hidden curve)
          var L2c = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]), sagc = Gf.r * (1 - Math.cos((fb - fa) / 2));
          hidden.forEach(function (h) { ht.forEach(function (q) { var lo = Math.max(h[0], q[0]), hi = Math.min(h[1], q[1]); if (hi > lo + 1e-12 && !(lo > 1e-9 && hi < 1 - 1e-9 && (hi - lo) * L2c < 2 * sagc)) both.push([lo, hi]); }); });
          hidden = both;
        }
      } else hidden = hiddenIntervals(A, B, a2, b2, ed.eps, ed.skip);
      if (g >= 0) {
        // a piece of a true curve: its visible and hidden parameter ranges become angle ranges on the curve
        var G = GR[g], st = cst[g] || (cst[g] = { vis: [], hid: [] }), ta = curveAngle(G, A);
        var ang = function (tt) { return unwrapNear(curveAngle(G, V.add(A, V.scale(V.sub(B, A), tt))), ta); };
        var arc = function (t0, t1, list) { if (t1 - t0 > 1e-12) { var x0 = ang(t0), x1 = ang(t1); list.push([Math.min(x0, x1), Math.max(x0, x1)]); } };
        hidden.forEach(function (iv) { arc(t, iv[0], st.vis); arc(iv[0], iv[1], st.hid); t = iv[1]; });
        arc(t, 1, st.vis);
        return;
      }
      function seg(t0, t1, list) {
        if ((t1 - t0) * L2 < tol2 * 10) return;
        list.push([a2[0] + (b2[0] - a2[0]) * t0, a2[1] + (b2[1] - a2[1]) * t0, a2[0] + (b2[0] - a2[0]) * t1, a2[1] + (b2[1] - a2[1]) * t1, body]);
      }
      hidden.forEach(function (iv) { seg(t, iv[0], vis); seg(iv[0], iv[1], hid); t = iv[1]; });
      seg(t, 1, vis);
      if (A !== ed.a || ed.isect) silh.push(a2, b2);
    }
    // the feature that made a mesh face (its polygons' shared tag), or null
    function featureOf(fi) { var f = mesh.faces[fi], p = f && f.polys && f.polys[0]; return p && p.shared != null ? p.shared : null; }
    // faces with no surface record that meet a face of their own feature under 23° (the facets of an Anvil fillet,
    // a loft): their normals are not the true surface's, so a smooth edge on them may be a tangent edge
    var facetty = null;
    function isFacet(fi) {
      if (!facetty) {
        facetty = new Uint8Array(mesh.faces.length);
        meshEdges(mesh).forEach(function (pc) {
          if (!pc.smooth || pc.faces.length !== 2 || featureOf(pc.faces[0]) !== featureOf(pc.faces[1])) return;
          pc.faces.forEach(function (fi2) { if (!(CV && CV.faceSurf[fi2])) facetty[fi2] = 1; });
        });
      }
      return facetty[fi] === 1;
    }
    // the kernel's chord tolerance (how far Anvil's facets and boolean vertices may sit from the true surfaces)
    function chordTol() { var t = K.setTessellation ? K.setTessellation({}) : null; return Math.max(0.05, t && t.chordTol || 0.05); }
    // a corner: a vertex where sharp edges between other surfaces than the edge's own two meet (or where a chain of
    // edges does not just run on) (r5/drawings5)
    var vSharp = null, qv = diag * 1e-7 + 1e-12;
    function surfKey(fi) { var fs = CV && CV.faceSurf[fi]; return fs ? 's' + fs.key : isFacet(fi) ? 'f' + featureOf(fi) : 'p' + fi; }
    function pairKey(fs) { var a = surfKey(fs[0]), b = fs.length > 1 ? surfKey(fs[1]) : ''; return a < b ? a + '|' + b : b + '|' + a; }
    function vKey(p) { return Math.round(p[0] / qv) + ',' + Math.round(p[1] / qv) + ',' + Math.round(p[2] / qv); }
    function isCorner(p, faces) {
      if (!vSharp) {
        vSharp = {};
        meshEdges(mesh).forEach(function (pc) {
          if (pc.smooth) return;
          var k = pairKey(pc.faces);
          [pc.a, pc.b].forEach(function (x) { var vk = vKey(x); (vSharp[vk] || (vSharp[vk] = [])).push(k); });
        });
      }
      var l = vSharp[vKey(p)] || [], own = pairKey(faces);
      return l.length !== 2 || l.some(function (k) { return k !== own; });
    }
    // the true unit normal of face fi at p (its surface record's, or a flat face's own), null when unknown
    function trueNormal(fi, p) {
      var f = mesh.faces[fi], fs = CV && CV.faceSurf[fi];
      if (fs) {
        var d = surfDist(fs.s, p);
        if (!d || V.len(d[1]) < 1e-12) return null;
        var n = V.norm(d[1]);
        return V.dot(n, f.normal) < 0 ? V.scale(n, -1) : n;
      }
      if (isFacet(fi) || (f.polys && f.polys.some(function (q) { return q.surf; }))) return null;
      return f.normal;
    }
    // a smooth (under 23°) edge whose two faces' true normals differ by more than 2°: a real crease
    function creased(ed) {
      var m = V.scale(V.add(ed.a, ed.b), 0.5), n0 = trueNormal(ed.faces[0], m), n1 = n0 && trueNormal(ed.faces[1], m);
      return !!n1 && V.dot(n0, n1) < COS_CREASE;
    }
    // Tangent pieces on no known curve (tfree): connected runs of them whose vertices all lie on one circle in space (an
    // Anvil fillet's run-out onto a cap: its facets carry no surface record) are that exact circle, drawn as a circle,
    // arc or ellipse like the others; the rest are straight pieces (r4/drawings4)
    var tfree = [], brepMesh = mesh.faces.some(function (f) { return f.polys && f.polys[0] && f.polys[0].face != null; });
    function tangentCircles() {
      if (!tfree.length) return;
      var qk = diag * 1e-7 + 1e-12, at = {}, tolC = diag * 1e-6 + 1e-9;
      function k3(p) { return p.map(function (x) { return Math.round(x / qk); }).join(','); }
      tfree.forEach(function (t, i) { [t.ed.a, t.ed.b].forEach(function (p) { var k = k3(p); (at[k] || (at[k] = [])).push(i); }); });
      var done = new Uint8Array(tfree.length), straight = [];
      for (var i = 0; i < tfree.length; i++) {
        if (done[i]) continue;
        // the run through vertices shared by exactly two pieces of one body
        var comp = [], stack = [i], body = tfree[i].body;
        done[i] = 1;
        while (stack.length) {
          var j = stack.pop(); comp.push(j);
          [tfree[j].ed.a, tfree[j].ed.b].forEach(function (p) {
            var l = at[k3(p)];
            if (l.length !== 2) return;
            l.forEach(function (o) { if (!done[o] && tfree[o].body === body) { done[o] = 1; stack.push(o); } });
          });
        }
        var fit = comp.length >= 4 ? circle3(comp.map(function (j) { return tfree[j].ed.a; }).concat(comp.map(function (j) { return tfree[j].ed.b; })), tolC) : null;
        if (!fit) { comp.forEach(function (j) { straight.push(tfree[j]); }); continue; }
        if (!cst) cst = GR.map(function () { return null; });
        var gi = synthGroup(body, fit.c, fit.n, fit.r), G = GR[gi], tlist = tcs[gi] || (tcs[gi] = []);
        comp.forEach(function (j) {
          var t = tfree[j], A = t.ed.a, B = t.ed.b, tA = curveAngle(G, A);
          t.vis.forEach(function (iv) {
            var y0 = unwrapNear(curveAngle(G, V.add(A, V.scale(V.sub(B, A), iv[0]))), tA), y1 = unwrapNear(curveAngle(G, V.add(A, V.scale(V.sub(B, A), iv[1]))), tA);
            tlist.push([Math.min(y0, y1), Math.max(y0, y1)]);
          });
        });
      }
      straight.forEach(function (t) {
        t.vis.forEach(function (iv) {
          if ((iv[1] - iv[0]) * t.L < tol2 * 10) return;
          var a2 = t.a2, b2 = t.b2;
          tan.push([a2[0] + (b2[0] - a2[0]) * iv[0], a2[1] + (b2[1] - a2[1]) * iv[0], a2[0] + (b2[0] - a2[0]) * iv[1], a2[1] + (b2[1] - a2[1]) * iv[1], t.body]);
        });
      });
    }
    // the analytic surface a mesh face lies on: its record, or its own plane for a face with none (null for a face
    // whose polygons lie on several surfaces) (r4/drawings4)
    var fsCache = [];
    function faceSurface(fi) {
      if (fsCache[fi] !== undefined) return fsCache[fi];
      var f = mesh.faces[fi], fs = CV.faceSurf[fi], r = null;
      if (fs) r = fs.s;
      else if (f && f.normal && f.count > 0 && !(f.polys && f.polys.some(function (p) { return p.surf; }))) {
        var o = f.start * 9;
        r = { t: 'pln', n: f.normal, c: f.normal[0] * P[o] + f.normal[1] * P[o + 1] + f.normal[2] * P[o + 2] };
      }
      fsCache[fi] = r;
      return r;
    }
    meshEdges(mesh).forEach(edgePiece);
    // exact silhouettes: the facet silhouette pieces of one generator (same surface, same side) are chained along the
    // axis; a chain whose two ends lie on true circles or arcs of that surface's axis that pass through the generator
    // (an untrimmed stretch of cylinder or cone between caps, steps or rims) is drawn as the exact tangent line;
    // a chain ending on a trimmed boundary (a cone cut by a flat) keeps its facet edges
    if (pend.length) {
      var runs = {}, rorder = [], tz = diag * 1e-7 + 1e-12;
      pend.forEach(function (p) {
        var key = p.key + '|' + (mesh.faces[p.ed.faces[0]].body || 0) + '|' + p.ex[4].map(function (x) { return Math.round(x * 1e6); }).join(',');
        if (!runs[key]) { runs[key] = []; rorder.push(key); }
        runs[key].push(p);
      });
      var endOk = function (S, w, z) {
        var k = S.t === 'cone' ? S.k || 0 : 0, rz = S.r + k * z, P0 = V.add(V.add(S.o, V.scale(S.d, z)), V.scale(w, rz));
        return CV.groups.some(function (G) {
          if (Math.abs(Math.abs(V.dot(G.n, S.d)) - 1) > 1e-9) return false;
          var dc = V.sub(G.c, S.o), gz = V.dot(dc, S.d);
          if (Math.abs(gz - z) > tz * 100 || V.len(V.sub(dc, V.scale(S.d, gz))) > tz * 100 || Math.abs(G.r - rz) > tz * 100 + rz * 1e-9) return false;
          var th = curveAngle(G, P0);
          return G.cov.some(function (iv) { for (var j = -1; j <= 1; j++) { var x = th + TWO_PI * j; if (x >= iv[0] - 1e-9 && x <= iv[1] + 1e-9) return true; } return false; });
        });
      };
      // a chain ending where its surface meets another analytic surface or a plane (a handle's tube on a mug's wall, a
      // cone cut by a flat): the exact generator's end there, z' with the other surface's distance 0, found from the
      // facet end vertex X (its sharp edges name the other faces) -> z' | null (r4/drawings4)
      var vfaces = null;
      var endOther = function (S, key, w, z, X) {
        if (!vfaces) {
          vfaces = {};
          meshEdges(mesh).forEach(function (ed) {
            if (ed.smooth) return;
            [ed.a, ed.b].forEach(function (p) { var k = p.map(function (x) { return Math.round(x / (tz * 10)); }).join(','); (vfaces[k] || (vfaces[k] = [])).push.apply(vfaces[k], ed.faces); });
          });
        }
        var fl = vfaces[X.map(function (x) { return Math.round(x / (tz * 10)); }).join(',')] || [], k = S.t === 'cone' ? S.k || 0 : 0, best = null;
        var at = function (zz) { return V.add(V.add(S.o, V.scale(S.d, zz)), V.scale(w, S.r + k * zz)); }, dz = V.add(S.d, V.scale(w, k));
        fl.forEach(function (fi) {
          var fs = CV.faceSurf[fi];
          if (fs && fs.key === key) return;
          var S2 = faceSurface(fi);
          if (!S2) return;
          var zz = z;
          for (var it = 0; it < 20; it++) {
            var f = surfDist(S2, at(zz));
            if (!f) return;
            var gd = V.dot(f[1], dz);
            if (Math.abs(gd) < 1e-6 * V.len(f[1])) return;   // the generator runs along the other surface
            var st = f[0] / gd;
            zz -= st;
            if (Math.abs(st) < tz) break;
          }
          if (Math.abs(zz - z) > 0.35 * Math.abs(S.r + k * z) + tz * 100) return;
          var f2 = surfDist(S2, at(zz));
          if (!f2 || Math.abs(f2[0]) > tz * 10) return;
          if (best == null || Math.abs(zz - z) < Math.abs(best - z)) best = zz;
        });
        return best;
      };
      rorder.forEach(function (key) {
        var list = runs[key].map(function (p) { return { p: p, z0: Math.min(p.ex[2], p.ex[3]), z1: Math.max(p.ex[2], p.ex[3]) }; }).sort(function (a, b) { return a.z0 - b.z0; });
        var chains = [];
        list.forEach(function (x) { var c = chains[chains.length - 1]; if (c && x.z0 <= c.z1 + tz * 100) { c.items.push(x); c.z1 = Math.max(c.z1, x.z1); } else chains.push({ z0: x.z0, z1: x.z1, items: [x] }); });
        chains.forEach(function (c) {
          var p0 = c.items[0].p, S = p0.S, w = p0.ex[4], kc = S.t === 'cone' ? S.k || 0 : 0;
          // the facet vertex at the chain's end at axial coordinate z
          var endVertex = function (z) {
            var bestV = null, bd = Infinity;
            c.items.forEach(function (x) { [x.p.ed.a, x.p.ed.b].forEach(function (v) { var dd = Math.abs(V.dot(V.sub(v, S.o), S.d) - z); if (dd < bd) { bd = dd; bestV = v; } }); });
            return bestV;
          };
          var z0 = endOk(S, w, c.z0) ? c.z0 : endOther(S, p0.key, w, c.z0, endVertex(c.z0));
          var z1 = z0 == null ? null : endOk(S, w, c.z1) ? c.z1 : endOther(S, p0.key, w, c.z1, endVertex(c.z1));
          var ok = z0 != null && z1 != null && z1 > z0;
          var atZ = function (zz) { return V.add(V.add(S.o, V.scale(S.d, zz)), V.scale(w, S.r + kc * zz)); };
          c.items.forEach(function (x) {
            var ed = x.p.ed, q = { a: ed.a, b: ed.b, faces: ed.faces, normals: ed.normals, smooth: true, exactDone: true, skip: ok && (S.t === 'cyl' || S.t === 'cone') ? x.p.key : null };
            if (ok) {
              // the end pieces reach the exact ends (a piece wholly past one is dropped)
              var za = x.p.ex[2], zb = x.p.ex[3];
              za = Math.max(z0, Math.min(z1, za)); zb = Math.max(z0, Math.min(z1, zb));
              if (x.z0 <= c.z0 + tz) { if (x.p.ex[2] <= x.p.ex[3]) za = z0; else zb = z0; }
              if (x.z1 >= c.z1 - tz) { if (x.p.ex[2] >= x.p.ex[3]) za = z1; else zb = z1; }
              if (Math.abs(zb - za) < tz) return;
              q.exactA = atZ(za); q.exactB = atZ(zb);
            }
            edgePiece(q, x.p.ei);
          });
        });
      });
    }
    if (rpend.length) roundSilhouettes();
    // Exact silhouettes of spheres and tori (a mug's handle, a fillet round a rim), r3/drawings3. A facet silhouette
    // zigzags along the facets; the true outline is where the surface normal is perpendicular to the view:
    //   sphere: the circle of radius r about its centre, seen face-on;
    //   torus (centre o, axis d, radii R, r; at angle φ the radial direction w, tube angle θ, normal cos θ w + sin θ d):
    //     cos θ (w·e) + sin θ (d·e) = 0, two branches. Seen along the axis that is the circles R ± r; seen from the
    //     side, the circles at d-heights ±r (edge-on lines) and the tube's cross-sections where w ⊥ e (face-on
    //     circles of radius r); in any other view a space curve, sampled finely enough to be within a hundredth of a
    //     millimetre of the true one and clipped like an edge.
    // Each facet silhouette piece is moved onto the branch it runs beside; circles go through the true-curve machinery
    // (exact circles and arcs with hidden parts), the general curve as short exact chords. Pieces with no clear branch
    // keep their facet edge.
    function roundSilhouettes() {
      var runs = {}, rorder = [], axial = {};
      function fallback(p) { var q = { a: p.ed.a, b: p.ed.b, faces: p.ed.faces, normals: p.ed.normals, smooth: true, exactDone: true }; edgePiece(q, p.ei); }
      var onCircle = onCircle3;
      function toGroup(p, gi, A, B) {
        if (!A || !B) { fallback(p); return; }
        var dev = Math.max(V.len(V.sub(A, p.ed.a)), V.len(V.sub(B, p.ed.b)));
        edgePiece({ a: p.ed.a, b: p.ed.b, faces: p.ed.faces, normals: p.ed.normals, smooth: true, exactDone: true, exactA: A, exactB: B, group: gi, eps: 2 * dev }, p.ei);
      }
      rpend.forEach(function (p) {
        var S = p.S, body = mesh.faces[p.ed.faces[0]].body || 0, a = p.ed.a, b = p.ed.b, m = V.scale(V.add(a, b), 0.5);
        if (S.t === 'sph') { toGroup(p, synthGroup(body, S.o, e, S.r), onCircle(a, S.o, e, S.r), onCircle(b, S.o, e, S.r)); return; }
        var d = S.d, R = S.R, r = S.r, de = V.dot(d, e);
        if (!(R > r * 1e-6) || !(r > 0)) { fallback(p); return; }
        // tube angle of the piece's midpoint
        var zm = V.dot(V.sub(m, S.o), d), rm = V.sub(V.sub(m, S.o), V.scale(d, zm)), rL = V.len(rm);
        if (rL < 1e-12) { fallback(p); return; }
        var wm = V.scale(rm, 1 / rL), cth = rL - R, sth = zm, am = V.dot(wm, e);
        if (Math.abs(de) > 1 - 1e-9) {
          // along the axis: the outer or inner equator
          var rr = R + (cth >= 0 ? r : -r);
          if (rr <= 1e-9 * R) { fallback(p); return; }
          var ge = synthGroup(body, S.o, d, rr);
          axial[ge] = { S: S, skey: p.key, body: body, G: GR[ge] };
          toGroup(p, ge, onCircle(a, S.o, d, rr), onCircle(b, S.o, d, rr));
          return;
        }
        if (Math.abs(de) < 1e-9) {
          // from the side: a piece running round the axis lies by the top or bottom circle (seen edge-on), a piece
          // running round the tube by the tube's cross-section where w ⊥ e (seen face-on)
          var w0 = V.cross(d, e), wl = V.len(w0), hyp = Math.hypot(cth, sth), tv = V.sub(b, a);
          var along = Math.abs(V.dot(tv, V.cross(d, wm))), mer = Math.abs(V.dot(tv, V.sub(V.scale(d, cth / hyp), V.scale(wm, sth / hyp))));
          if (wl > 1e-12) w0 = V.scale(w0, (V.dot(w0, wm) >= 0 ? 1 : -1) / wl);
          var nearX = wl > 1e-12 && V.dot(w0, wm) >= Math.cos(Math.PI / 12);
          if (nearX && (mer > along || Math.abs(sth) < 0.5 * hyp)) {
            // only the tube's outer half is outline: the inner half lies behind the tube itself, and the facet pieces
            // beside it otherwise ran past the top / bottom lines (r5/drawings5)
            var cc = V.add(S.o, V.scale(w0, R)), nn = V.norm(V.cross(d, w0));
            toGroup(p, synthGroup(body, cc, nn, r, R > r ? w0 : null), onCircle(a, cc, nn, r), onCircle(b, cc, nn, r));
            return;
          }
          if (Math.abs(sth) < 0.5 * hyp) { fallback(p); return; }
          var cz = V.add(S.o, V.scale(d, sth > 0 ? r : -r)), gz = synthGroup(body, cz, d, R);
          axial[gz] = { S: S, skey: p.key, body: body, G: GR[gz] };
          toGroup(p, gz, onCircle(a, cz, d, R), onCircle(b, cz, d, R));
          return;
        }
        // any other view: the branch beside the piece, and its angular extent about the axis
        var sg = de * cth - am * sth >= 0 ? 1 : -1;
        var x0 = V.norm(V.cross(d, Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), y0 = V.cross(d, x0);
        var phi = function (q) { var w = V.sub(q, S.o); return Math.atan2(V.dot(w, y0), V.dot(w, x0)); };
        var fa = phi(a), fb = unwrapNear(phi(b), fa);
        var key = p.key + '|' + body + '|' + sg;
        if (!runs[key]) { runs[key] = { S: S, skey: p.key, body: body, sg: sg, x0: x0, y0: y0, ivs: [], dev: 0, phi: phi }; rorder.push(key); }
        runs[key].ivs.push([Math.min(fa, fb), Math.max(fa, fb)]);
        var ra = runs[key];
        ra.p = p;
        [a, b].forEach(function (q) { var X = torusSil(ra, phi(q)); if (X) ra.dev = Math.max(ra.dev, V.len(V.sub(X, q))); });
      });
      // the exact silhouette point of a torus run at angle φ
      function torusSil(ra, f) {
        var S = ra.S, w = V.add(V.scale(ra.x0, Math.cos(f)), V.scale(ra.y0, Math.sin(f))), aa = V.dot(w, e), bb = V.dot(S.d, e), h = Math.hypot(aa, bb);
        if (h < 1e-12) return null;
        var c = ra.sg * bb / h, s = -ra.sg * aa / h;
        return V.add(V.add(S.o, V.scale(w, S.R + S.r * c)), V.scale(S.d, S.r * s));
      }
      // A partial torus (a swept handle's bend, a fillet round part of a rim) ends on meridians φ = lo, hi. The facet
      // silhouette stops at its last facet vertex, up to one facet short of them; a run that ends within a facet of a
      // meridian is carried on to it, so the outline meets the next face's outline (the handle's straight tube) with
      // no gap (r4/drawings4). -> { lo, hi, step, th: [tube angles of the vertices on lo], [on hi] } | null (full turn)
      function torusExtent(ra) {
        var fs = [], S = ra.S;
        mesh.faces.forEach(function (f, fi) {
          var s = CV.faceSurf[fi];
          if (!s || s.key !== ra.skey || (f.body || 0) !== ra.body) return;
          for (var o = f.start * 9; o < (f.start + f.count) * 9; o += 3) fs.push([P[o], P[o + 1], P[o + 2]]);
        });
        if (fs.length < 6) return null;
        var ang = fs.map(function (q) { var f = ra.phi(q); return f < 0 ? f + TWO_PI : f; }).sort(function (a, b) { return a - b; });
        var gaps = [];
        for (var i = 0; i < ang.length; i++) gaps.push([(i + 1 < ang.length ? ang[i + 1] : ang[0] + TWO_PI) - ang[i], i]);
        gaps.sort(function (a, b) { return b[0] - a[0]; });
        var big = gaps[0], step = 0;
        for (var j = 1; j < gaps.length; j++) if (gaps[j][0] > 1e-9) { step = gaps[j][0]; break; }
        if (!(big[0] > 3 * step && big[0] > 0.02)) return null;
        var hi = ang[big[1]], lo = big[1] + 1 < ang.length ? ang[big[1] + 1] : ang[0];
        function tube(q) { var w = V.sub(q, S.o), z = V.dot(w, S.d), rv = V.sub(w, V.scale(S.d, z)); return Math.atan2(z, V.len(rv) - Math.abs(S.R)); }
        var thLo = [], thHi = [];
        fs.forEach(function (q) { var f = ra.phi(q); f = f < 0 ? f + TWO_PI : f; if (Math.abs(f - lo) < 1e-7) thLo.push(tube(q)); if (Math.abs(f - hi) < 1e-7) thHi.push(tube(q)); });
        return { lo: lo, hi: hi, step: step, thLo: thLo, thHi: thHi, tube: tube };
      }
      // the run's ends carried on to the meridians they stop short of (only where the silhouette point there lies within
      // a facet of the face's boundary vertices, so a branch leaving the face elsewhere is not stretched)
      function extendRun(ra, iv, ext) {
        if (!ext) return iv;
        var near = function (X, ths) { if (!X) return false; var t = ext.tube(X); return ths.some(function (x) { var d = Math.abs(x - t) % TWO_PI; return Math.min(d, TWO_PI - d) < 0.6; }); };
        var reach = 1.5 * ext.step + 1e-9, lo = unwrapNear(ext.lo, iv[0]), hi = unwrapNear(ext.hi, iv[1]), out = iv.slice();
        if (iv[0] - lo > 1e-12 && iv[0] - lo <= reach && near(torusSil(ra, lo), ext.thLo)) out[0] = lo;
        if (hi - iv[1] > 1e-12 && hi - iv[1] <= reach && near(torusSil(ra, hi), ext.thHi)) out[1] = hi;
        return out;
      }
      var tolS = diag * 3e-5 + 1e-9;
      rorder.forEach(function (key) {
        var ra = runs[key], eps = 2 * ra.dev, ext = torusExtent(ra);
        joinRuns(modMerge(ra.ivs, 1e-9), 1e-9).map(function (iv) { return extendRun(ra, iv, ext); }).forEach(function (iv) {
          if (iv[1] - iv[0] < 1e-9) return;
          var pts = [];
          function pr2(X) { return [V.dot(X, U), V.dot(X, Vv)]; }
          function sub(f0, X0, f1, X1, depth) {
            var fm = (f0 + f1) / 2, Xm = torusSil(ra, fm);
            if (!Xm || !X0 || !X1) { pts.push([f1, X1]); return; }
            var q0 = pr2(X0), q1 = pr2(X1), qm = pr2(Xm), mx = (q0[0] + q1[0]) / 2 - qm[0], my = (q0[1] + q1[1]) / 2 - qm[1];
            if (depth < 12 && (Math.hypot(mx, my) > tolS || depth < 2)) { sub(f0, X0, fm, Xm, depth + 1); sub(fm, Xm, f1, X1, depth + 1); }
            else pts.push([f1, X1]);
          }
          var n0 = Math.max(1, Math.ceil((iv[1] - iv[0]) / (Math.PI / 24))), fPrev = iv[0], XPrev = torusSil(ra, fPrev);
          pts.push([fPrev, XPrev]);
          for (var i = 1; i <= n0; i++) { var f = iv[0] + (iv[1] - iv[0]) * i / n0, X = torusSil(ra, f); sub(fPrev, XPrev, f, X, 0); fPrev = f; XPrev = X; }
          for (var j = 0; j + 1 < pts.length; j++) {
            var A = pts[j][1], B = pts[j + 1][1];
            if (!A || !B) continue;
            var a2 = pr2(A), b2 = pr2(B), L2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
            if (L2 < 1e-12) continue;
            var hidden = hiddenIntervals(A, B, a2, b2, eps), t = 0;
            var seg = function (t0, t1, list) { if (t1 - t0 > 1e-9) list.push([a2[0] + (b2[0] - a2[0]) * t0, a2[1] + (b2[1] - a2[1]) * t0, a2[0] + (b2[0] - a2[0]) * t1, a2[1] + (b2[1] - a2[1]) * t1, ra.body]); };
            hidden.forEach(function (h) { seg(t, h[0], vis); seg(h[0], h[1], hid); t = h[1]; });
            seg(t, 1, vis);
            silh.push(a2, b2);
          }
        });
      });
      // a partial torus seen from the side or along its axis: its top / bottom circles (edge-on) and equators
      // (face-on) stop at the last facet vertex, up to a facet short of the end meridians; visible runs that end
      // within a facet and a half of one are carried on to it, so the outline meets the tube's cross-section and the
      // next face's outline (the Mug's handle from the right stopped 0.2 mm short) (r5/drawings5)
      Object.keys(axial).forEach(function (gi) {
        var ax = axial[gi], st = cst[gi], G = ax.G;
        if (!st || !st.vis.length) return;
        var ext = torusExtent({ S: ax.S, skey: ax.skey, body: ax.body, phi: function (q) { var w = V.sub(q, ax.S.o); return Math.atan2(V.dot(w, G.y), V.dot(w, G.x)); } });
        if (!ext) return;
        var reach = 1.5 * ext.step + 1e-9;
        joinRuns(modMerge(st.vis, 1e-9), 1e-9).forEach(function (iv) {
          var lo = unwrapNear(ext.lo, iv[0]), hi = unwrapNear(ext.hi, iv[1]);
          if (iv[0] - lo > 1e-12 && iv[0] - lo <= reach) st.vis.push([lo, iv[0]]);
          if (hi - iv[1] > 1e-12 && hi - iv[1] <= reach) st.vis.push([iv[1], hi]);
        });
      });
    }
    // the true curves: circles seen along their axis (grouped by their projection, so a hole's far rim under its near
    // rim is not drawn hidden), ellipses seen obliquely, lines seen edge-on
    tangentCircles();
    var exact = { circles: { visible: [], hidden: [] }, arcs: { visible: [], hidden: [] }, ellipses: { visible: [], hidden: [] }, circlesAll: [], arcsAll: [] };
    var extra = [];   // [c, ax, ay, t0, t1] of every drawn curve piece, for the bounds
    if (CV) {
      var cgroups = {}, corder = [], qc = diag * 1e-6 + 1e-12, GAPA = 1e-7;
      cst.forEach(function (st, gi) {
        if (!st) return;
        var G = GR[gi], ne = V.dot(G.n, e), c2 = [V.dot(G.c, U), V.dot(G.c, Vv)];
        var x2 = [G.r * V.dot(G.x, U), G.r * V.dot(G.x, Vv)], y2 = [G.r * V.dot(G.y, U), G.r * V.dot(G.y, Vv)];
        // gaps shorter than a drawable piece are closed too: a visible run broken only by a sliver of hidden curve (at
        // a tangent point) is one run, and a run that then covers the whole curve is a full circle / ellipse
        var minA = tol2 * 10 / Math.max(G.r, 1e-12), gapC = Math.max(GAPA, Math.min(minA, 1e-3));
        var sv = closeFull(modMerge(st.vis, gapC), gapC), hidIv = st.hid;
        if (G.half) {
          // a torus tube's cross-section: visible pieces past the outer half go to its hidden inner half (r5/drawings5)
          var aw = curveAngle(G, V.add(G.c, G.half)), hcut = modMerge([[aw + Math.PI / 2, aw + 1.5 * Math.PI]], 0), svc = subtractIntervals(sv, hcut, 0);
          hidIv = hidIv.concat(subtractIntervals(sv, svc, 0));
          sv = svc;
        }
        var sh = subtractIntervals(modMerge(hidIv, GAPA), sv, GAPA);
        sv = sv.filter(function (iv) { return iv[1] - iv[0] > minA; }); sh = sh.filter(function (iv) { return iv[1] - iv[0] > minA; });
        if (Math.abs(ne) > 1 - 1e-9) {
          var s = ne > 0 ? 1 : -1, f0 = Math.atan2(x2[1], x2[0]);
          var toPhi = function (iv) { return s > 0 ? [f0 + iv[0], f0 + iv[1]] : [f0 - iv[1], f0 - iv[0]]; };
          var key = Math.round(c2[0] / qc) + ',' + Math.round(c2[1] / qc) + ',' + Math.round(G.r / qc), cg = cgroups[key];
          if (!cg) { cg = cgroups[key] = { c: c2, r: G.r, bodies: {}, border: [], arc: false, real: false }; corder.push(key); }
          if (G.arc) cg.arc = true;
          if (!G.sil) cg.real = true;   // a model edge, not only an outline (model items dimension edges)
          var cb = cg.bodies[G.body] || (cg.bodies[G.body] = { vis: [], hid: [], arc: false });
          if (G.arc) cb.arc = true;
          if (cg.border.indexOf(G.body) < 0) cg.border.push(G.body);
          sv.forEach(function (iv) { cb.vis.push(toPhi(iv)); });
          sh.forEach(function (iv) { cb.hid.push(toPhi(iv)); });
        } else if (Math.abs(ne) < 1e-9) {
          // edge-on: c2 + f(θ) t, f = fx cos θ + fy sin θ; each angle range is the segment between f's extremes
          var tdir = Math.hypot(x2[0], x2[1]) >= Math.hypot(y2[0], y2[1]) ? x2 : y2, tl = Math.hypot(tdir[0], tdir[1]);
          if (tl < 1e-15) return;
          var td = [tdir[0] / tl, tdir[1] / tl], fx = x2[0] * td[0] + x2[1] * td[1], fy = y2[0] * td[0] + y2[1] * td[1];
          var edgeOn = function (iv, list) {
            var lo = Infinity, hi = -Infinity;
            function f(th) { var v = fx * Math.cos(th) + fy * Math.sin(th); if (v < lo) lo = v; if (v > hi) hi = v; }
            f(iv[0]); f(iv[1]);
            var ps = Math.atan2(fy, fx);
            for (var j = -4; j <= 4; j++) { var th = ps + j * Math.PI; if (th > iv[0] && th < iv[1]) f(th); }
            if (hi - lo < tol2 * 10) return;
            list.push([c2[0] + td[0] * lo, c2[1] + td[1] * lo, c2[0] + td[0] * hi, c2[1] + td[1] * hi, G.body]);
            silh.push([c2[0] + td[0] * lo, c2[1] + td[1] * lo], [c2[0] + td[0] * hi, c2[1] + td[1] * hi]);
          };
          joinRuns(sv, GAPA).forEach(function (iv) { edgeOn(iv, vis); });
          joinRuns(sh, GAPA).forEach(function (iv) { edgeOn(iv, hid); });
        } else {
          [[sv, 'visible'], [sh, 'hidden']].forEach(function (pair) {
            joinRuns(pair[0], pair[0] === sv ? gapC : GAPA).forEach(function (iv) {
              var full = isFull(pair[0]);
              exact.ellipses[pair[1]].push({ c: c2, ax: x2, ay: y2, t0: full ? 0 : iv[0], t1: full ? TWO_PI : iv[1], full: full, body: G.body });
              extra.push([c2, x2, y2, iv[0], iv[1]]);
            });
          });
        }
      });
      corder.forEach(function (key) {
        var cg = cgroups[key], allVis = [], all = [];
        cg.border.forEach(function (b) { cg.bodies[b].vis.forEach(function (iv) { allVis.push(iv); all.push(iv); }); cg.bodies[b].hid.forEach(function (iv) { all.push(iv); }); });
        allVis = modMerge(allVis, GAPA);
        var R = cg.r;
        function emit(ivs, kind, b, isArc) {
          ivs = modMerge(ivs, GAPA);
          if (kind === 'hidden') ivs = subtractIntervals(ivs, allVis, GAPA);
          if (!ivs.length) return;
          if (isFull(ivs)) { exact.circles[kind].push(cg.real ? { c: cg.c.slice(), r: R, body: b, exact: true } : { c: cg.c.slice(), r: R, body: b, exact: true, sil: true }); extra.push([cg.c, [R, 0], [0, R], 0, TWO_PI]); return; }
          joinRuns(ivs, GAPA).forEach(function (iv) {
            exact.arcs[kind].push({ c: cg.c.slice(), r: R, a0: iv[0] * 180 / Math.PI, a1: iv[1] * 180 / Math.PI, body: b, exact: true, src: isArc ? 'arc' : cg.real ? 'circle' : 'silhouette' });
            extra.push([cg.c, [R, 0], [0, R], iv[0], iv[1]]);
          });
        }
        cg.border.forEach(function (b) { var cb = cg.bodies[b]; emit(cb.vis, 'visible', b, cb.arc); emit(cb.hid, 'hidden', b, cb.arc); });
        var cov = modMerge(all, GAPA);
        if (isFull(cov)) exact.circlesAll.push({ c: cg.c.slice(), r: R, body: cg.border[0], exact: true });
        else joinRuns(cov, GAPA).forEach(function (iv) { exact.arcsAll.push({ c: cg.c.slice(), r: R, a0: iv[0] * 180 / Math.PI, a1: iv[1] * 180 / Math.PI, body: cg.border[0], src: cg.arc ? 'arc' : 'circle' }); });
      });
    }
    var merged = mergeCollinear(vis, hid, diag);
    var vc = extractCircles(merged.visible, diag), hc = extractCircles(merged.hidden, diag);
    // every edge whole, visible or not: what user dimensions reattach to after a part change
    var ac = extractCircles(mergeCollinear(vis.concat(hid), [], diag).visible, diag);
    if (CV) {
      // the exact curves and silhouettes reach past the facets' vertices: the view's extent is the true one
      extra.forEach(function (x) { curveBounds(x[0], x[1], x[2], x[3], x[4], bounds); });
      silh.forEach(function (p) {
        if (p[0] < bounds.umin) bounds.umin = p[0]; if (p[0] > bounds.umax) bounds.umax = p[0];
        if (p[1] < bounds.vmin) bounds.vmin = p[1]; if (p[1] > bounds.vmax) bounds.vmax = p[1];
      });
    }
    var hlr = opts.display === 'hlr';
    var res = {
      orient: O.name, u: U, v: Vv, e: e, bounds: bounds, all: ac.lines, circlesAll: ac.circles.concat(exact.circlesAll), arcsAll: exact.arcsAll,
      lines: { visible: vc.lines, hidden: hlr ? [] : hc.lines },
      circles: { visible: vc.circles.concat(exact.circles.visible), hidden: hlr ? [] : hc.circles.concat(exact.circles.hidden) },
      arcs: { visible: exact.arcs.visible, hidden: hlr ? [] : exact.arcs.hidden },
      ellipses: { visible: exact.ellipses.visible, hidden: hlr ? [] : exact.ellipses.hidden },
      exact: !!CV
    };
    if (CV) closeEnds(res.lines.visible, res.ellipses.visible, res.arcs.visible, res.circles.visible, chordTol());
    closeFreeEnds(res.lines.visible, res.ellipses.visible, res.arcs.visible, chordTol());
    // tangent edges (opts.tangent 'visible' | 'font'): visible pieces only, joined, closed chains as circles; pieces
    // of true circles as exact circles, arcs and ellipses
    var tex = { circles: [], arcs: [], ellipses: [] };
    if (tanOn) tcs.forEach(function (ivs, gi) {
      if (!ivs || !ivs.length) return;
      var G = GR[gi], ne = V.dot(G.n, e), c2 = [V.dot(G.c, U), V.dot(G.c, Vv)];
      var x2 = [G.r * V.dot(G.x, U), G.r * V.dot(G.x, Vv)], y2 = [G.r * V.dot(G.y, U), G.r * V.dot(G.y, Vv)];
      var minA = tol2 * 10 / Math.max(G.r, 1e-12), gapC = Math.max(1e-7, Math.min(minA, 1e-3));
      var sv = closeFull(modMerge(ivs, gapC), gapC).filter(function (iv) { return iv[1] - iv[0] > minA; });
      if (!sv.length) return;
      if (Math.abs(ne) > 1 - 1e-9) {
        var s = ne > 0 ? 1 : -1, f0 = Math.atan2(x2[1], x2[0]);
        if (isFull(sv)) { tex.circles.push({ c: c2, r: G.r, body: G.body, exact: true }); return; }
        joinRuns(sv, gapC).forEach(function (iv) {
          var ph = s > 0 ? [f0 + iv[0], f0 + iv[1]] : [f0 - iv[1], f0 - iv[0]];
          tex.arcs.push({ c: c2, r: G.r, a0: ph[0] * 180 / Math.PI, a1: ph[1] * 180 / Math.PI, body: G.body, exact: true });
        });
      } else if (Math.abs(ne) < 1e-9) {
        var tdir = Math.hypot(x2[0], x2[1]) >= Math.hypot(y2[0], y2[1]) ? x2 : y2, tl = Math.hypot(tdir[0], tdir[1]);
        if (tl < 1e-15) return;
        var td = [tdir[0] / tl, tdir[1] / tl], fx = x2[0] * td[0] + x2[1] * td[1], fy = y2[0] * td[0] + y2[1] * td[1];
        joinRuns(sv, gapC).forEach(function (iv) {
          var lo = Infinity, hi = -Infinity, f = function (th) { var v = fx * Math.cos(th) + fy * Math.sin(th); if (v < lo) lo = v; if (v > hi) hi = v; };
          f(iv[0]); f(iv[1]);
          var ps = Math.atan2(fy, fx);
          for (var j = -4; j <= 4; j++) { var th = ps + j * Math.PI; if (th > iv[0] && th < iv[1]) f(th); }
          if (hi - lo >= tol2 * 10) tan.push([c2[0] + td[0] * lo, c2[1] + td[1] * lo, c2[0] + td[0] * hi, c2[1] + td[1] * hi, G.body]);
        });
      } else {
        var full = isFull(sv);
        joinRuns(sv, gapC).forEach(function (iv) { tex.ellipses.push({ c: c2, ax: x2, ay: y2, t0: full ? 0 : iv[0], t1: full ? TWO_PI : iv[1], full: full, body: G.body }); });
      }
    });
    var tm = tanOn ? extractCircles(mergeCollinear(tan, [], diag).visible, diag) : null;
    res.lines.tangent = tm ? tm.lines : []; res.circles.tangent = tm ? tm.circles.concat(tex.circles) : [];
    res.arcs.tangent = tex.arcs; res.ellipses.tangent = tex.ellipses;
    res.stats = { visibleLines: res.lines.visible.length, hiddenLines: res.lines.hidden.length, visibleCircles: res.circles.visible.length, hiddenCircles: res.circles.hidden.length, occluders: tris.length };
    if (CV) { res.stats.visibleArcs = res.arcs.visible.length; res.stats.hiddenArcs = res.arcs.hidden.length; res.stats.visibleEllipses = res.ellipses.visible.length; res.stats.hiddenEllipses = res.ellipses.hidden.length; }
    if (tanOn) res.stats.tangentLines = res.lines.tangent.length + res.circles.tangent.length + res.arcs.tangent.length + res.ellipses.tangent.length;
    return res;
  }

  function mergeIntervals(ivs, gap) {
    if (!ivs.length) return ivs;
    ivs.sort(function (a, b) { return a[0] - b[0]; });
    var out = [ivs[0].slice()];
    for (var i = 1; i < ivs.length; i++) {
      var last = out[out.length - 1];
      if (ivs[i][0] <= last[1] + gap) last[1] = Math.max(last[1], ivs[i][1]); else out.push(ivs[i].slice());
    }
    return out;
  }
  // Collinear visible pieces are joined; hidden pieces are joined and then lose whatever a visible piece on the same
  // line covers (a hidden edge drawn under a visible one is not shown, as on a real drawing).
  function mergeCollinear(vis, hid, diag) {
    var q = diag * 1e-6 + 1e-12, gap = diag * 1e-6;
    var groups = {}, order = [];
    function add(s, cls) {
      var dx = s[2] - s[0], dy = s[3] - s[1], L = Math.hypot(dx, dy);
      if (L < 1e-12) return;
      dx /= L; dy /= L;
      if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) { dx = -dx; dy = -dy; }
      var c = dx * s[1] - dy * s[0];
      // lines are merged per body, so each drawn piece still knows which component it belongs to (balloons)
      var key = Math.round(dx * 1e6) + ',' + Math.round(dy * 1e6) + ',' + Math.round(c / q) + ',' + (s[4] || 0);
      var g = groups[key];
      if (!g) { g = groups[key] = { d: [dx, dy], p: [s[0], s[1]], vis: [], hid: [], body: s[4] || 0 }; order.push(key); }
      var t0 = (s[0] - g.p[0]) * dx + (s[1] - g.p[1]) * dy, t1 = (s[2] - g.p[0]) * dx + (s[3] - g.p[1]) * dy;
      g[cls].push([Math.min(t0, t1), Math.max(t0, t1)]);
    }
    vis.forEach(function (s) { add(s, 'vis'); });
    hid.forEach(function (s) { add(s, 'hid'); });
    var byLine = {};
    order.forEach(function (key) { var lk = key.slice(0, key.lastIndexOf(',')); (byLine[lk] || (byLine[lk] = [])).push(key); });
    var outV = [], outH = [];
    order.forEach(function (key) {
      var g = groups[key];
      var mv = mergeIntervals(g.vis, gap), mh = mergeIntervals(g.hid, gap), mvAll = mv;
      // a hidden edge under a visible edge of another component (a pin's side inside its hole) is not shown either
      var lineKey = key.slice(0, key.lastIndexOf(','));
      if (byLine[lineKey].length > 1) {
        var all = [];
        byLine[lineKey].forEach(function (k2) { var g2 = groups[k2], off = (g2.p[0] - g.p[0]) * g.d[0] + (g2.p[1] - g.p[1]) * g.d[1]; g2.vis.forEach(function (iv) { all.push([iv[0] + off, iv[1] + off]); }); });
        mvAll = mergeIntervals(all, gap);
      }
      function emit(iv, list) {
        if (iv[1] - iv[0] < gap * 10) return;
        list.push([g.p[0] + g.d[0] * iv[0], g.p[1] + g.d[1] * iv[0], g.p[0] + g.d[0] * iv[1], g.p[1] + g.d[1] * iv[1], g.body]);
      }
      mv.forEach(function (iv) { emit(iv, outV); });
      mh.forEach(function (iv) {
        var parts = [iv.slice()];
        mvAll.forEach(function (w) {
          var next = [];
          parts.forEach(function (p) {
            if (w[1] <= p[0] + gap || w[0] >= p[1] - gap) { next.push(p); return; }
            if (w[0] > p[0] + gap) next.push([p[0], w[0]]);
            if (w[1] < p[1] - gap) next.push([w[1], p[1]]);
          });
          parts = next;
        });
        parts.forEach(function (p) { emit(p, outH); });
      });
    });
    return { visible: outV, hidden: outH };
  }
  // chainLines(segs, bounds) -> [[seg, …], …]: every segment once, oriented, in chains of pieces of one body that meet
  // end to end and run smoothly on (turning less than 40° at the joint: a curve drawn as chords, not a corner of the
  // outline, where a hidden line's dashes should meet as drawn) (r4/drawings4)
  var COS_CHAIN = Math.cos(40 * Math.PI / 180);
  function chainLines(segs, bd) {
    var span = bd ? Math.max(bd.umax - bd.umin, bd.vmax - bd.vmin, 1e-9) : 1, q = span * 1e-7 + 1e-12, at = {};
    function key(x, y) { return Math.round(x / q) + ',' + Math.round(y / q); }
    segs.forEach(function (s, i) { [0, 1].forEach(function (e) { var k = key(s[e * 2], s[e * 2 + 1]); (at[k] || (at[k] = [])).push([i, e]); }); });
    var used = new Uint8Array(segs.length), out = [];
    function dirOf(s, rev) { var dx = s[2] - s[0], dy = s[3] - s[1], L = Math.hypot(dx, dy) || 1; return rev ? [-dx / L, -dy / L] : [dx / L, dy / L]; }
    function oriented(s, rev) { return rev ? [s[2], s[3], s[0], s[1], s[4]] : s; }
    // the best continuation leaving the point (x, y) in direction d: [index, reversed] or null
    function next(x, y, d, body) {
      var best = null, bc = COS_CHAIN;
      (at[key(x, y)] || []).forEach(function (h) {
        var s = segs[h[0]];
        if (used[h[0]] || (s[4] || 0) !== (body || 0)) return;
        var dd = dirOf(s, h[1] === 1), c = d[0] * dd[0] + d[1] * dd[1];
        if (c > bc) { bc = c; best = [h[0], h[1] === 1]; }
      });
      return best;
    }
    for (var i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      var ch = [segs[i]], n, guard = 0;
      // forward from the end, then backward from the start
      for (var cur = ch[0]; guard++ < 100000 && (n = next(cur[2], cur[3], dirOf(cur, false), cur[4])); ) { used[n[0]] = 1; cur = oriented(segs[n[0]], n[1]); ch.push(cur); }
      for (cur = ch[0]; guard++ < 100000 && (n = next(cur[0], cur[1], dirOf(cur, true), cur[4])); ) { used[n[0]] = 1; cur = oriented(segs[n[0]], !n[1]); ch.unshift(cur); }
      out.push(ch);
    }
    return out;
  }
  // Closed chains of segments whose vertices all lie on one circle (the kernel's polygonal circles, ≥ 12 sides)
  // become { c, r } circles; everything else stays as segments.
  function extractCircles(segs, diag) {
    var q = diag * 1e-6 + 1e-12;
    function key(x, y) { return Math.round(x / q) + ',' + Math.round(y / q); }
    var adj = {};
    segs.forEach(function (s, i) {
      var ka = key(s[0], s[1]), kb = key(s[2], s[3]);
      (adj[ka] || (adj[ka] = [])).push(i); (adj[kb] || (adj[kb] = [])).push(i);
    });
    var used = new Uint8Array(segs.length), circles = [];
    for (var i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      // walk a chain of degree-2 vertices starting at segment i
      var chain = [i], pts = [[segs[i][0], segs[i][1]]], cur = i, at = key(segs[i][2], segs[i][3]), start = key(segs[i][0], segs[i][1]), ok = true;
      var seen = {}; seen[i] = 1;
      while (at !== start) {
        var lst = adj[at];
        if (!lst || lst.length !== 2) { ok = false; break; }
        var nx = lst[0] === cur ? lst[1] : lst[0];
        if (seen[nx] || used[nx]) { ok = false; break; }
        var s = segs[nx], forward = key(s[0], s[1]) === at;
        pts.push(forward ? [s[0], s[1]] : [s[2], s[3]]);
        at = forward ? key(s[2], s[3]) : key(s[0], s[1]);
        chain.push(nx); seen[nx] = 1; cur = nx;
        if (chain.length > 4000) { ok = false; break; }
      }
      if (!ok || (adj[start] || []).length !== 2 || pts.length < 12) continue;
      var c = circleFit(pts, diag);
      if (!c) continue;
      chain.forEach(function (j) { used[j] = 1; });
      c.body = segs[i][4] || 0;
      circles.push(c);
    }
    return { lines: segs.filter(function (s, j) { return !used[j]; }), circles: circles };
  }
  function circleFit(pts, diag) {
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    var r = 0;
    pts.forEach(function (p) { r += Math.hypot(p[0] - cx, p[1] - cy); });
    r /= pts.length;
    if (r < diag * 1e-6) return null;
    for (var i = 0; i < pts.length; i++) if (Math.abs(Math.hypot(pts[i][0] - cx, pts[i][1] - cy) - r) > r * 1e-4 + diag * 1e-7) return null;
    // equal sides too, so a closed chain of arcs of different radii is not taken for one circle
    var s0 = null;
    for (var j = 0; j < pts.length; j++) {
      var p = pts[j], n = pts[(j + 1) % pts.length], L = Math.hypot(n[0] - p[0], n[1] - p[1]);
      if (s0 == null) s0 = L; else if (Math.abs(L - s0) > s0 * 1e-3 + diag * 1e-7) return null;
    }
    return { c: [cx, cy], r: r };
  }

  // ------------------------------------------------------------------ true curves (the kernel's analytic records)
  // A mesh from Kernel.meshFromBody keeps the CSG polygons of every face, and each polygon of a curved face carries its
  // analytic surface (polygon.surf: a cylinder, cone, sphere or torus). Kernel.curveEdges lists the true circles and
  // arcs among the mesh edges (caps, hole rims, steps, slot ends, partial-revolve profiles) with the chords that
  // approximate them. meshCurves(mesh) -> null for a mesh without records (imported STL / STEP, legacy), else
  //   { groups: [{ body, c, n, x, y, r, full, arc, chords }], pieceCurve: Int32Array (meshEdges index -> group or -1),
  //     faceSurf: [{ key, s } | null] (the one analytic surface a mesh face lies on) }
  // Curves with the same body, centre, axis and radius are one group (a circle split between two surfaces or split
  // into arcs by the kernel comes back whole); its frame is x, y = n × x and angles are measured from x about n.
  // Every mesh edge piece lying on a chord is mapped to its group by walking the chord's pieces end to end.
  // Cached on the mesh.
  var TWO_PI = 2 * Math.PI;
  function meshCurves(mesh) {
    if (mesh._drawingCurves !== undefined) return mesh._drawingCurves;
    var out = null;
    if (K.curveEdges && mesh.faces && mesh.faces.some(function (f) { return f.polys && f.polys.some(function (p) { return p.surf; }); })) {
      try { out = buildCurves(mesh); } catch (err) { out = null; }
    }
    mesh._drawingCurves = out;
    return out;
  }
  function buildCurves(mesh) {
    var diag = meshDiag(mesh), tol = diag * 1e-6 + 1e-9, qr = diag * 1e-7 + 1e-12;
    // the analytic surface of each face (all its polygons on the same one), for smooth edges and exact silhouettes
    var faceSurf = mesh.faces.map(function (f) {
      if (!f.polys || !f.polys.length || !f.polys.every(function (p) { return p.surf; })) return null;
      var cs = K.curveSurfaces(f.polys);
      return cs.length === 1 ? { key: cs[0].key, s: cs[0].surf } : null;
    });
    // curves per body, grouped by body + centre + axis line + radius
    var byBody = {}, border = [];
    mesh.faces.forEach(function (f) {
      var b = f.body || 0;
      if (!byBody[b]) { byBody[b] = []; border.push(b); }
      (f.polys || []).forEach(function (p) { byBody[b].push(p); });
    });
    var groups = [], gmap = {};
    function q(x) { return Math.round(x / qr); }
    border.forEach(function (b) {
      K.curveEdges(byBody[b]).forEach(function (ce) {
        var n = ce.normal, sg = (n[0] < -1e-9 || (Math.abs(n[0]) <= 1e-9 && (n[1] < -1e-9 || (Math.abs(n[1]) <= 1e-9 && n[2] < 0)))) ? -1 : 1;
        var key = b + '|' + ce.center.map(q).join(',') + '|' + n.map(function (x) { return Math.round(x * sg * 1e6); }).join(',') + '|' + q(ce.radius);
        var g = gmap[key];
        if (!g) {
          var x = ce.xdir.slice();
          g = gmap[key] = { body: b, c: ce.center.slice(), n: n.slice(), x: x, y: V.cross(n, x), r: ce.radius, arc: false, chords: [] };
          groups.push(g);
        }
        if (ce.kind === 'arc') g.arc = true;
        ce.chords.forEach(function (ch) { (g.raw || (g.raw = [])).push([ch[0], ch[1]]); });
      });
      roundRims(byBody[b]).forEach(function (rm) {
        var n = rm.n, sg = (n[0] < -1e-9 || (Math.abs(n[0]) <= 1e-9 && (n[1] < -1e-9 || (Math.abs(n[1]) <= 1e-9 && n[2] < 0)))) ? -1 : 1;
        var key = b + '|' + rm.c.map(q).join(',') + '|' + n.map(function (x) { return Math.round(x * sg * 1e6); }).join(',') + '|' + q(rm.r);
        var g = gmap[key];
        if (!g) {
          var x = null;
          [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (w) { if (x) return; var t = V.sub(w, V.scale(n, V.dot(w, n))); if (V.len(t) > 1e-6) x = V.norm(t); });
          g = gmap[key] = { body: b, c: rm.c, n: n.slice(), x: x, y: V.cross(n, x), r: rm.r, arc: false, chords: [] };
          groups.push(g);
        }
        (g.raw || (g.raw = [])).push(rm.ch);
      });
    });
    // The rims of torus and sphere faces whose facets carry no profile ends (an Anvil fillet round a cylinder's rim or a
    // boss's root: Kernel.curveEdges finds only a revolve's rims): the facet edges at one axial level, on the true
    // surface and used by one such facet only (the face's boundary, where it meets the cap, the cylinder or the plate)
    // -> [{ c, n, r, ch: [A, B] }] (r4/drawings4)
    function roundRims(polys) {
      var E = {}, order = [];
      function k3(p) { return Math.round(p[0] / qr) + ',' + Math.round(p[1] / qr) + ',' + Math.round(p[2] / qr); }
      polys.forEach(function (p) {
        var F = p.surf, S = F && F.s;
        if (!S || (S.t !== 'tor' && S.t !== 'sph') || F.P) return;
        var vs = p.vertices;
        for (var i = 0; i < vs.length; i++) {
          var a = vs[i].pos, bb = vs[(i + 1) % vs.length].pos, A = [a.x, a.y, a.z], B = [bb.x, bb.y, bb.z];
          if (V.len(V.sub(B, A)) < tol) continue;
          var ek = k3(A) < k3(B) ? k3(A) + '|' + k3(B) : k3(B) + '|' + k3(A);
          if (E[ek]) { E[ek].n++; continue; }
          E[ek] = { n: 1, A: A, B: B, S: S }; order.push(ek);
        }
      });
      var out = [];
      order.forEach(function (ek) {
        var e = E[ek], S = e.S;
        if (e.n !== 1) return;
        var za = V.dot(V.sub(e.A, S.o), S.d), zb = V.dot(V.sub(e.B, S.o), S.d);
        if (Math.abs(za - zb) > tol || Math.abs(za) >= S.r) return;
        var fa = surfDist(S, e.A), fb = surfDist(S, e.B);
        if (!fa || !fb || Math.abs(fa[0]) > tol || Math.abs(fb[0]) > tol) return;
        var z = (za + zb) / 2, c = V.add(S.o, V.scale(S.d, z)), ra = V.len(V.sub(e.A, c)), rb = V.len(V.sub(e.B, c)), h = Math.sqrt(S.r * S.r - z * z);
        var cands = S.t === 'sph' ? [h] : [Math.abs(S.R) + h, Math.abs(S.R) - h], r = null;
        cands.forEach(function (x) { if (x > tol && Math.abs(x - ra) <= tol && Math.abs(x - rb) <= tol) r = x; });
        if (r == null) return;
        out.push({ c: c, n: S.d, r: r, ch: [e.A, e.B] });
      });
      return out;
    }
    // chords split by the kernel (a facet cut in two) are joined back end to end when collinear; then only chords
    // whose two ends are on the true curve are kept (one cut short by a trimming face, a hex nut's flat, is not)
    function onCurve(g, p) { var w = V.sub(p, g.c), h = V.dot(w, g.n); return Math.abs(h) <= tol && Math.abs(V.len(V.sub(w, V.scale(g.n, h))) - g.r) <= tol; }
    groups.forEach(function (g) {
      var raw = [], changed = true, seenCh = {};
      (g.raw || []).forEach(function (ch) {   // a chord reported from both faces it bounds once (r4/drawings4)
        var ka = ch[0].map(q).join(','), kb = ch[1].map(q).join(','), kk = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        if (!seenCh[kk]) { seenCh[kk] = 1; raw.push(ch); }
      });
      delete g.raw;
      for (var pass = 0; changed && pass < 100000; pass++) {
        changed = false;
        for (var i = 0; i < raw.length && !changed; i++) {
          var c = raw[i], ends = [[c[0], 1], [c[1], 0]];
          for (var j0 = 0; j0 < 2 && !changed; j0++) {
            var m = ends[j0][0];
            if (onCurve(g, m)) continue;
            for (var j = 0; j < raw.length; j++) {
              if (j === i) continue;
              var o = raw[j], om = V.len(V.sub(o[0], m)) <= tol ? 0 : V.len(V.sub(o[1], m)) <= tol ? 1 : -1;
              if (om < 0) continue;
              var A = c[ends[j0][1]], B = o[1 - om], d1 = V.sub(m, A), d2 = V.sub(B, m);
              if (V.len(V.cross(d1, d2)) > tol * Math.max(V.len(d1), V.len(d2)) || V.dot(d1, d2) <= 0) continue;
              raw[i] = [A, B]; raw.splice(j, 1); changed = true; break;
            }
          }
        }
      }
      raw.forEach(function (ch) {
        if (!onCurve(g, ch[0]) || !onCurve(g, ch[1])) return;
        var t0 = curveAngle(g, ch[0]), t1 = unwrapNear(curveAngle(g, ch[1]), t0);
        g.chords.push({ p: ch[0], q: ch[1], t0: Math.min(t0, t1), t1: Math.max(t0, t1) });
      });
    });
    groups.forEach(function (g) {
      var cov = g.cov = modMerge(g.chords.map(function (c) { return [c.t0, c.t1]; }), 1e-7);
      g.full = cov.length === 1 && cov[0][1] - cov[0][0] >= TWO_PI - 1e-7;
      // a group that closes is a circle even when the kernel reported its pieces as arcs (a split face)
      if (g.full) g.arc = false;
    });
    // map mesh edge pieces onto chords: a hash of piece end points, then walk each chord from p to q
    // sharp pieces (pieceCurve) and, apart, smooth ones (tanCurve: a tangent edge on a true circle is drawn as that
    // circle with Tangent Edges Visible, r3/drawings3)
    var edges = meshEdges(mesh), cell = tol * 4, hash, pieceCurve;
    function ck(p) { return [Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)]; }
    function mapPieces(smooth) {
      hash = {}; pieceCurve = new Int32Array(edges.length);
      for (var i = 0; i < pieceCurve.length; i++) pieceCurve[i] = -1;
      edges.forEach(function (ed, ei) {
        if (!ed.smooth !== !smooth) return;
        [ed.a, ed.b].forEach(function (p, end) { var c = ck(p), k = c.join(','); (hash[k] || (hash[k] = [])).push([ei, end]); });
      });
      walk();
      return pieceCurve;
    }
    function near(P) {
      var c = ck(P), out = [];
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
        var l = hash[(c[0] + dx) + ',' + (c[1] + dy) + ',' + (c[2] + dz)];
        if (l) l.forEach(function (h) { var ed = edges[h[0]], X = h[1] ? ed.b : ed.a; if (V.len(V.sub(X, P)) <= tol) out.push(h); });
      }
      return out;
    }
    var sharpCurve = mapPieces(false), tanCurve = mapPieces(true);
    return { groups: groups, pieceCurve: sharpCurve, tanCurve: tanCurve, faceSurf: faceSurf };
    function walk() { groups.forEach(function (g, gi) {
      g.chords.forEach(function (ch) {
        var d = V.sub(ch.q, ch.p), L = V.len(d);
        if (L < tol) return;
        d = V.scale(d, 1 / L);
        var P = ch.p, tP = 0, hit = [];
        for (var guard = 0; guard < 1000 && L - tP > tol; guard++) {
          var best = null, bt = Infinity;
          near(P).forEach(function (h) {
            var ed = edges[h[0]];
            if ((mesh.faces[ed.faces[0]].body || 0) !== g.body) return;
            var X = h[1] ? ed.a : ed.b, w = V.sub(X, ch.p), t = V.dot(w, d);
            if (t <= tP + tol * 0.5 || V.len(V.sub(w, V.scale(d, t))) > tol) return;   // collinear, ahead (it may run past q: a split chord)
            if (t < bt) { bt = t; best = { ei: h[0], X: X }; }
          });
          if (!best) { hit = null; break; }
          hit.push(best.ei); P = best.X; tP = bt;
        }
        if (hit) hit.forEach(function (ei) { if (pieceCurve[ei] < 0) pieceCurve[ei] = gi; });
      });
    }); }
  }
  // angle of a 3D point about a curve group's axis, from its x toward its y, in [0, 2π)
  function curveAngle(g, p) {
    var w = V.sub(p, g.c), a = Math.atan2(V.dot(w, g.y), V.dot(w, g.x));
    return a < 0 ? a + TWO_PI : a;
  }
  function unwrapNear(a, ref) { return a + TWO_PI * Math.round((ref - a) / TWO_PI); }
  // angular intervals reduced to [0, 2π), sorted and merged (gap: joins pieces that touch)
  function modMerge(ivs, gap) {
    var list = [];
    ivs.forEach(function (iv) {
      var a = iv[0], b = iv[1];
      if (b - a >= TWO_PI - gap) { list.push([0, TWO_PI]); return; }
      var s = Math.floor(a / TWO_PI) * TWO_PI; a -= s; b -= s;
      if (b <= TWO_PI) list.push([a, b]); else { list.push([a, TWO_PI]); list.push([0, b - TWO_PI]); }
    });
    return mergeIntervals(list, gap);
  }
  // [0, 2π) intervals minus [0, 2π) intervals
  function subtractIntervals(ivs, cut, gap) {
    var out = [];
    ivs.forEach(function (iv) {
      var parts = [iv.slice()];
      cut.forEach(function (w) {
        var next = [];
        parts.forEach(function (p) {
          if (w[1] <= p[0] + gap || w[0] >= p[1] - gap) { next.push(p); return; }
          if (w[0] > p[0] + gap) next.push([p[0], w[0]]);
          if (w[1] < p[1] - gap) next.push([w[1], p[1]]);
        });
        parts = next;
      });
      parts.forEach(function (p) { out.push(p); });
    });
    return out;
  }
  // merged [0, 2π) intervals as drawable runs: one that ends at 2π and one that starts at 0 are one run across 0
  function joinRuns(ivs, gap) {
    ivs = ivs.slice();
    if (ivs.length > 1 && ivs[0][0] <= gap && ivs[ivs.length - 1][1] >= TWO_PI - gap) {
      var last = ivs.pop();
      ivs[0] = [last[0] - TWO_PI, ivs[0][1]];
    }
    return ivs;
  }
  function isFull(ivs) { return ivs.length === 1 && ivs[0][1] - ivs[0][0] >= TWO_PI - 1e-7; }
  // merged [0, 2π) intervals that leave less than gap uncovered (across 0 included) -> one full interval
  function closeFull(ivs, gap) {
    if (!ivs.length) return ivs;
    var cov = 0; ivs.forEach(function (iv) { cov += iv[1] - iv[0]; });
    return cov >= TWO_PI - gap * Math.max(1, ivs.length) ? [[0, TWO_PI]] : ivs;
  }
  // exact silhouette of a cylinder or cone for the view direction e, next to the facet silhouette piece (a, b):
  // the generator where the surface normal is perpendicular to e, over the piece's axial extent -> [A, B] | null
  function exactSilhouette(S, e, a, b) {
    if (S.t !== 'cyl' && S.t !== 'cone') return null;
    var d = S.d, k = S.t === 'cone' ? S.k || 0 : 0, de = V.dot(d, e), ep = V.sub(e, V.scale(d, de)), s = V.len(ep);
    if (s < 1e-9) return null;                                  // looking along the axis: no silhouette line
    ep = V.scale(ep, 1 / s);
    var cb = k * de / s;
    if (Math.abs(cb) > 1) return null;                          // looking into a cone: its outline is its rim
    var sb = Math.sqrt(1 - cb * cb), side = V.cross(d, ep);
    var za = V.dot(V.sub(a, S.o), d), zb = V.dot(V.sub(b, S.o), d);
    if (Math.abs(zb - za) < 1e-9 * (1 + Math.abs(za))) return null;   // not a generator
    // the piece's radial direction picks the side (the two candidates are 2β apart)
    var m = V.scale(V.add(a, b), 0.5), mr = V.sub(V.sub(m, S.o), V.scale(d, V.dot(V.sub(m, S.o), d))), mL = V.len(mr);
    if (mL < 1e-12) return null;
    var w1 = V.add(V.scale(ep, cb), V.scale(side, sb)), w2 = V.sub(V.scale(ep, cb), V.scale(side, sb));
    var w = V.dot(w1, mr) >= V.dot(w2, mr) ? w1 : w2;
    if (V.dot(w, mr) < mL * Math.cos(Math.PI / 6)) return null; // the piece is not next to that generator
    function at(z) { return V.add(V.add(S.o, V.scale(d, z)), V.scale(w, S.r + k * z)); }
    return [at(za), at(zb), za, zb, w];
  }
  // the circle in space through points (at least 5 distinct ones, every one within tol of it) -> { c, n, r } | null
  function circle3(pts, tol) {
    var uniq = [];
    pts.forEach(function (p) { if (!uniq.some(function (u) { return V.len(V.sub(u, p)) <= tol; })) uniq.push(p); });
    if (uniq.length < 5) return null;
    var A = uniq[0], B = A, C = null, bd = -1;
    uniq.forEach(function (p) { var d = V.len(V.sub(p, A)); if (d > bd) { bd = d; B = p; } });
    var ab = V.sub(B, A), abL = V.len(ab);
    if (abL < tol * 10) return null;
    bd = -1;
    uniq.forEach(function (p) { var d = V.len(V.cross(V.sub(p, A), ab)) / abL; if (d > bd) { bd = d; C = p; } });
    if (bd < tol * 10) return null;
    var a = V.sub(A, C), b = V.sub(B, C), axb = V.cross(a, b), den = 2 * V.dot(axb, axb);
    var c = V.add(C, V.scale(V.cross(V.sub(V.scale(b, V.dot(a, a)), V.scale(a, V.dot(b, b))), axb), 1 / den)), n = V.norm(axb), r = V.len(V.sub(A, c));
    for (var i = 0; i < uniq.length; i++) {
      var w = V.sub(uniq[i], c);
      if (Math.abs(V.dot(w, n)) > tol || Math.abs(V.len(w) - r) > tol + r * 1e-7) return null;
    }
    return { c: c, n: n, r: r };
  }
  // Intersection space curves (r4/drawings4): where two different analytic surfaces meet (a handle's cylinder or
  // torus on a mug's wall, a pin through a curved face, a plane cutting a cylinder obliquely) the facet edge is a
  // chord between two points of the true curve. surfDist(S, x) -> [f, grad]: a signed distance-like function of an
  // analytic surface record (kernel.js: cyl, cone, sph, tor; here also { t: 'pln', n, c }: n·x = c) and its gradient.
  function surfDist(S, x) {
    if (S.t === 'pln') return [V.dot(S.n, x) - S.c, S.n];
    var q = V.sub(x, S.o);
    if (S.t === 'sph') { var L = V.len(q); return L < 1e-12 ? null : [L - S.r, V.scale(q, 1 / L)]; }
    var z = V.dot(q, S.d), rv = V.sub(q, V.scale(S.d, z)), rho = V.len(rv);
    if (rho < 1e-12) return null;
    var w = V.scale(rv, 1 / rho);
    if (S.t === 'cyl') return [rho - S.r, w];
    if (S.t === 'cone') { var k = S.k || 0; return [rho - (S.r + k * z), V.sub(w, V.scale(S.d, k))]; }
    if (S.t === 'tor') {
      var R = Math.abs(S.R), dr = rho - R, h = Math.hypot(dr, z);
      return h < 1e-12 ? null : [h - S.r, V.scale(V.add(V.scale(w, dr), V.scale(S.d, z)), 1 / h)];
    }
    return null;
  }
  // the point of the curve where S1 and S2 meet nearest to p (minimum-norm Newton steps on both distances), or null
  // where they do not cross cleanly there (tangent surfaces, no convergence, a jump away from p)
  function onBoth(S1, S2, p, tol, reach) {
    var x = p;
    for (var it = 0; it < 16; it++) {
      var a = surfDist(S1, x), b = surfDist(S2, x);
      if (!a || !b) return null;
      if (Math.abs(a[0]) <= tol && Math.abs(b[0]) <= tol) return V.len(V.sub(x, p)) <= reach ? x : null;
      var g11 = V.dot(a[1], a[1]), g12 = V.dot(a[1], b[1]), g22 = V.dot(b[1], b[1]), det = g11 * g22 - g12 * g12;
      if (!(det > 1e-6 * g11 * g22)) return null;   // the surfaces touch tangentially here
      var l1 = (g22 * a[0] - g12 * b[0]) / det, l2 = (g11 * b[0] - g12 * a[0]) / det;
      x = V.sub(x, V.add(V.scale(a[1], l1), V.scale(b[1], l2)));
    }
    return null;
  }
  // the chord A-B of the curve where S1 and S2 meet as points on the true curve, fine enough that no chord is more
  // than tolC from it -> [A, …, B], or null when A or B is not on both surfaces or a midpoint cannot be found
  // The ends are moved onto the true curve first (on OpenCascade's mesh they are on it already; on Anvil's they sit on
  // the facets, up to reach away), deterministically, so the chains of neighbouring chords still meet.
  // -> { pts: [A', …, B'], dev: how far the curve strays from the chord }
  function intersectionChain(S1, S2, A, B, tolOn, tolC, reach) {
    var A1 = onBoth(S1, S2, A, tolOn, reach), B1 = A1 && onBoth(S1, S2, B, tolOn, reach);
    if (!A1 || !B1 || V.len(V.sub(B1, A1)) < tolC) return null;
    var out = [A1], ok = true, dev = Math.max(V.len(V.sub(A1, A)), V.len(V.sub(B1, B)));
    (function sub(P, Q, depth) {
      if (!ok) return;
      var m = V.scale(V.add(P, Q), 0.5), L = V.len(V.sub(Q, P)), X = onBoth(S1, S2, m, tolOn, L * 0.75 + tolOn);
      if (!X) { ok = false; return; }
      var dm = V.len(V.sub(X, m));
      if (!depth) dev = Math.max(dev, dm);
      if (depth < 7 && (dm > tolC || depth < 1)) { sub(P, X, depth + 1); sub(X, Q, depth + 1); }
      else out.push(Q);
    })(A1, B1, 0);
    return ok ? { pts: out, dev: dev } : null;
  }
  // extent of the curve c + cos t ax + sin t ay (2D), t in [t0, t1], added to a bounds object
  function curveBounds(c, ax, ay, t0, t1, bd) {
    function add(t) {
      var u = c[0] + ax[0] * Math.cos(t) + ay[0] * Math.sin(t), v = c[1] + ax[1] * Math.cos(t) + ay[1] * Math.sin(t);
      if (u < bd.umin) bd.umin = u; if (u > bd.umax) bd.umax = u; if (v < bd.vmin) bd.vmin = v; if (v > bd.vmax) bd.vmax = v;
    }
    add(t0); add(t1);
    [Math.atan2(ay[0], ax[0]), Math.atan2(ay[1], ax[1])].forEach(function (t) {
      for (var j = -4; j <= 4; j++) { var tt = t + j * Math.PI; if (tt > t0 && tt < t1) add(tt); }
    });
  }

  // ------------------------------------------------------------------ section views: an exact cut of the solid
  // sectionOf(mesh, e, w) -> { mesh, caps: [face index], area, e, w }: the part with everything in front of the plane
  // p·e = w removed (p·e > w), cut exactly by CSG: each body is intersected with a box that ends on the plane, so the
  // cut faces ("caps") are true faces of the result lying on the plane and facing +e. Cached on the mesh.
  function sectionOf(mesh, e, w) {
    var c = mesh._drawingSections || (mesh._drawingSections = {});
    var key = e.map(function (x) { return Math.round(x * 1e9); }).join(',') + '|' + Math.round(w * 1e9);
    if (c[key]) return c[key];
    var P = mesh.positions64 || mesh.positions, diag = meshDiag(mesh), m = diag * 0.25 + 1;
    var u = V.norm(V.cross(Math.abs(e[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], e)), v = V.cross(e, u);
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < P.length; i += 3) {
      var p = [P[i], P[i + 1], P[i + 2]], q = [V.dot(p, e), V.dot(p, u), V.dot(p, v)];
      for (var k = 0; k < 3; k++) { if (q[k] < lo[k]) lo[k] = q[k]; if (q[k] > hi[k]) hi[k] = q[k]; }
    }
    var out;
    if (!P.length || w >= hi[0] - diag * 1e-9) out = { mesh: mesh, caps: [], area: 0 };             // the plane misses the part
    else if (w <= lo[0] + diag * 1e-9) out = { mesh: K.meshFromBody(null), caps: [], area: 0 };      // nothing behind it
    else {
      var box = boxSolid([e, u, v], [lo[0] - m, lo[1] - m, lo[2] - m], [w, hi[1] + m, hi[2] + m]);
      var byBody = {}, order = [];
      mesh.faces.forEach(function (f) {
        (f.polys || []).forEach(function (pg) { var b = pg.body || 0; if (!byBody[b]) { byBody[b] = []; order.push(b); } byBody[b].push(pg.clone()); });
      });
      var polys = [];
      order.forEach(function (b) {
        CSG.fromPolygons(byBody[b]).intersect(box).polygons.forEach(function (pg) { pg.body = b; polys.push(pg); });
      });
      var sm = K.meshFromBody(polys.length ? CSG.fromPolygons(polys) : null), caps = [], area = 0, tol = diag * 1e-7 + 1e-9;
      sm.faces.forEach(function (f, fi) {
        if (V.dot(f.normal, e) > 1 - 1e-9 && Math.abs(f.w - w) <= tol) { caps.push(fi); area += f.area; }
      });
      out = { mesh: sm, caps: caps, area: area };
    }
    out.e = e.slice(); out.w = w;
    c[key] = out;
    return out;
  }
  // a box as CSG: ax = three orthonormal axes, lo / hi = coordinate ranges along them
  function boxSolid(ax, lo, hi) {
    function pt(c) { return new CSG.Vector(ax[0][0] * c[0] + ax[1][0] * c[1] + ax[2][0] * c[2], ax[0][1] * c[0] + ax[1][1] * c[1] + ax[2][1] * c[2], ax[0][2] * c[0] + ax[1][2] * c[1] + ax[2][2] * c[2]); }
    var polys = [];
    for (var a = 0; a < 3; a++) for (var s = 0; s < 2; s++) {
      var b = (a + 1) % 3, d = (a + 2) % 3, vs = [];
      [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(function (q) {
        var c = [0, 0, 0]; c[a] = s ? hi[a] : lo[a]; c[b] = q[0] ? hi[b] : lo[b]; c[d] = q[1] ? hi[d] : lo[d];
        vs.push(new CSG.Vertex(pt(c)));
      });
      var pg = new CSG.Polygon(vs), out = V.scale(ax[a], s ? 1 : -1);
      if (pg.plane.normal.x * out[0] + pg.plane.normal.y * out[1] + pg.plane.normal.z * out[2] < 0) pg = new CSG.Polygon(vs.slice().reverse());
      polys.push(pg);
    }
    return CSG.fromPolygons(polys);
  }
  // the cut faces of a section as closed loops in a view frame: [{ loops: [[[u, v]…]…], body }]
  function capLoops(S, F) {
    return S.caps.map(function (fi) {
      var o = K.faceOutline(S.mesh, fi);
      return { body: S.mesh.faces[fi].body || 0, loops: o ? o.loops.map(function (loop) {
        return loop.map(function (p2) { var p = K.to3D(o.plane, p2[0], p2[1]); return [V.dot(p, F.u), V.dot(p, F.v)]; });
      }) : [] };
    });
  }
  // ANSI31 hatching: parallel lines at `ang` degrees, `sp` apart (paper units, anchored at the sheet origin so every
  // view's pattern lines up), clipped to the region inside an odd number of loops. Returns [[x1, y1, x2, y2]].
  function hatchLines(loops, sp, ang, off) {
    var a = ang * Math.PI / 180, d = [Math.cos(a), Math.sin(a)], n = [-Math.sin(a), Math.cos(a)];
    var tmin = Infinity, tmax = -Infinity, out = [];
    loops.forEach(function (l) { l.forEach(function (p) { var t = n[0] * p[0] + n[1] * p[1]; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }); });
    off = off || 0;
    for (var k = Math.ceil((tmin - off) / sp); k * sp + off <= tmax; k++) {
      var t = k * sp + off, xs = [];
      loops.forEach(function (l) {
        for (var i = 0; i < l.length; i++) {
          var p = l[i], q = l[(i + 1) % l.length], tp = n[0] * p[0] + n[1] * p[1] - t, tq = n[0] * q[0] + n[1] * q[1] - t;
          if ((tp > 0) !== (tq > 0)) { var f = tp / (tp - tq); xs.push(d[0] * (p[0] + (q[0] - p[0]) * f) + d[1] * (p[1] + (q[1] - p[1]) * f)); }
        }
      });
      xs.sort(function (x, y) { return x - y; });
      for (var j = 0; j + 1 < xs.length; j += 2) {
        if (xs[j + 1] - xs[j] < 1e-9) continue;
        out.push([n[0] * t + d[0] * xs[j], n[1] * t + d[1] * xs[j], n[0] * t + d[0] * xs[j + 1], n[1] * t + d[1] * xs[j + 1]]);
      }
    }
    return out;
  }

  // hatchStyle(body) -> { angle, spacing (× HATCH) }: every body of a multi-body part and every component of an assembly
  // gets its own hatch, as in SolidWorks — 45°, 135°, 30°, 120°, 60°, 150°, then the same angles 1.6× wider apart, …
  var HATCH_ANGLES = [45, 135, 30, 120, 60, 150];
  function hatchStyle(body) {
    var b = Math.max(0, body | 0);
    return { angle: HATCH_ANGLES[b % HATCH_ANGLES.length], spacing: 1 + 0.6 * Math.floor(b / HATCH_ANGLES.length) };
  }
  // Area hatch patterns by material, as SolidWorks takes them from the material (the ANSI Y14.2 families of acad.pat),
  // in units of the base spacing: line families { da (degrees added to the hatch angle), offs (perpendicular offsets
  // in one period), period, dash: [on, off] or none } (r5/drawings5)
  var HATCH_PATTERNS = {
    ANSI31: [{ da: 0, offs: [0], period: 1 }],                                   // iron, general use
    ANSI32: [{ da: 0, offs: [0, 1], period: 3 }],                                // steel
    ANSI33: [{ da: 0, offs: [0], period: 2 }, { da: 0, offs: [1], period: 2, dash: [1, 0.5] }],   // bronze, brass, copper
    ANSI34: [{ da: 0, offs: [0, 1, 2, 3], period: 6 }],                          // plastic, rubber
    ANSI37: [{ da: 0, offs: [0], period: 1 }, { da: 90, offs: [0], period: 1 }], // lead, zinc, insulation
    ANSI38: [{ da: 0, offs: [0], period: 1 }, { da: 90, offs: [0], period: 1, dash: [2.5, 1.5] }]   // aluminium
  };
  var HATCH_BY_CLASS = { 'Steel': 'ANSI32', 'Stainless Steel': 'ANSI32', 'Aluminium Alloys': 'ANSI38', 'Copper Alloys': 'ANSI33', 'Plastics': 'ANSI34' };
  // the hatch pattern for a material name (null / unknown: ANSI31)
  function hatchPattern(materialName) {
    var m = materialName && typeof Materials !== 'undefined' && Materials.find ? Materials.find(materialName) : null;
    return m && HATCH_BY_CLASS[m.category] || 'ANSI31';
  }
  // hatch segments of a pattern over loops: [[x1, y1, x2, y2], …]; dashes keep their phase along the line direction,
  // so neighbouring lines' dashes stagger the same way everywhere
  function patternLines(loops, sp, ang, pattern) {
    var out = [];
    (HATCH_PATTERNS[pattern] || HATCH_PATTERNS.ANSI31).forEach(function (fam) {
      var a = ang + fam.da, d = [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)];
      fam.offs.forEach(function (o) {
        hatchLines(loops, sp * fam.period, a, sp * o).forEach(function (l) {
          if (!fam.dash) { out.push(l); return; }
          var on = fam.dash[0] * sp, P = (fam.dash[0] + fam.dash[1]) * sp, t0 = d[0] * l[0] + d[1] * l[1], t1 = d[0] * l[2] + d[1] * l[3];
          var lo = Math.min(t0, t1), hi = Math.max(t0, t1), bx = l[0] - d[0] * t0, by = l[1] - d[1] * t0;
          for (var s = Math.floor(lo / P) * P; s < hi; s += P) {
            var u0 = Math.max(lo, s), u1 = Math.min(hi, s + on);
            if (u1 - u0 > 1e-9) out.push([bx + d[0] * u0, by + d[1] * u0, bx + d[0] * u1, by + d[1] * u1]);
          }
        });
      });
    });
    return out;
  }

  // ------------------------------------------------------------------ detail views: the parent clipped to a circle
  // the part of segment l inside the circle (C, R), or null
  function clipSeg(l, C, R) {
    var dx = l[2] - l[0], dy = l[3] - l[1], fx = l[0] - C[0], fy = l[1] - C[1];
    var A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), Cc = fx * fx + fy * fy - R * R;
    if (A < 1e-24) return null;
    var disc = B * B - 4 * A * Cc;
    if (disc <= 0) return null;
    var sq = Math.sqrt(disc), t0 = Math.max(0, (-B - sq) / (2 * A)), t1 = Math.min(1, (-B + sq) / (2 * A));
    if (t1 - t0 < 1e-12) return null;
    return [l[0] + dx * t0, l[1] + dy * t0, l[0] + dx * t1, l[1] + dy * t1, l[4] || 0];
  }
  // a circle (c, r) against the clip circle (C, R): 'full', null, or the arc inside { a0, a1 } (degrees, CCW)
  function clipCircle(c, r, C, R) {
    var dd = Math.hypot(C[0] - c[0], C[1] - c[1]);
    if (dd + r <= R) return 'full';
    if (dd >= r + R || dd + R <= r) return null;
    var phi = Math.atan2(C[1] - c[1], C[0] - c[0]), al = Math.acos(Math.max(-1, Math.min(1, (r * r + dd * dd - R * R) / (2 * r * dd))));
    return { a0: (phi - al) * 180 / Math.PI, a1: (phi + al) * 180 / Math.PI };
  }
  // clipProjection(proj, C, R): a projection result limited to the disc (C, R); circles cut by the edge become arcs
  function clipProjection(pr, C, R) {
    var out = { orient: pr.orient, u: pr.u, v: pr.v, e: pr.e, lines: { visible: [], hidden: [] }, circles: { visible: [], hidden: [] }, arcs: { visible: [], hidden: [] }, ellipses: { visible: [], hidden: [] }, all: [], circlesAll: [], arcsAll: [],
      bounds: { umin: C[0] - R, umax: C[0] + R, vmin: C[1] - R, vmax: C[1] + R } };
    ['visible', 'hidden'].forEach(function (k) {
      pr.lines[k].forEach(function (l) { var q = clipSeg(l, C, R); if (q) out.lines[k].push(q); });
      pr.circles[k].forEach(function (c) {
        var q = clipCircle(c.c, c.r, C, R);
        if (q === 'full') out.circles[k].push(c); else if (q) out.arcs[k].push({ c: c.c, r: c.r, a0: q.a0, a1: q.a1, body: c.body || 0 });
      });
      // true arcs (exact projections): the part of the arc inside the clip circle
      (pr.arcs ? pr.arcs[k] : []).forEach(function (a) { clipArc(a, C, R).forEach(function (x) { out.arcs[k].push(x); }); });
      // ellipses (oblique true circles): as fine chords, clipped like lines
      (pr.ellipses ? pr.ellipses[k] : []).forEach(function (el) {
        var n = Math.max(8, Math.ceil((el.t1 - el.t0) / TWO_PI * 144)), prev = null;
        for (var i = 0; i <= n; i++) {
          var t = el.t0 + (el.t1 - el.t0) * i / n, p = [el.c[0] + el.ax[0] * Math.cos(t) + el.ay[0] * Math.sin(t), el.c[1] + el.ax[1] * Math.cos(t) + el.ay[1] * Math.sin(t)];
          if (prev) { var q2 = clipSeg([prev[0], prev[1], p[0], p[1], el.body || 0], C, R); if (q2) out.lines[k].push(q2); }
          prev = p;
        }
      });
    });
    out.lines.tangent = []; out.circles.tangent = []; out.arcs.tangent = [];
    (pr.lines.tangent || []).forEach(function (l) { var q = clipSeg(l, C, R); if (q) out.lines.tangent.push(q); });
    (pr.circles.tangent || []).forEach(function (c) {
      var q = clipCircle(c.c, c.r, C, R);
      if (q === 'full') out.circles.tangent.push(c); else if (q) out.arcs.tangent.push({ c: c.c, r: c.r, a0: q.a0, a1: q.a1, body: c.body || 0 });
    });
    (pr.arcs && pr.arcs.tangent || []).forEach(function (a) { clipArc(a, C, R).forEach(function (x) { out.arcs.tangent.push(x); }); });
    (pr.arcsAll || []).forEach(function (a) { if (Math.hypot(a.c[0] - C[0], a.c[1] - C[1]) + a.r <= R) out.arcsAll.push(a); });
    (pr.all || []).forEach(function (l) { var q = clipSeg(l, C, R); if (q) out.all.push(q); });
    (pr.circlesAll || []).forEach(function (c) { if (clipCircle(c.c, c.r, C, R) === 'full') out.circlesAll.push(c); });
    out.stats = { visibleLines: out.lines.visible.length, hiddenLines: out.lines.hidden.length, visibleCircles: out.circles.visible.length, hiddenCircles: out.circles.hidden.length,
      visibleArcs: out.arcs.visible.length, hiddenArcs: out.arcs.hidden.length };
    return out;
  }
  // an arc { c, r, a0, a1 (degrees, CCW) } inside the clip circle (C, R) -> [arc…]
  function clipArc(a, C, R) {
    var q = clipCircle(a.c, a.r, C, R);
    if (q === 'full') return [a];
    if (!q) return [];
    var out = [], w0 = q.a0, w1 = q.a1;
    for (var j = -2; j <= 2; j++) {
      var lo = Math.max(a.a0, w0 + 360 * j), hi = Math.min(a.a1, w1 + 360 * j);
      if (hi - lo > 1e-9) out.push(Object.assign({}, a, { a0: lo, a1: hi }));
    }
    return out;
  }

  // ------------------------------------------------------------------ dimensions that follow the part
  // A Smart Dimension placed by the user stores view geometry (model units in the view frame). Every render reattaches
  // it to the edge or circle of the current projection that is geometrically the same one: unchanged; else the best
  // of the collinear edges that overlap it (an edge that grew or shrank) and the parallel ones within a quarter of the
  // view that overlap it by at least half of their union (a face that moved), scored by overlap / union and offset,
  // so a moved full-length edge beats a short collinear leftover; circles by centre (a hole whose size changed), then
  // by radius near the old centre (a hole that moved). The dimension then takes the new geometry and value. With no match it is
  // flagged `dangling` and keeps its last geometry (drawn in the dangling colour), so undoing the change reattaches it.
  function reattachDim(d, pr) {
    var b = pr.bounds, size = Math.max(1e-9, Math.hypot(b.umax - b.umin, b.vmax - b.vmin)), tol = size * 1e-6, reach = size * 0.25;
    var best = null, bs = Infinity;
    if (d.kind === 'dia') {
      (pr.circlesAll || []).forEach(function (c) {
        var dc = Math.hypot(c.c[0] - d.c[0], c.c[1] - d.c[1]), dr = Math.abs(c.r - d.r);
        var s = dc <= tol ? (dr <= tol ? 0 : 1 + Math.min(dr / size, 0.9)) : (dr <= tol && dc <= reach ? 2 + dc / reach : Infinity);
        if (s < bs) { bs = s; best = c; }
      });
      if (!best) { d.dangling = true; return false; }
      d.c = best.c.slice(); d.r = best.r; d.value = 2 * best.r; delete d.dangling;
      return true;
    }
    if (d.kind === 'rad') {
      (pr.arcsAll || []).forEach(function (c) {
        var dc = Math.hypot(c.c[0] - d.c[0], c.c[1] - d.c[1]), dr = Math.abs(c.r - d.r);
        var s = dc <= tol ? (dr <= tol ? 0 : 1 + Math.min(dr / size, 0.9)) : (dr <= tol && dc <= reach ? 2 + dc / reach : Infinity);
        if (s < bs) { bs = s; best = c; }
      });
      if (!best) { d.dangling = true; return false; }
      d.c = best.c.slice(); d.r = best.r; d.a0 = best.a0; d.a1 = best.a1; d.value = best.r; delete d.dangling;
      return true;
    }
    var a = d.a, bb = d.b, L = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
    if (L < 1e-12) { d.dangling = true; return false; }
    var t = [(bb[0] - a[0]) / L, (bb[1] - a[1]) / L], hit = null;
    // an edge on the view's outline (its left / right / bottom / top extreme) keeps that role: a part that grows moves
    // it past nearer parallel edges (a hole silhouette must not take the place of the moved side)
    function bound(m) {
      if (Math.abs(m[0] - m[2]) <= tol) return Math.abs(m[0] - b.umin) <= tol ? 'umin' : Math.abs(m[0] - b.umax) <= tol ? 'umax' : null;
      if (Math.abs(m[1] - m[3]) <= tol) return Math.abs(m[1] - b.vmin) <= tol ? 'vmin' : Math.abs(m[1] - b.vmax) <= tol ? 'vmax' : null;
      return null;
    }
    (pr.all || []).forEach(function (m) {
      var mx = m[2] - m[0], my = m[3] - m[1], ml = Math.hypot(mx, my);
      if (ml < 1e-12 || Math.abs(t[0] * my - t[1] * mx) > ml * 1e-6) return;          // not parallel
      var p0 = (m[0] - a[0]) * t[0] + (m[1] - a[1]) * t[1], p1 = (m[2] - a[0]) * t[0] + (m[3] - a[1]) * t[1];
      var lo = Math.min(p0, p1), hi = Math.max(p0, p1), off = Math.abs(t[0] * (m[1] - a[1]) - t[1] * (m[0] - a[0]));
      // score: 1 - overlap / union along the line, plus the offset in quarter-view sizes, less a little for a kept end
      var ov = Math.min(hi, L) - Math.max(lo, 0), jac = ov / (Math.max(hi, L) - Math.min(lo, 0)), s = Infinity;
      var sc = (1 - jac) + off / reach - (Math.abs(lo) <= tol || Math.abs(hi - L) <= tol ? 0.1 : 0) - (d.bound && bound(m) === d.bound ? 0.5 : 0);
      if (off <= tol && Math.abs(lo) <= tol && Math.abs(hi - L) <= tol) s = -1;
      else if (off <= tol && ov > tol) s = sc;                      // collinear: any overlap
      else if (off <= reach && jac >= 0.5) s = sc;                  // parallel: most of it
      if (s < bs) { bs = s; hit = { m: m, lo: lo, hi: hi, forward: p1 >= p0 }; }
    });
    if (!hit) { d.dangling = true; return false; }
    var m0 = [hit.m[0], hit.m[1]], m1 = [hit.m[2], hit.m[3]], bd = bound(hit.m);
    d.a = hit.forward ? m0 : m1; d.b = hit.forward ? m1 : m0;
    if (bd) d.bound = bd; else delete d.bound;
    d.value = d.kind === 'h' ? Math.abs(d.b[0] - d.a[0]) : d.kind === 'v' ? Math.abs(d.b[1] - d.a[1]) : hit.hi - hit.lo;
    delete d.dangling;
    return true;
  }

  // ------------------------------------------------------------------ sheets, scales, the drawing document
  var MM = 25.4;
  // [width, height] in mm, landscape
  var FORMATS = {
    'A4': [297, 210], 'A3': [420, 297], 'A2': [594, 420], 'A1': [841, 594],
    'ANSI A': [11 * MM, 8.5 * MM], 'ANSI B': [17 * MM, 11 * MM], 'ANSI C': [22 * MM, 17 * MM], 'ANSI D': [34 * MM, 22 * MM]
  };
  var SCALES = [[10, 1], [5, 1], [4, 1], [2, 1], [1, 1], [1, 2], [1, 4], [1, 5], [1, 10], [1, 20], [1, 25], [1, 50], [1, 100], [1, 200]];
  function scaleValue(s) { return s[0] / s[1]; }
  function scaleText(s) { return s[0] + ':' + s[1]; }
  // The scale as SolidWorks writes it under a view label: 'SCALE 2 : 1' (spaces round the colon).
  function scaleLabel(s) { return 'SCALE ' + s[0] + ' : ' + s[1]; }
  function parseScale(txt) {
    var m = /^\s*(\d+(?:\.\d+)?)\s*[:\/]\s*(\d+(?:\.\d+)?)\s*$/.exec(String(txt));
    return m && +m[1] > 0 && +m[2] > 0 ? [+m[1], +m[2]] : null;
  }
  function paperK(units) { return units === 'in' ? 1 / MM : 1; }   // paper mm -> paper units
  function sheetSize(doc, units) {
    var f = FORMATS[doc.sheet.format] || FORMATS.A3, k = paperK(units);
    return [f[0] * k, f[1] * k];
  }
  function todayISO() {
    var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  // newDrawing(model, opts) -> a drawing document { name, sheet, views, date, autoDims, nextView } (no views yet)
  function newDrawing(model, opts) {
    opts = opts || {};
    var n = (model.drawings || []).length + 1, asm = model.type === 'assembly';
    return {
      bom: asm ? { show: opts.bom !== false, anchor: opts.bomAnchor || 'top-right' } : null, bomRows: asm ? bomRows(model).length : 0,
      name: opts.name || 'Draw' + n,
      sheet: { name: 'Sheet1', format: opts.format || (model.units === 'in' ? 'ANSI B' : 'A3'), scale: opts.scale || [1, 1], autoScale: !opts.scale, projection: opts.projection || 'third' },
      units: model.units === 'in' ? 'in' : 'mm', views: [], date: opts.date || todayISO(), autoDims: asm ? opts.autoDims === true : opts.autoDims !== false, suppressed: [], nextView: 1, layout: 'auto',
      options: opts.options ? JSON.parse(JSON.stringify(opts.options)) : {}
    };
  }
  function addView(doc, orient, props) {
    var v = { id: doc.nextView++, name: 'Drawing View' + (doc.nextView - 1), orient: orient, x: 0, y: 0, display: ORTHO[orient] ? 'hlv' : 'hlr', scale: null, parent: null, align: null, role: null, dims: [] };
    Object.keys(props || {}).forEach(function (k) { v[k] = props[k]; });
    doc.views.push(v);
    return v;
  }
  function viewScale(doc, view) { return scaleValue(view.scale || doc.sheet.scale || [1, 1]); }
  // Views are recomputed on every render; the projection of a mesh in one orientation is cached on the mesh
  // (meshes are immutable once built, so the cache dies with it).
  function cachedProjection(mesh, orient, display, tangent) {
    var F = frameOf(orient), c = mesh._drawingProj || (mesh._drawingProj = {}), key = frameKey(F) + '|' + display + (tangent ? '|' + tangent : '');
    return c[key] || (c[key] = projectView(mesh, F, { display: display, tangent: tangent }));
  }
  // viewFrame(doc, v): the frame a view looks along. Section views derive theirs from the parent and the cutting
  // line, detail views use the parent's, projected views keep the frame they were made with.
  function viewFrame(doc, v, depth) {
    var par = v.parent != null ? findView(doc, v.parent) : null;
    if ((depth || 0) < 20 && par && (v.kind === 'section' || v.kind === 'detail')) {
      var P = viewFrame(doc, par, (depth || 0) + 1);
      return v.kind === 'section' ? sectionFrame(P, v.section.axis, v.section.sign) : P;
    }
    return v.frame ? frameOf({ e: v.frame.e, u: v.frame.u, v: v.frame.v, name: v.orient }) : orientation(v.orient);
  }
  // A–Z without I, O and Q (ASME Y14.3), the first letter no section or detail view of the drawing uses yet
  function nextLabel(doc) {
    var used = {};
    doc.views.forEach(function (v) { if (v.label) used[v.label] = 1; });
    var abc = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    for (var i = 0; i < abc.length; i++) if (!used[abc[i]]) return abc[i];
    for (var n = 2; ; n++) for (var j = 0; j < abc.length; j++) if (!used[abc[j] + n]) return abc[j] + n;
  }
  function viewExtents(doc, mesh, v) { return extentsOf(mesh, viewFrame(doc, v)); }
  // addProjectedView(doc, mesh, parentId, dir, { x, y, fit }): a view projected up / down / left / right from a parent,
  // aligned with it (same scale; dragging it slides along the projection direction only, the parent drags it along).
  // Without x / y it is placed one gap beyond the parent.
  function addProjectedView(doc, mesh, parentId, dir, opts) {
    opts = opts || {};
    var par = findView(doc, parentId);
    if (!par) throw new Error('No drawing view ' + parentId);
    if (par.kind === 'detail') throw new Error('A view cannot be projected from a detail view');
    var F = projectedFrame(viewFrame(doc, par), dir, doc.sheet.projection), vert = !DIRS[dir][0];
    var pos = besidePos(doc, mesh, par, F, dir);
    var v = addView(doc, F.name, { kind: 'projected', frame: { e: F.e, u: F.u, v: F.v }, parent: par.id, align: vert ? 'x' : 'y', dir: dir,
      scale: par.scale ? par.scale.slice() : null, display: isOrthoFrame(F) ? 'hlv' : 'hlr', x: pos[0], y: pos[1] });
    if (opts.x != null && !vert) v.x = opts.x;
    if (opts.y != null && vert) v.y = opts.y;
    if ((vert ? opts.y : opts.x) == null && mesh) (opts.fit ? fitOnSheet : clearSpot)(doc, mesh, v, vert ? 'y' : 'x');
    doc.layout = 'manual';
    return v;
  }
  // where a view in frame F goes when it is placed `dir` of its parent: the parent's centre line, one gap out
  function besidePos(doc, mesh, par, F, dir) {
    var s = viewScale(doc, par), g = GAP * paperK(doc.units), pe = viewExtents(doc, mesh, par), ce = extentsOf(mesh, F), d = DIRS[dir];
    if (!d[0]) return [par.x, par.y + d[1] * ((pe.h + ce.h) * s / 2 + g)];
    return [par.x + d[0] * ((pe.w + ce.w) * s / 2 + g), par.y];
  }
  // The paper a view takes (an estimate from its frame's extents, scale and label; enough to keep views apart):
  // { x0, y0, x1, y1 } in paper units
  function viewPaperBox(doc, mesh, v) {
    var k = paperK(doc.units), s = viewScale(doc, v), hw, hh, lab = 0;
    if (v.kind === 'detail' && v.detail) { hw = hh = v.detail.r * s; lab = 14 * k; }
    else { var ex = viewExtents(doc, mesh, v); hw = ex.w * s / 2; hh = ex.h * s / 2; if (v.kind === 'section' || v.scale) lab = 14 * k; }
    return { x0: v.x - hw, x1: v.x + hw, y0: v.y - hh - lab, y1: v.y + hh };
  }
  // clearSpot(doc, mesh, v, free): moves a view just made by a script (no position given) to the nearest place on the
  // sheet where it covers no other view, the title block or the Bill of Materials, keeping a gap round it: an aligned
  // view slides along its alignment (outward first, then to the parent's other side), a detail view goes to the
  // nearest clear spot in any direction. When nothing on the sheet is clear it goes beyond the farthest view on its
  // side (r3/drawings3: section views added through the API used to land on the Right view).
  // Returns true when the spot is on the sheet (false: nothing on the sheet was clear, it went beside it).
  function clearSpot(doc, mesh, v, free) {
    var k = paperK(doc.units), S = sheetSize(doc, doc.units), g = GAP * k, sep = g * 0.6, b1 = BORDER * k;
    var obs = doc.views.filter(function (o) { return o !== v; }).map(function (o) { return viewPaperBox(doc, mesh, o); });
    obs.push({ x0: S[0] - b1 - TB_W * k, y0: b1, x1: S[0] - b1, y1: b1 + TB_H * k });
    if (doc.bom && doc.bom.show !== false && doc.bomRows) { var bb = bomBox(doc, doc.units, doc.bomRows); obs.push({ x0: bb.x0, y0: bb.y0, x1: bb.x1, y1: bb.y1 }); }
    var me = viewPaperBox(doc, mesh, v), ox = v.x, oy = v.y;
    function boxAt(x, y) { return { x0: me.x0 + x - ox, x1: me.x1 + x - ox, y0: me.y0 + y - oy, y1: me.y1 + y - oy }; }
    function clear(b) { return obs.every(function (o) { return b.x1 + sep <= o.x0 || o.x1 + sep <= b.x0 || b.y1 + sep <= o.y0 || o.y1 + sep <= b.y0; }); }
    function onSheet(b) { return b.x0 >= b1 + g / 4 && b.y0 >= b1 + g / 4 && b.x1 <= S[0] - b1 - g / 4 && b.y1 <= S[1] - b1 - g / 4; }
    if (clear(boxAt(ox, oy)) && onSheet(boxAt(ox, oy))) return true;
    var step = 2 * k, cands = [], par = v.parent != null ? findView(doc, v.parent) : null;
    if (free === 'x' || free === 'y') {
      var c0 = free === 'x' ? ox : oy, pc = par ? (free === 'x' ? par.x : par.y) : c0, dir = c0 >= pc ? 1 : -1, span = Math.max(S[0], S[1]) * 2;
      for (var t = 0; t <= span; t += step) cands.push(c0 + dir * t);
      var c1 = 2 * pc - c0;   // the parent's other side
      for (var t2 = 0; t2 <= span; t2 += step) cands.push(c1 - dir * t2);
      var pick = null, far = null;
      cands.forEach(function (c) {
        if (pick != null) return;
        var b = free === 'x' ? boxAt(c, oy) : boxAt(ox, c);
        if (!clear(b)) return;
        if (onSheet(b)) pick = c; else if (far == null && (c - pc) * dir > 0) far = c;
      });
      var cc = pick != null ? pick : far != null ? far : c0;
      if (free === 'x') v.x = cc; else v.y = cc;
      return pick != null;
    }
    // on the sheet if it fits anywhere, else the nearest clear spot beside it
    var best = null, bd = Infinity, pass, st2 = step * 2;
    for (pass = 0; pass < 2 && !best; pass++) {
      var lo = pass ? -S[0] / 2 : b1, hx = pass ? S[0] * 1.5 : S[0] - b1, hy = pass ? S[1] * 1.5 : S[1] - b1, ly = pass ? -S[1] / 2 : b1;
      for (var y = ly; y <= hy; y += st2) for (var x = lo; x <= hx; x += st2) {
        var bx = boxAt(x, y), d = Math.hypot(x - ox, y - oy);
        if (d < bd && (pass || onSheet(bx)) && clear(bx)) { bd = d; best = [x, y]; }
      }
    }
    if (best) { v.x = best[0]; v.y = best[1]; }
    return !!best && pass === 1;   // true: clear and on the sheet
  }
  // fitOnSheet(doc, mesh, v, free): where a section / projected / detail view added by the app's script API (opts.fit)
  // goes on a full sheet (r7/drawings7: projected and detail views too; a detail view has no alignment and never
  // shrinks to its parent's scale or below). Along its alignment at its own scale first; then the nearest free area of the sheet (alignment broken,
  // same scale); then the next smaller standard scales (down to a quarter), aligned and then anywhere. When nothing
  // fits it goes beside the sheet, aligned and clear of every view, marked v.offSheet (the UI warns and drops the
  // mark). It never overlaps a view.
  function fitOnSheet(doc, mesh, v, free) {
    var x0 = v.x, y0 = v.y, sc0 = v.scale, al0 = v.align, s0 = viewScale(doc, v);
    var par = v.kind === 'detail' && v.parent != null ? findView(doc, v.parent) : null, lo = par ? viewScale(doc, par) : 0;
    var smaller = SCALES.filter(function (s) { var q = scaleValue(s); return q < s0 - 1e-9 && q >= s0 / 4 - 1e-9 && q > lo + 1e-9; });
    function at(sc, align) { v.x = x0; v.y = y0; v.scale = sc; v.align = align; return clearSpot(doc, mesh, v, align ? free : null); }
    var tries = al0 ? [[sc0, al0], [sc0, null]] : [[sc0, null]];
    smaller.forEach(function (s) { if (al0) tries.push([s.slice(), al0]); tries.push([s.slice(), null]); });
    for (var i = 0; i < tries.length; i++) if (at(tries[i][0], tries[i][1])) return true;
    at(sc0, al0);
    v.offSheet = true;
    return false;
  }
  // addSectionView(doc, mesh, parentId, { axis: 'h' | 'v', at, sign, x, y, label, fit }): a full section on a cutting
  // line through the parent, horizontal at v = at or vertical at u = at (model units in the parent's view frame).
  // The viewer stands on the side sign points to (sign × the parent's v or u) and looks at the cut, so the arrows
  // point the other way. The view is aligned with the parent, placed on the viewer's side in third-angle projection
  // and on the arrows' side in first angle; cut faces are hatched ANSI31 and the view is labelled SECTION A-A.
  function addSectionView(doc, mesh, parentId, opts) {
    opts = opts || {};
    var par = findView(doc, parentId);
    if (!par) throw new Error('No drawing view ' + parentId);
    if (par.kind === 'detail') throw new Error('A section cannot be cut in a detail view');
    var axis = opts.axis === 'v' ? 'v' : 'h', sign = opts.sign < 0 ? -1 : 1, label = opts.label || nextLabel(doc);
    var F = sectionFrame(viewFrame(doc, par), axis, sign);
    var place = (axis === 'h' ? (sign > 0 ? 'up' : 'down') : (sign > 0 ? 'right' : 'left'));
    if (doc.sheet.projection === 'first') place = { up: 'down', down: 'up', left: 'right', right: 'left' }[place];
    var pos = besidePos(doc, mesh, par, F, place);
    var v = addView(doc, F.name, { kind: 'section', name: 'Section View ' + label + '-' + label, label: label, parent: par.id, align: axis === 'h' ? 'x' : 'y',
      section: { axis: axis, at: +opts.at || 0, sign: sign }, scale: par.scale ? par.scale.slice() : null, display: 'hlr', x: pos[0], y: pos[1] });
    if (opts.x != null && axis === 'v') v.x = opts.x;
    if (opts.y != null && axis === 'h') v.y = opts.y;
    if ((axis === 'h' ? opts.y : opts.x) == null && mesh) (opts.fit ? fitOnSheet : clearSpot)(doc, mesh, v, axis === 'h' ? 'y' : 'x');
    doc.layout = 'manual';
    return v;
  }
  // detail scale: twice the parent's, as a standard scale when there is one
  function detailScale(ps) {
    var want = 2 * scaleValue(ps);
    for (var i = 0; i < SCALES.length; i++) if (Math.abs(scaleValue(SCALES[i]) - want) < 1e-9) return SCALES[i].slice();
    return want >= 1 ? [Math.round(want * 1000) / 1000, 1] : [1, Math.round(1000 / want) / 1000];
  }
  // addDetailView(doc, mesh, parentId, { c: [u, v], r, scale, x, y, label, fit }): the parent inside the circle (c, r)
  // (model units in the parent's frame), enlarged to its own scale (default twice the parent's) and labelled
  // DETAIL B / SCALE 4 : 1; the circle and the letter are drawn on the parent. Not aligned: it goes anywhere.
  function addDetailView(doc, mesh, parentId, opts) {
    opts = opts || {};
    var par = findView(doc, parentId);
    if (!par) throw new Error('No drawing view ' + parentId);
    if (par.kind === 'detail') throw new Error('Detail views of detail views are not supported');
    if (!(opts.r > 0)) throw new Error('A detail circle needs a radius');
    var label = opts.label || nextLabel(doc), sc = opts.scale ? (Array.isArray(opts.scale) ? opts.scale : parseScale(opts.scale)) : detailScale(par.scale || doc.sheet.scale || [1, 1]);
    var s = scaleValue(sc), g = GAP * paperK(doc.units), pe = viewExtents(doc, mesh, par), ps = viewScale(doc, par);
    var v = addView(doc, par.orient, { kind: 'detail', name: 'Detail View ' + label + ' (' + scaleText(sc) + ')', label: label, parent: par.id, align: null,
      detail: { c: [+opts.c[0], +opts.c[1]], r: +opts.r }, scale: sc, display: par.display,
      x: opts.x != null ? opts.x : par.x + pe.w * ps / 2 + g + opts.r * s, y: opts.y != null ? opts.y : par.y });
    if (opts.x == null && opts.y == null && mesh) (opts.fit ? fitOnSheet : clearSpot)(doc, mesh, v, null);
    if (v.scale !== sc) v.name = 'Detail View ' + label + ' (' + scaleText(v.scale) + ')';
    doc.layout = 'manual';
    return v;
  }
  // Title block and border sizes in paper mm (converted by paperK for inch sheets); HATCH is the ANSI31 line spacing
  var BORDER = 10, TB_W = 180, TB_H = 40, GAP = 22, HATCH = 2.5;
  // Title block (180 × 40 mm, three rows): each field is a text with links, SolidWorks style — $PRPSHEET:"name" is the
  // custom property of the model shown on the sheet (Materials.sheetProperty: File ▸ Properties, Configuration
  // Specific first; Material and Mass fall back to the part's material and mass), $PRP:"name" the drawing's own
  // (SW-File Name, SW-Sheet Name, SW-Sheet Scale, SW-Units, SW-Date, SW-Projection, SW-Sheet, or doc.properties[name]).
  // doc.titleBlock = { key: text } overrides a field; `fallback` fills an empty TITLE / PART NO. with the model name.
  var TB_FIELDS = [
    { key: 'title', label: 'TITLE', row: 0, x0: 0, x1: 105, big: true, upper: true, link: '$PRPSHEET:"Description"', fallback: true },
    { key: 'partNo', label: 'PART NO.', row: 0, x0: 105, x1: 150, link: '$PRPSHEET:"Part Number"', fallback: true },
    { key: 'rev', label: 'REV', row: 0, x0: 150, x1: 180, link: '$PRPSHEET:"Revision"' },
    { key: 'dwgNo', label: 'DWG. NO.', row: 1, x0: 0, x1: 45, link: '$PRP:"SW-File Name"' },
    { key: 'material', label: 'MATERIAL', row: 1, x0: 45, x1: 105, link: '$PRPSHEET:"Material"' },
    { key: 'scale', label: 'SCALE', row: 1, x0: 105, x1: 140, link: '$PRP:"SW-Sheet Scale"' },
    { key: 'units', label: 'UNITS', row: 1, x0: 140, x1: 180, link: '$PRP:"SW-Units"' },
    { key: 'date', label: 'DATE', row: 2, x0: 0, x1: 45, link: '$PRP:"SW-Date"' },
    { key: 'mass', label: 'MASS', row: 2, x0: 45, x1: 105, link: '$PRPSHEET:"Mass"' },
    { key: 'projection', label: 'PROJECTION', row: 2, x0: 105, x1: 140, link: '$PRP:"SW-Projection"' },
    { key: 'sheet', label: 'SHEET', row: 2, x0: 140, x1: 180, link: '$PRP:"SW-Sheet"' }
  ];
  function drawingProp(doc, name, units) {
    switch (String(name).trim().toLowerCase()) {
      case 'sw-file name': return doc.name;
      case 'sw-sheet name': return doc.sheet.name;
      case 'sw-sheet scale': return scaleText(doc.sheet.scale || [1, 1]);
      case 'sw-units': return String(units).toUpperCase();
      case 'sw-date': return doc.date;
      case 'sw-projection': return doc.sheet.projection === 'first' ? 'FIRST ANGLE' : 'THIRD ANGLE';
      case 'sw-sheet': return '1 OF 1';
    }
    var own = doc.properties || {};
    for (var k in own) if (k.toLowerCase() === String(name).trim().toLowerCase()) return String(own[k]);
    return '';
  }
  // titleText(text, doc, model, ctx?) -> the text with its $PRPSHEET / $PRP links replaced
  function titleText(t, doc, model, ctx) {
    ctx = ctx || {};
    var units = model && model.units === 'in' ? 'in' : 'mm', mctx = null;
    return String(t == null ? '' : t).replace(/\$PRPSHEET:\s*"([^"]*)"|\$PRP:\s*"([^"]*)"/g, function (all, sheetName, prpName) {
      if (sheetName != null) {
        if (typeof Materials === 'undefined' || !model) return '';
        mctx = mctx || ctx.props || Materials.context(model, { build: ctx.build, mesh: ctx.mesh });
        try { return Materials.sheetProperty(model, sheetName, mctx); } catch (e) { return ''; }
      }
      return drawingProp(doc, prpName, units);
    });
  }
  // titleFieldAt(sheetSize, units, p) -> { field (a TB_FIELDS entry), rect: { x0, y0, x1, y1 } } of the title block cell
  // under the paper point p, or null (r5/drawings5)
  function titleFieldAt(S, units, p) {
    var k = paperK(units), b1 = BORDER * k, tw = TB_W * k, th = TB_H * k, tx0 = S[0] - b1 - tw, ty0 = b1, row = th / 3, hit = null;
    TB_FIELDS.forEach(function (f) {
      var r = { x0: tx0 + f.x0 * k, x1: tx0 + f.x1 * k, y1: ty0 + th - f.row * row, y0: ty0 + th - (f.row + 1) * row };
      if (!hit && p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1) hit = { field: f, rect: r };
    });
    return hit;
  }
  // titleBlock(doc, model, ctx?) -> { key: evaluated text } for every TB_FIELDS entry
  function titleBlock(doc, model, ctx) {
    ctx = ctx || {};
    var out = {}, own = doc.titleBlock || {};
    if (typeof Materials !== 'undefined' && model && !ctx.props) {
      var asm = model.type === 'assembly', b = ctx.build && !!ctx.build.assembly === asm ? ctx.build : null;
      ctx = { build: b, mesh: ctx.mesh, props: Materials.context(model, { build: b, mesh: asm ? null : ctx.mesh }) };
      // the Mass field's mass properties are worked out once per build and material (r3/drawings3: every redraw of the
      // sheet used to rebuild the body mesh and integrate it again, 3-4 ms of each drag frame)
      var src = b || ctx.mesh;
      if (src && typeof src === 'object') {
        var mk = JSON.stringify([model.units, model.density, model.material, model.materialName, model.bodyMaterials, model.type]);
        var memo = src._drawingMass, base = ctx.props.mass;
        ctx.props.mass = function () {
          if (memo && memo.key === mk) return memo.mp;
          var mp = base();
          try { Object.defineProperty(src, '_drawingMass', { value: { key: mk, mp: mp }, configurable: true, writable: true, enumerable: false }); } catch (e) { }
          memo = src._drawingMass;
          return mp;
        };
      }
    }
    TB_FIELDS.forEach(function (f) {
      var v = titleText(own[f.key] != null ? own[f.key] : f.link, doc, model, ctx).trim();
      if (!v && f.fallback) v = String(model && model.name || 'Part');
      out[f.key] = f.upper ? v.toUpperCase() : v;
    });
    return out;
  }
  // viewContent(doc, v, mesh, parentContent) -> { frame, proj, center: [u, v] (the model point at the view's x, y),
  // caps (section faces to hatch), clip (a detail circle), section }. Section and detail views are centred on the
  // whole part's extents in their frame (not on what is left of it), so they stay aligned with their parent.
  function viewContent(doc, v, mesh, parentContent) {
    var par = v.parent != null ? findView(doc, v.parent) : null, s = viewScale(doc, v);
    if (v.kind === 'section' && par && parentContent) {
      var P = parentContent(par).frame, sc = v.section, F = sectionFrame(P, sc.axis, sc.sign);
      var S = sectionOf(mesh, F.e, sc.sign * sc.at), pr = cachedProjection(S.mesh, F, v.display, v.tangent), full = extentsOf(mesh, F);
      if (!S.mesh.faces.length) pr = emptyProjection(F, full);
      return { frame: F, proj: pr, center: [full.cu, full.cv], caps: capLoops(S, F), section: S, scale: s };
    }
    if (v.kind === 'detail' && par && parentContent) {
      var pc = parentContent(par), dt = v.detail;
      return { frame: pc.frame, proj: clipProjection(pc.proj, dt.c, dt.r), center: dt.c.slice(), caps: pc.caps, clip: { c: dt.c.slice(), r: dt.r }, scale: s };
    }
    var F2 = viewFrame(doc, v), pr2 = cachedProjection(mesh, F2, v.display, v.tangent), b = pr2.bounds;
    return { frame: F2, proj: pr2, center: [(b.umin + b.umax) / 2, (b.vmin + b.vmax) / 2], caps: [], scale: s };
  }
  function emptyProjection(F, ext) {
    return { orient: F.name, u: F.u, v: F.v, e: F.e, lines: { visible: [], hidden: [] }, circles: { visible: [], hidden: [] }, arcs: { visible: [], hidden: [] }, ellipses: { visible: [], hidden: [] }, all: [], circlesAll: [], arcsAll: [],
      bounds: { umin: ext.cu, umax: ext.cu, vmin: ext.cv, vmax: ext.cv }, stats: { visibleLines: 0, hiddenLines: 0, visibleCircles: 0, hiddenCircles: 0 } };
  }
  function usableArea(doc, units) {
    var S = sheetSize(doc, units), k = paperK(units);
    return { x0: BORDER * k, x1: S[0] - BORDER * k, y0: (BORDER + TB_H) * k, y1: S[1] - BORDER * k };
  }
  // Standard 3 View (+ Isometric): replaces the doc's views with Front / Top / Right placed third- or first-angle and
  // an isometric in the free corner; picks the largest standard sheet scale that fits when doc.sheet.scale is null.
  function standard3View(doc, mesh, units, opts) {
    opts = opts || {};
    doc.views = []; doc.nextView = 1;
    var front = addView(doc, 'Front', { role: 'front' });
    var top = addView(doc, 'Top', { role: 'top', parent: front.id, align: 'x' });
    var right = addView(doc, 'Right', { role: 'right', parent: front.id, align: 'y' });
    if (opts.iso !== false) addView(doc, 'Isometric', { role: 'iso' });
    doc.layout = 'auto';
    layout(doc, mesh, units);
    // Document Properties ▸ Auto insert on view creation (centre marks, centrelines)
    if (opts.autoInsert !== false) autoInsert(doc, mesh);
    return doc;
  }
  function extentsOf(mesh, orient) {
    var O = frameOf(orient), P = mesh.positions64 || mesh.positions;
    var b = { umin: Infinity, umax: -Infinity, vmin: Infinity, vmax: -Infinity };
    for (var i = 0; i < P.length; i += 3) {
      var p = [P[i], P[i + 1], P[i + 2]], u = V.dot(p, O.u), v = V.dot(p, O.v);
      if (u < b.umin) b.umin = u; if (u > b.umax) b.umax = u; if (v < b.vmin) b.vmin = v; if (v > b.vmax) b.vmax = v;
    }
    if (!P.length) b = { umin: 0, umax: 0, vmin: 0, vmax: 0 };
    b.w = b.umax - b.umin; b.h = b.vmax - b.vmin; b.cu = (b.umin + b.umax) / 2; b.cv = (b.vmin + b.vmax) / 2;
    return b;
  }
  // layout(doc, mesh, units): positions the standard views (roles front / top / right / iso) and, when the sheet
  // scale is automatic, chooses it. A view's (x, y) is where the centre of its projected bounding box sits on the sheet.
  function layout(doc, mesh, units) {
    var k = paperK(units), A = usableArea(doc, units), g = GAP * k;
    var byRole = {}, before = {};
    doc.views.forEach(function (v) { before[v.id] = [v.x, v.y]; });
    doc.views.forEach(function (v) { if (v.role) byRole[v.role] = v; });
    var F = extentsOf(mesh, 'Front'), T = extentsOf(mesh, 'Top'), R = extentsOf(mesh, 'Right');
    var Wm = F.w, Hm = F.h, Dm = T.h;
    var availW = A.x1 - A.x0, availH = A.y1 - A.y0;
    // an assembly drawing's Bill of Materials is a keep-out box: the Front / Top / Right block must not cover it
    var bomK = doc.bom && doc.bom.show !== false && doc.bomRows ? bomBox(doc, units, doc.bomRows) : null;
    function hitsBom(b) { return bomK && b.x1 > bomK.x0 - g / 2 && b.x0 < bomK.x1 + g / 2 && b.y1 > bomK.y0 - g / 2 && b.y0 < bomK.y1 + g / 2; }
    // place(sv, packed): view centres for scale sv, the block centred in the usable area (or packed into the corner
    // away from the BOM); null when a view would cover the BOM
    function place(sv, packed) {
      var W = Wm * sv, H = Hm * sv, D = Dm * sv, blockW = W + g + D, blockH = H + g + D, P = {};
      var left = A.x0 + Math.max(g, (availW - blockW) / 2), bottom = A.y0 + Math.max(g, (availH - blockH) / 2);
      if (packed) {
        left = bomK && /left/.test(bomK.anchor) ? A.x1 - g - blockW : A.x0 + g;
        bottom = bomK && /bottom/.test(bomK.anchor) ? A.y1 - g - blockH : A.y0 + g;
      }
      if (doc.sheet.projection === 'first') {
        // first angle: Top below Front, Right to the left of Front
        P.rx = left + D / 2; P.fx = left + D + g + W / 2; P.tx = P.fx;
        P.ty = bottom + D / 2; P.fy = bottom + D + g + H / 2; P.ry = P.fy;
        P.isoBox = { x0: A.x0, x1: left + D + g / 2, y0: A.y0, y1: bottom + D + g / 2 };
      } else {
        P.fx = left + W / 2; P.tx = P.fx; P.rx = left + W + g + D / 2;
        P.fy = bottom + H / 2; P.ry = P.fy; P.ty = bottom + H + g + D / 2;
        P.isoBox = { x0: left + W + g / 2, x1: A.x1, y0: bottom + H + g / 2, y1: A.y1 };
      }
      var boxes = [[P.fx, P.fy, W, H], [P.tx, P.ty, W, D], [P.rx, P.ry, D, H]].map(function (q) { return { x0: q[0] - q[2] / 2, x1: q[0] + q[2] / 2, y0: q[1] - q[3] / 2, y1: q[1] + q[3] / 2 }; });
      if (boxes.some(hitsBom)) return null;
      return P;
    }
    function fits(sv) { return (Wm + Dm) * sv + 3 * g <= availW && (Hm + Dm) * sv + 3 * g <= availH && (place(sv) || place(sv, true)); }
    if (doc.sheet.autoScale || !doc.sheet.scale) {
      var s = SCALES[SCALES.length - 1];
      for (var i = 0; i < SCALES.length; i++) if (fits(scaleValue(SCALES[i]))) { s = SCALES[i]; break; }
      doc.sheet.scale = s;
    }
    var sv2 = scaleValue(doc.sheet.scale);
    var PL = place(sv2) || place(sv2, true) || (function () { var q = bomK; bomK = null; var r = place(sv2); bomK = q; return r; })();
    var fx = PL.fx, fy = PL.fy, tx = PL.tx, ty = PL.ty, rx = PL.rx, ry = PL.ry, isoBox = PL.isoBox;
    if (byRole.front) { byRole.front.x = fx; byRole.front.y = fy; }
    if (byRole.top) { byRole.top.x = tx; byRole.top.y = ty; }
    if (byRole.right) { byRole.right.x = rx; byRole.right.y = ry; }
    if (byRole.iso) {
      // a Bill of Materials in the isometric's corner takes its room (the iso then drops in scale if it must)
      if (bomK) {
        var ov = bomK.x1 > isoBox.x0 && bomK.x0 < isoBox.x1 && bomK.y1 > isoBox.y0 && bomK.y0 < isoBox.y1;
        if (ov) { if (/top/.test(bomK.anchor)) isoBox.y1 = Math.min(isoBox.y1, bomK.y0 - g / 2); else isoBox.y0 = Math.max(isoBox.y0, bomK.y1 + g / 2); }
      }
      var I = extentsOf(mesh, byRole.iso.orient), bw = isoBox.x1 - isoBox.x0 - g / 2, bh = isoBox.y1 - isoBox.y0 - g / 2;
      byRole.iso.scale = null;
      if (I.w * sv2 > bw || I.h * sv2 > bh) {
        for (var j = 0; j < SCALES.length; j++) { var q = scaleValue(SCALES[j]); if (q < sv2 && I.w * q <= bw && I.h * q <= bh) { byRole.iso.scale = SCALES[j]; break; } }
        if (!byRole.iso.scale) byRole.iso.scale = SCALES[SCALES.length - 1];
      }
      byRole.iso.x = (isoBox.x0 + isoBox.x1) / 2; byRole.iso.y = (isoBox.y0 + isoBox.y1) / 2;
    }
    void R;
    // projected and section views of the standard views move with their parent and stay aligned with it
    function follow(p, depth) {
      doc.views.forEach(function (c) {
        if (c.parent !== p.id || !c.align || c.role || depth > 20) return;
        c.x += p.x - before[p.id][0]; c.y += p.y - before[p.id][1];
        if (c.align === 'x') c.x = p.x; else c.y = p.y;
        follow(c, depth + 1);
      });
    }
    doc.views.forEach(function (v) { if (v.role) follow(v, 0); });
    return doc;
  }
  // moveView(doc, id, x, y): a parent view drags its projected children along; a projected view slides along its
  // alignment only (Top stays above Front, Right stays level with it).
  function moveView(doc, id, x, y) {
    var v = findView(doc, id);
    if (!v) return;
    if (v.parent != null && findView(doc, v.parent)) { if (v.align === 'x') x = v.x; else if (v.align === 'y') y = v.y; }
    var dx = x - v.x, dy = y - v.y;
    v.x = x; v.y = y;
    shiftAligned(doc, v.id, dx, dy, 0);
    doc.layout = 'manual';
  }
  // aligned children (projected and section views) follow their parent, and their own aligned children follow them;
  // detail views stay where they are
  function shiftAligned(doc, id, dx, dy, depth) {
    if (depth > 20) return;
    doc.views.forEach(function (c) { if (c.parent === id && c.align) { c.x += dx; c.y += dy; shiftAligned(doc, c.id, dx, dy, depth + 1); } });
  }
  // deleteView(doc, id): removes a view with the section and detail views cut from it (they cannot exist without
  // it); projected views keep their frame and become ordinary views
  function deleteView(doc, id) {
    var gone = {}; gone[id] = 1;
    for (var changed = true; changed;) {
      changed = false;
      doc.views.forEach(function (v) { if (!gone[v.id] && gone[v.parent] && (v.kind === 'section' || v.kind === 'detail')) { gone[v.id] = 1; changed = true; } });
    }
    doc.views = doc.views.filter(function (v) { return !gone[v.id]; });
    doc.views.forEach(function (v) { if (gone[v.parent]) { v.parent = null; v.align = null; } });
    return Object.keys(gone).length;
  }
  function findView(doc, id) { for (var i = 0; i < doc.views.length; i++) if (doc.views[i].id === id) return doc.views[i]; return null; }

  // ------------------------------------------------------------------ dimensions
  function fmtDim(x, units) {
    var d = units === 'in' ? 3 : 2, p = Math.pow(10, d);
    var s = String(Math.round(x * p) / p);
    return s;
  }
  // autoDims(doc, projections, units) -> [{ view, kind: 'h' | 'v' | 'dia', … model-space geometry, text }]
  // Overall width and height on the Front view (below and to the left), overall depth on the Top view (left side),
  // and every distinct circle diameter once, in the first ortho view that shows it as a visible circle ("4X Ø8").
  function autoDims(doc, projections, units) {
    var dims = [];
    var order = doc.views.filter(function (v) { return ORTHO[v.orient] && (!v.kind || v.kind === 'projected') && projections[v.id]; });
    var roleOrder = { front: 0, top: 1, right: 2 };
    order.sort(function (a, b) { return (roleOrder[a.role] != null ? roleOrder[a.role] : 5) - (roleOrder[b.role] != null ? roleOrder[b.role] : 5) || a.id - b.id; });
    var front = order.filter(function (v) { return v.role === 'front'; })[0] || order[0];
    var top = order.filter(function (v) { return v.role === 'top'; })[0];
    if (front) {
      var b = projections[front.id].bounds;
      dims.push({ view: front.id, kind: 'h', a: [b.umin, b.vmin], b: [b.umax, b.vmin], side: -1, value: b.umax - b.umin, auto: true });
      dims.push({ view: front.id, kind: 'v', a: [b.umin, b.vmin], b: [b.umin, b.vmax], side: -1, value: b.vmax - b.vmin, auto: true });
    }
    if (top) {
      var bt = projections[top.id].bounds;
      dims.push({ view: top.id, kind: 'v', a: [bt.umin, bt.vmin], b: [bt.umin, bt.vmax], side: -1, value: bt.vmax - bt.vmin, auto: true });
    }
    var done = {};
    order.forEach(function (v) {
      var pr = projections[v.id];
      if (!pr) return;
      var groups = {}, gk = [];
      pr.circles.visible.forEach(function (c) {
        var key = fmtDim(2 * c.r, units);
        if (done[key] || c.sil) return;   // a sphere's or torus's outline is no edge to dimension
        if (!groups[key]) { groups[key] = []; gk.push(key); }
        groups[key].push(c);
      });
      gk.forEach(function (key) {
        done[key] = true;
        var list = groups[key];
        // label the circle farthest from the view centre (its leader then points outward), up and right on a tie
        var cu = (pr.bounds.umin + pr.bounds.umax) / 2, cv = (pr.bounds.vmin + pr.bounds.vmax) / 2, tie = 1e-6 * (1 + pr.bounds.umax - pr.bounds.umin);
        var dist = function (c) { return Math.hypot(c.c[0] - cu, c.c[1] - cv); };
        var pick = list.slice().sort(function (p, q) { return (dist(q) - dist(p) > tie ? 1 : dist(p) - dist(q) > tie ? -1 : 0) || (q.c[0] + q.c[1]) - (p.c[0] + p.c[1]); })[0];
        dims.push({ view: v.id, kind: 'dia', c: pick.c, r: pick.r, count: list.length, value: 2 * pick.r, auto: true });
      });
    });
    // true arcs of the model (slot ends, rounded corners, partial revolves; not circles cut by hidden lines): every
    // distinct radius once, in the first ortho view that shows it ("4X R5"), on the arc farthest from the view centre
    var rdone = {};
    order.forEach(function (v) {
      var pr = projections[v.id];
      if (!pr || !pr.arcs) return;
      var groups = {}, gk = [];
      pr.arcs.visible.forEach(function (a) {
        if (a.src !== 'arc') return;
        var key = fmtDim(a.r, units);
        if (rdone[key]) return;
        if (!groups[key]) { groups[key] = []; gk.push(key); }
        if (!groups[key].some(function (b) { return Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1]) < 1e-9 * (1 + Math.abs(a.c[0]) + Math.abs(a.c[1])); })) groups[key].push(a);
      });
      gk.forEach(function (key) {
        rdone[key] = true;
        var list = groups[key], cu = (pr.bounds.umin + pr.bounds.umax) / 2, cv = (pr.bounds.vmin + pr.bounds.vmax) / 2;
        var pick = list.slice().sort(function (p, q) { return Math.hypot(q.c[0] - cu, q.c[1] - cv) - Math.hypot(p.c[0] - cu, p.c[1] - cv) || (q.c[0] + q.c[1]) - (p.c[0] + p.c[1]); })[0];
        dims.push({ view: v.id, kind: 'rad', c: pick.c, r: pick.r, a0: pick.a0, a1: pick.a1, count: list.length, value: pick.r, auto: true });
      });
    });
    dims.forEach(function (d) { d.text = dimText(d, units); });
    return dims;
  }
  function autoDimKey(d) { return d.view + ':' + d.kind + ':' + (d.kind === 'dia' || d.kind === 'rad' ? d.value.toFixed(4) : d.a.concat(d.b).map(function (x) { return x.toFixed(4); }).join(',')); }
  function dimText(d, units) {
    if (d.kind === 'ordinate' || d.kind === 'baseline') {
      var p = d.prec != null && d.prec !== '' ? +d.prec : null;
      return (d.kind === 'ordinate' ? ['0'] : []).concat((d.values || []).map(function (x) { return numText(Math.abs(x), units, p); })).join(', ');
    }
    if (d.prec != null || d.tol || d.label != null || d.kind === 'chamfer') return dimLabel(d, units).text;
    if (d.kind === 'dia') return (d.count > 1 ? d.count + 'X ' : '') + '\u00d8' + fmtDim(d.value, units);
    if (d.kind === 'rad') return (d.count > 1 ? d.count + 'X ' : '') + 'R' + fmtDim(d.value, units);
    return fmtDim(d.value, units);
  }


  // ------------------------------------------------------------------ assemblies: Bill of Materials and balloons
  // A drawing of an assembly draws the solved components (the assembly mesh, one body per component) exactly like a
  // multi-body part. On top of that it carries a Bill of Materials (identical components — same source — on one row,
  // ITEM NO. in insertion order) and balloons that name the BOM item of a component in a view.
  var partInfoCache = {};
  function hasMaterials() { return typeof Materials !== 'undefined'; }
  // partInfo(source, asmBuild?) -> { name, description, model, build() }: the part's name and its description (the
  // part model's own `description`, else the Design Library entry it came from; parts from scripts get their size in
  // bomRows), its model (custom properties, material) and, on demand, its build (mass, bodies)
  function partInfo(source, asmBuild) {
    var key = JSON.stringify(source);
    var info = partInfoCache[key];
    if (!info) {
      info = { name: 'Part', description: '', model: null, _build: null };
      try {
        if (typeof Assembly !== 'undefined') {
          var m = Assembly.partModel(source);
          info.model = m;
          info.name = m.name || 'Part';
          var ex = null;
          if (source && source.example != null && typeof AnvilExamples !== 'undefined') AnvilExamples.forEach(function (e) { if (!ex && e.name === source.example) ex = e; });
          info.description = m.description || (ex ? ex.name : '');
        }
      } catch (err) { info.description = err.message; }
      info.build = function () {
        if (info._build || !info.model) return info._build;
        try { info._build = K.rebuild(JSON.parse(JSON.stringify(info.model))); } catch (e) { info._build = null; }
        return info._build;
      };
      partInfoCache[key] = info;
    }
    // the assembly build already holds every part's build: reuse it instead of building the part again
    var e = asmBuild && asmBuild.cache && asmBuild.cache[key];
    if (e && e.build && !info._build) info._build = e.build;
    return info;
  }
  // BOM columns. A column is { type: 'item' | 'partNumber' | 'description' | 'qty' | 'property', prop (property name,
  // for 'property'), title, width (paper mm), hidden }. doc.bom.columns holds them in order; without it the table has
  // the four SolidWorks default columns. A property column shows the part's custom property of that name, falling
  // back for Material / Mass to the part's material and mass (as a title block does).
  var BOM_COLS = [['ITEM NO.', 18, 'middle'], ['PART NUMBER', 45, 'start'], ['DESCRIPTION', 80, 'start'], ['QTY.', 14, 'middle']], BOM_ROW = 7, BOM_TEXT = 3;
  var BOM_DEFAULT = [{ type: 'item' }, { type: 'partNumber' }, { type: 'description' }, { type: 'qty' }];
  var BOM_TYPE_DEFAULTS = { item: BOM_COLS[0], partNumber: BOM_COLS[1], description: BOM_COLS[2], qty: BOM_COLS[3] };
  var PROP_WIDTH = { material: 40, mass: 26, vendor: 35, revision: 16, rev: 14, finish: 30, cost: 20 };
  var BOM_TYPES = [['top', 'Top-level only'], ['indented', 'Indented'], ['parts', 'Parts only']];
  function bomType(t) { return t === 'parts' || t === 'indented' ? t : 'top'; }
  function bomColumnSpecs(bom) { return (bom && Array.isArray(bom.columns) && bom.columns.length ? bom.columns : BOM_DEFAULT).map(function (c) { return typeof c === 'string' ? { type: 'property', prop: c } : c; }); }
  // bomColumns(bom) -> the visible columns [{ type, prop, title, width, align }]
  function bomColumns(bom) {
    return bomColumnSpecs(bom).filter(function (c) { return !c.hidden; }).map(function (c) {
      var d = BOM_TYPE_DEFAULTS[c.type], prop = d ? null : String(c.prop || '');
      return {
        type: d ? c.type : 'property', prop: prop,
        title: c.title || (d ? d[0] : prop.toUpperCase()),
        width: +c.width > 0 ? +c.width : d ? d[1] : (PROP_WIDTH[prop.toLowerCase()] || 32),
        align: d ? d[2] : 'start'
      };
    });
  }
  function bomCell(row, col) {
    switch (col.type) {
      case 'item': return row.item;
      case 'partNumber': return row.partNumber;
      case 'description': return row.description;
      case 'qty': return row.qty;
    }
    return row.prop ? row.prop(col.prop) : '';
  }
  function bboxText(mesh, units) {
    var P = mesh.positions64 || mesh.positions, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < mesh.triCount * 9; i += 3) for (var k = 0; k < 3; k++) { var x = P[i + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; }
    if (!(lo[0] <= hi[0])) return '';
    return [0, 1, 2].map(function (q) { return fmtDim(hi[q] - lo[q], units); }).join(' x ');
  }
  // the evaluator for one part: prop(name) through Materials (custom / configuration-specific properties, "SW-" links,
  // Material / Mass falling back to the part's own)
  function partProps(model, build, mesh, bodyOverride) {
    if (!hasMaterials() || !model) return function () { return ''; };
    var ctx = Materials.context(model, bodyOverride ? { massProps: bodyOverride.mp, material: bodyOverride.material } : { build: build, mesh: mesh });
    var memo = {};
    return function (name) {
      var k = String(name).toLowerCase();
      if (!(k in memo)) { try { memo[k] = Materials.sheetProperty(model, name, ctx); } catch (e) { memo[k] = ''; } }
      return memo[k];
    };
  }
  function nonEmpty(v) { return v != null && String(v).trim() !== '' ? String(v) : null; }
  // bodyRows(model, build, units) -> one entry per distinct solid body of a multi-body part (same material, size and
  // volume count together, as a weldment cut list does): { key, name, size, material, count, bodies, prop }; null for
  // a single-body part
  function bodyRows(model, build, units) {
    var bodies = build ? (build.bodies || (build.body ? [build.body] : [])) : [];
    if (bodies.length < 2) return null;
    var out = [], byKey = {};
    bodies.forEach(function (b, i) {
      var bm = hasMaterials() ? Materials.bodyMaterial(model, build, i) : { name: null, density: model.density || 7850 };
      var mesh = K.meshFromBody(b), mp = K.massProps(mesh, bm.density);
      var size = bboxText(mesh, units), key = (bm.name || '') + '|' + size + '|' + mp.volume.toFixed(3);
      var fid = build.bodyFeatures ? build.bodyFeatures[i] : null, f = fid != null ? K.findFeature(model, fid) : null;
      var r = byKey[key];
      if (!r) {
        var bmp = { volume: mp.volume, area: mp.area, density: bm.density, mass: mp.volume * bm.density, massKg: (hasMaterials() ? Materials.volumeToM3(mp.volume, units) : mp.volume * 1e-9) * bm.density };
        r = byKey[key] = { key: key, name: f ? f.name : 'Body' + (i + 1), size: size, material: bm.name, count: 0, bodies: [], prop: partProps(model, build, null, { mp: bmp, material: bm.name || null }) };
        out.push(r);
      }
      r.count++; r.bodies.push(i);
    });
    return out;
  }
  // bomRows(model, mesh?, bom?, opts?) -> [{ item, key, srcKey, partNumber, description, qty, components: [id…],
  // indices: [body index…], prop(name) }]. Assemblies: one row per distinct component source (identical components
  // counted together, items in tree order). bom.type 'parts' (Parts only) lists the solid bodies of a multi-body part
  // as rows of their own, each with its own material and mass; 'top' (Top-level only, the default) lists the part.
  // A part drawing has rows only when it has a BOM (bom given): the part, or its bodies for Parts only.
  // Sub-assemblies (cloud-2026-09-26r): 'indented' (Indented) lists each sub-assembly followed by its own rows one
  // level in (items 1, 1.1, 1.2 …, qty per one of its parent; row.level); 'parts' with sub-assemblies lists every part
  // at any depth with the quantities multiplied through the levels. Both come from Assembly.bom; 'top' keeps a
  // sub-assembly as one row.
  // PART NUMBER is the part's "Part Number" property, else its name; DESCRIPTION its "Description" property, else the
  // model's description / Design Library name / size "30 x 5 x 20" (when the mesh is given). opts.build: the
  // assembly (or part) build, to reuse its part builds.
  function bomRows(model, mesh, bom, opts) {
    opts = opts || {};
    if (!model) return [];
    var asm = model.type === 'assembly', parts = !!(bom && bom.type === 'parts'), units = model.units === 'in' ? 'in' : 'mm';
    var rows = [];
    function push(r) { r.item = rows.length + 1; rows.push(r); return r; }
    if (!asm) {
      if (!bom) return [];
      var build = opts.build && !opts.build.assembly ? opts.build : null;
      var needBuild = parts || (hasMaterials() && Materials.hasBodyMaterials(model));
      if (!build && needBuild) { try { build = K.rebuild(JSON.parse(JSON.stringify(model))); } catch (e) { build = null; } }
      var prop = partProps(model, build, mesh && mesh.triCount ? mesh : null);
      var pn = nonEmpty(prop('Part Number')) || model.name || 'Part';
      var brs = parts ? bodyRows(model, build, units) : null;
      if (brs) {
        brs.forEach(function (b) { push({ key: 'part#' + b.key, srcKey: 'part', partNumber: pn + ' - ' + b.name, description: b.size, qty: b.count, components: [], indices: b.bodies, prop: b.prop, body: true }); });
        return rows;
      }
      var desc = nonEmpty(prop('Description')) || model.description || (mesh && mesh.triCount ? bboxText(mesh, units) : '');
      var nb = build ? (build.bodies || [build.body]).length : 1, idx = [];
      for (var q = 0; q < nb; q++) idx.push(q);
      push({ key: 'part', srcKey: 'part', partNumber: pn, description: desc, qty: 1, components: [], indices: idx, prop: prop });
      return rows;
    }
    if (!model.components) return [];
    var groups = [], bySrc = {}, type = bomType(bom && bom.type), levels = null;
    if (type !== 'top' && typeof Assembly !== 'undefined' && Assembly.bom &&
        (type === 'indented' || model.components.some(function (c) { return Assembly.isSubAssemblySource(c.source); }))) {
      var ab = opts.build && opts.build.partBuilds ? opts.build : null, topIdx = {};
      model.components.forEach(function (c, i) { topIdx[c.id] = i; });
      levels = Assembly.bom(model, ab, { type: type });
      levels.forEach(function (r) {
        var idx = r.level === 0 ? r.components.map(function (id) { return topIdx[id]; }).filter(function (i) { return i != null; }) : [];
        var first = idx.length ? idx[0] : -1;
        groups.push({ key: r.key, source: JSON.parse(r.key), first: first, components: r.components.slice(), indices: idx, transform: first >= 0 ? model.components[first].transform : null, qty: r.qty, item: r.item, level: r.level, kind: r.kind });
      });
    } else {
      model.components.forEach(function (c, i) {
        var key = JSON.stringify(c.source), g = bySrc[key];
        if (!g) { g = bySrc[key] = { key: key, source: c.source, first: i, components: [], indices: [], transform: c.transform }; groups.push(g); }
        g.components.push(c.id); g.indices.push(i);
      });
    }
    groups.forEach(function (g) {
      var qty = g.qty != null ? g.qty : g.components.length;
      var info = partInfo(g.source, opts.build), pb = null;
      function pbuild() { return pb || (pb = info.build()); }
      var prop = partProps(info.model, null, null), full = null;
      // mass needs the part's build: a property column evaluates through a context that has it, built on first use
      var propFn = function (name) {
        if (!full) full = info.model ? partProps(info.model, pbuild(), null) : prop;
        return full(name);
      };
      var pn = nonEmpty(prop('Part Number')) || info.name;
      var brs = parts && info.model && g.kind !== 'assembly' ? bodyRows(info.model, pbuild(), info.model.units === 'in' ? 'in' : 'mm') : null;
      if (brs) {
        brs.forEach(function (b) { push({ key: g.key + '#' + b.key, srcKey: g.key, partNumber: pn + ' - ' + b.name, description: b.size, qty: b.count * qty, components: g.components.slice(), indices: g.indices.slice(), prop: b.prop, body: true }); });
        return;
      }
      var desc = nonEmpty(prop('Description')) || info.description;
      if (!desc && mesh && g.first >= 0) desc = envelopeText(mesh, g.first, g.transform, model.units);
      var r = push({ key: g.key, srcKey: g.key, partNumber: pn, description: desc, qty: qty, components: g.components.slice(), indices: g.indices.slice(), prop: propFn });
      if (type === 'indented' && g.item != null) { r.item = g.item; r.level = g.level; }
    });
    return rows;
  }
  function envelopeText(mesh, body, T, units) {
    var P = mesh.positions64 || mesh.positions, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    var R = T && T.rotation || [1, 0, 0, 0, 1, 0, 0, 0, 1], o = T && T.position || [0, 0, 0];
    mesh.faces.forEach(function (f) {
      if ((f.body || 0) !== body) return;
      for (var i = f.start * 9; i < (f.start + f.count) * 9; i += 3) {
        var d = [P[i] - o[0], P[i + 1] - o[1], P[i + 2] - o[2]];
        for (var k = 0; k < 3; k++) { var x = R[k] * d[0] + R[3 + k] * d[1] + R[6 + k] * d[2]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; }
      }
    });
    if (!(lo[0] <= hi[0])) return '';
    return [0, 1, 2].map(function (k) { return fmtDim(hi[k] - lo[k], units); }).join(' x ');
  }
  var BOM_ANCHORS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
  // bomPropertyNames(model) -> the property names a BOM column can show: Material, Mass, Vendor, Revision, Finish and
  // every custom property of the part (or of the assembly's parts)
  function bomPropertyNames(model) {
    var out = ['Material', 'Mass', 'Vendor', 'Revision', 'Finish'], seen = {};
    out.forEach(function (n) { seen[n.toLowerCase()] = 1; });
    function add(m) {
      if (!m || !hasMaterials()) return;
      Materials.effective(m).forEach(function (p) { var k = p.name.toLowerCase(); if (!seen[k] && k !== 'description' && k !== 'part number') { seen[k] = 1; out.push(p.name); } });
    }
    if (model && model.type === 'assembly') (model.components || []).forEach(function (c) { add(partInfo(c.source).model); });
    else add(model);
    return out;
  }
  // bomBox(doc, units, nRows) -> { x0, y0, x1, y1, rowH, cols: [x…], columns } anchored to a corner of the border (a
  // bottom anchor sits above the title block on the right), or at doc.bom.x / y (its top-left corner) when it was
  // dragged. Its width is the sum of the visible columns.
  function bomBox(doc, units, nRows) {
    var k = paperK(units), S = sheetSize(doc, units), b = BORDER * k, bm = doc.bom || {}, columns = bomColumns(bm);
    var W = columns.reduce(function (a, c) { return a + c.width; }, 0) * k, H = (nRows + 1) * BOM_ROW * k;
    var anchor = bm.anchor || 'top-right', x0, y1;
    if (bm.x != null && bm.y != null) { x0 = bm.x; y1 = bm.y; }
    else {
      x0 = /left/.test(anchor) ? b : S[0] - b - W;
      y1 = /top/.test(anchor) ? S[1] - b : b + (/right/.test(anchor) ? TB_H * k : 0) + H;
    }
    var cols = [x0]; columns.forEach(function (c) { cols.push(cols[cols.length - 1] + c.width * k); });
    return { x0: x0, y0: y1 - H, x1: x0 + W, y1: y1, rowH: BOM_ROW * k, cols: cols, anchor: anchor, columns: columns };
  }
  // autoBalloon(doc, model, viewId, { ignoreMultiple }) -> the view's balloons [{ key (the BOM row: the component
  // source), component (id), instance? }]. SolidWorks Auto Balloon: one balloon per BOM item that shows in the view
  // ("Ignore multiple instances", the default), or one per component instance with ignoreMultiple false. The item
  // number is looked up in the BOM at every render, so balloons renumber with it; a balloon whose item has no visible
  // or hidden edge in the view is not drawn. Replaces the view's earlier balloons.
  function autoBalloon(doc, model, viewId, opts) {
    opts = opts || {};
    var v = findView(doc, viewId);
    if (!v) throw new Error('No drawing view ' + viewId);
    var rows = bomRows(model);
    if (!rows.length) throw new Error('Auto Balloon needs a drawing of an assembly');
    var list = [];
    rows.forEach(function (r) {
      if (opts.ignoreMultiple === false) r.components.forEach(function (id) { list.push({ key: r.key, component: id, instance: true }); });
      else list.push({ key: r.key, component: r.components[0] });
    });
    v.balloons = list;
    return v.balloons;
  }
  function deleteBalloons(doc, viewId) { var v = findView(doc, viewId); if (v) v.balloons = []; }
  // balloonSpots(w, rows, k) -> [{ item, key, component, attach (paper), c (paper), r, ok }]: attaches each balloon to
  // the component's visible geometry farthest from the view centre (so the leader runs outward) and places the
  // balloons on a rectangle 14 mm outside the view box, on the side the attach point faces, spread apart
  var BALLOON_R = 5, BALLOON_OUT = 14;
  function balloonSpots(w, rows, k) {
    var v = w.view, box = w.box, list = v.balloons || [], out = [];
    if (!list.length) return out;
    var cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, r = BALLOON_R * k, pr = w.proj;
    // a balloon names its component's source; in a Parts only BOM that part may be several rows (its bodies): the first
    var byKey = {}; rows.forEach(function (rw) { byKey[rw.key] = rw; if (rw.srcKey && !byKey[rw.srcKey]) byKey[rw.srcKey] = rw; });
    list.forEach(function (b) {
      var rw = byKey[b.key];
      if (!rw) return;
      var idx = b.instance ? rw.indices.filter(function (i, j) { return rw.components[j] === b.component; }) : rw.indices, best = null, bd = -1;
      var extra = { src: b, index: list.indexOf(b), stack: (b.stack || []).map(function (s) { var r2 = byKey[s.key]; return { item: r2 ? r2.item : '?', key: s.key, component: s.component }; }),
        stackDir: b.stackDir || null, qty: !!b.qty, qtyPos: b.qtyPos || null, qtyText: rw.qty + 'X', manual: !!b.manual };
      // a manual balloon keeps the point it was attached to (model units in the view)
      if (b.attach) { out.push(Object.assign({ item: rw.item, key: rw.key, component: b.component, attach: w.toSheet(b.attach), r: r, ok: true }, extra)); return; }
      if (!idx.length) return;
      function consider(p, bodyIndex, hidden) {
        if (idx.indexOf(bodyIndex) < 0) return;
        var q = w.toSheet(p), d = Math.hypot(q[0] - cx, q[1] - cy) - (hidden ? 1e6 : 0);
        if (d > bd) { bd = d; best = q; }
      }
      pr.lines.visible.forEach(function (l) { consider([(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], l[4] || 0, false); });
      pr.circles.visible.forEach(function (c) { consider([c.c[0] + c.r, c.c[1]], c.body || 0, false); });
      (pr.arcs ? pr.arcs.visible : []).forEach(function (a) { var e = arcEnds(a); consider([(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2], a.body || 0, false); });
      (pr.ellipses ? pr.ellipses.visible : []).forEach(function (el) { var t = (el.t0 + el.t1) / 2; consider([el.c[0] + el.ax[0] * Math.cos(t) + el.ay[0] * Math.sin(t), el.c[1] + el.ax[1] * Math.cos(t) + el.ay[1] * Math.sin(t)], el.body || 0, false); });
      if (!best) { pr.lines.hidden.forEach(function (l) { consider([(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], l[4] || 0, true); }); pr.circles.hidden.forEach(function (c) { consider([c.c[0] + c.r, c.c[1]], c.body || 0, true); }); }
      if (!best) return;
      out.push(Object.assign({ item: rw.item, key: rw.key, component: b.component, attach: best, r: r, ok: true }, extra));
    });
    // place: the ray from the view centre through the attach point meets the rectangle `out` mm outside the box
    var o = BALLOON_OUT * k, R = { x0: box.x0 - o, x1: box.x1 + o, y0: box.y0 - o, y1: box.y1 + o }, W = R.x1 - R.x0, H = R.y1 - R.y0, per = 2 * (W + H);
    function tOf(p) {   // perimeter parameter, counter-clockwise from the bottom-left corner
      if (Math.abs(p[1] - R.y0) < 1e-9) return p[0] - R.x0;
      if (Math.abs(p[0] - R.x1) < 1e-9) return W + p[1] - R.y0;
      if (Math.abs(p[1] - R.y1) < 1e-9) return W + H + (R.x1 - p[0]);
      return 2 * W + H + (R.y1 - p[1]);
    }
    function pOf(t) {
      t = ((t % per) + per) % per;
      if (t < W) return [R.x0 + t, R.y0]; t -= W;
      if (t < H) return [R.x1, R.y0 + t]; t -= H;
      if (t < W) return [R.x1 - t, R.y1]; t -= W;
      return [R.x0, R.y1 - t];
    }
    out.forEach(function (b) {
      var dx = b.attach[0] - cx, dy = b.attach[1] - cy, L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      var tx = Math.abs(dx) < 1e-12 ? Infinity : (dx > 0 ? R.x1 - cx : R.x0 - cx) / dx, ty = Math.abs(dy) < 1e-12 ? Infinity : (dy > 0 ? R.y1 - cy : R.y0 - cy) / dy;
      var t = Math.min(tx, ty), p = [cx + dx * t, cy + dy * t];
      p[0] = Math.max(R.x0, Math.min(R.x1, p[0])); p[1] = Math.max(R.y0, Math.min(R.y1, p[1]));
      b.t = tOf(p);
    });
    // spread balloons closer than 2.4 r apart along the perimeter (a few relaxation passes)
    var gap = 2.4 * r, sorted = out.filter(function (b) { return !b.src.pos; }).sort(function (a, b) { return a.t - b.t; });
    for (var pass = 0; pass < 8 && sorted.length > 1; pass++) {
      for (var i = 1; i < sorted.length; i++) if (sorted[i].t - sorted[i - 1].t < gap) { var m = (sorted[i].t + sorted[i - 1].t) / 2; sorted[i - 1].t = m - gap / 2; sorted[i].t = m + gap / 2; }
      if (sorted[sorted.length - 1].t - sorted[0].t > per - gap) { var m2 = (sorted[sorted.length - 1].t - per + sorted[0].t) / 2; sorted[0].t = m2 + gap / 2; sorted[sorted.length - 1].t = per + m2 - gap / 2; }
    }
    // a dragged (or placed) balloon sits where it was put, relative to the view centre
    out.forEach(function (b) { b.c = b.src.pos ? [v.x + b.src.pos[0], v.y + b.src.pos[1]] : pOf(b.t); });
    return out;
  }
  // ------------------------------------------------------------------ sheet primitives
  // compute(doc, mesh, model, ctx?) -> { size: [W, H], units, prims: [...], views: [{ view, proj, box }], dims }
  // prims: { k: 'line', a, b, layer, style } | { k: 'circle', c, r, layer, style } | { k: 'text', p, h, text, anchor,
  // layer, rot } | { k: 'fill', pts, layer } | { k: 'arc', c, r, a0, a1, layer, style } | { k: 'ellipse', c, major,
  // ratio, t0, t1, full, layer, style } (ellipsePrim); styles: 'visible', 'hidden', 'thin', 'thick'. Paper coordinates, y up.
  function compute(doc, mesh, model, ctx) {
    ctx = ctx || {};
    var units = model.units === 'in' ? 'in' : 'mm', k = paperK(units);
    var S = sheetSize(doc, units), prims = [], chainSeq = 0;
    function line(a, b, layer, style) { prims.push({ k: 'line', a: a, b: b, layer: layer, style: style }); }
    function text(p, h, t, anchor, layer, rot) { prims.push({ k: 'text', p: p, h: h, text: t, anchor: anchor || 'start', layer: layer, rot: rot || 0 }); }
    // border and title block
    var b0 = BORDER * k * 0.5, b1 = BORDER * k;
    rect([b1, b1], [S[0] - b1, S[1] - b1], 'SHEET', 'thick');
    void b0;
    var tw = TB_W * k, th = TB_H * k, tx0 = S[0] - b1 - tw, ty0 = b1, row = th / 3;
    rect([tx0, ty0], [S[0] - b1, ty0 + th], 'SHEET', 'thick');
    line([tx0, ty0 + row], [S[0] - b1, ty0 + row], 'SHEET', 'thin');
    line([tx0, ty0 + 2 * row], [S[0] - b1, ty0 + 2 * row], 'SHEET', 'thin');
    var lab = 2.2 * k, val = 3.5 * k, pad = 1.5 * k;
    // title block fields: each a text with $PRPSHEET:"name" (the model's custom property) / $PRP:"name" (the
    // drawing's) links, evaluated now; doc.titleBlock overrides a field's text
    var tb = titleBlock(doc, model, ctx), scale = doc.sheet.scale || [1, 1];
    var tbRect = { x0: tx0, y0: ty0, x1: S[0] - b1, y1: ty0 + th };
    var colX = {};
    TB_FIELDS.forEach(function (f) {
      var x0 = tx0 + f.x0 * k, x1 = tx0 + f.x1 * k, yTop = ty0 + th - f.row * row;
      if (f.x0 > 0 && !colX[f.row + ':' + f.x0]) { colX[f.row + ':' + f.x0] = 1; line([x0, yTop - row], [x0, yTop], 'SHEET', 'thin'); }
      var v = tb[f.key], h = f.big ? 5 * k : val, w = x1 - x0 - 2 * pad;
      if (v && textWidth(v, h) > w) h = Math.max(1.6 * k, w / (String(v).length * 0.6));
      text([x0 + pad, yTop - pad - lab], lab, f.label, 'start', 'SHEET');
      if (v) text([x0 + pad, yTop - pad - lab - (f.big ? 6.5 : 4.5) * k], h, v, 'start', 'SHEET');
    });
    function rect(a, b, layer, style) { line([a[0], a[1]], [b[0], a[1]], layer, style); line([b[0], a[1]], [b[0], b[1]], layer, style); line([b[0], b[1]], [a[0], b[1]], layer, style); line([a[0], b[1]], [a[0], a[1]], layer, style); }

    // views: what each one shows (its content, in model units of its frame), then paper primitives
    doc.units = units;
    var projections = {}, views = [], contents = {}, byId = {};
    var layers = {};
    doc.views.forEach(function (v) { byId[v.id] = v; });
    function contentOf(v, depth) {
      if (contents[v.id]) return contents[v.id];
      var c = viewContent(doc, v, mesh, byId[v.parent] && (depth || 0) < 20 ? function (pv) { return contentOf(pv, (depth || 0) + 1); } : null);
      contents[v.id] = c;
      return c;
    }
    var hs = HATCH * k;
    // a part's cut faces are hatched with their body's material pattern (steel ANSI32, aluminium ANSI38, …); assembly
    // components keep ANSI31 at their own angles (r5/drawings5)
    var capPattern = function (body) {
      if (!hasMaterials() || !model || model.type === 'assembly') return 'ANSI31';
      var bm = Materials.bodyMaterial ? Materials.bodyMaterial(model, ctx.build || null, body | 0) : null;
      return hatchPattern(bm && bm.name);
    };
    doc.views.forEach(function (v) {
      var ct = contentOf(v), pr = ct.proj;
      projections[v.id] = pr;
      var s = viewScale(doc, v), cu = ct.center[0], cv = ct.center[1], bd = pr.bounds;
      var toSheet = function (p) { return [v.x + (p[0] - cu) * s, v.y + (p[1] - cv) * s]; };
      var fromSheet = function (p) { return [(p[0] - v.x) / s + cu, (p[1] - v.y) / s + cv]; };
      var layer = layerName(v, layers);
      var clip = ct.clip ? { c: toSheet(ct.clip.c), r: ct.clip.r * s } : null;
      // cut faces first, so the outlines are drawn over the hatching
      var hatch = 0, hatches = [];
      (ct.caps || []).forEach(function (cap) {
        var loops = cap.loops.map(function (l) { return l.map(toSheet); }), hst = hatchStyle(cap.body), n0 = hatch, pat = capPattern(cap.body);
        patternLines(loops, hs * hst.spacing, hst.angle, pat).forEach(function (h) {
          var q = clip ? clipSeg(h, clip.c, clip.r) : h;
          if (q) { prims.push({ k: 'line', a: [q[0], q[1]], b: [q[2], q[3]], layer: layer, style: 'hatch', body: cap.body }); hatch++; }
        });
        hatches.push({ body: cap.body, angle: hst.angle, spacing: hs * hst.spacing, lines: hatch - n0, pattern: pat });
      });
      // straight pieces that run smoothly into each other (a curve drawn as chords) are one chain, written as one path
      // so a hidden curve's dashes run on along it instead of restarting at every chord (r4/drawings4)
      function chained(list, style) {
        var key = '_chains_' + style;
        if (!list[key]) Object.defineProperty(list, key, { value: chainLines(list, pr.bounds), enumerable: false });
        list[key].forEach(function (ch) {
          var cid = ch.length > 1 ? ++chainSeq : null;
          ch.forEach(function (l) { var q = { k: 'line', a: toSheet([l[0], l[1]]), b: toSheet([l[2], l[3]]), layer: layer, style: style }; if (cid) q.chain = cid; prims.push(q); });
        });
      }
      chained(pr.lines.visible, 'visible');
      pr.circles.visible.forEach(function (c) { prims.push({ k: 'circle', c: toSheet(c.c), r: c.r * s, layer: layer, style: 'visible' }); });
      (pr.arcs ? pr.arcs.visible : []).forEach(function (a) { prims.push({ k: 'arc', c: toSheet(a.c), r: a.r * s, a0: a.a0, a1: a.a1, layer: layer, style: 'visible' }); });
      // tangent edges: thin solid (Tangent Edges Visible) or phantom (With Font); a detail view shows its parent's
      var tst = (v.kind === 'detail' && byId[v.parent] ? byId[v.parent].tangent : v.tangent) === 'font' ? 'tanfont' : 'tangent';
      if (pr.lines.tangent) chained(pr.lines.tangent, tst);
      (pr.circles.tangent || []).forEach(function (c) { prims.push({ k: 'circle', c: toSheet(c.c), r: c.r * s, layer: layer, style: tst }); });
      (pr.arcs && pr.arcs.tangent || []).forEach(function (a) { prims.push({ k: 'arc', c: toSheet(a.c), r: a.r * s, a0: a.a0, a1: a.a1, layer: layer, style: tst }); });
      (pr.ellipses && pr.ellipses.tangent || []).forEach(function (el) { prims.push(ellipsePrim(el, toSheet, s, layer, tst)); });
      chained(pr.lines.hidden, 'hidden');
      pr.circles.hidden.forEach(function (c) { prims.push({ k: 'circle', c: toSheet(c.c), r: c.r * s, layer: layer, style: 'hidden' }); });
      (pr.arcs ? pr.arcs.hidden : []).forEach(function (a) { prims.push({ k: 'arc', c: toSheet(a.c), r: a.r * s, a0: a.a0, a1: a.a1, layer: layer, style: 'hidden' }); });
      ['visible', 'hidden'].forEach(function (st) { (pr.ellipses ? pr.ellipses[st] : []).forEach(function (el) { prims.push(ellipsePrim(el, toSheet, s, layer, st)); }); });
      var p0 = toSheet([bd.umin, bd.vmin]), p1 = toSheet([bd.umax, bd.vmax]);
      var box = { x0: p0[0], x1: p1[0], y0: p0[1], y1: p1[1] };
      if (v.kind === 'section') {
        text([v.x, box.y0 - 7 * k], 3.5 * k, 'SECTION ' + v.label + '-' + v.label, 'middle', layer);
        if (v.scale && scaleValue(v.scale) !== scaleValue(scale)) text([v.x, box.y0 - 12 * k], 3 * k, scaleLabel(v.scale), 'middle', layer);
      } else if (v.kind === 'detail') {
        text([(box.x0 + box.x1) / 2, box.y0 - 7 * k], 3.5 * k, 'DETAIL ' + v.label, 'middle', layer);
        text([(box.x0 + box.x1) / 2, box.y0 - 12 * k], 3 * k, scaleLabel(v.scale || scale), 'middle', layer);
      } else if (v.scale && scaleValue(v.scale) !== scaleValue(scale)) text([v.x, box.y0 - 6 * k], 3 * k, String(v.orient).toUpperCase() + '  ' + scaleLabel(v.scale), 'middle', layer);
      views.push({ view: v, proj: pr, box: box, layer: layer, toSheet: toSheet, fromSheet: fromSheet, scale: s, frame: ct.frame, ortho: isOrthoFrame(ct.frame),
        section: ct.section || null, hatch: hatch, hatches: hatches, clip: clip, content: ct });
    });
    // cutting lines and detail circles on the parents
    views.forEach(function (w) {
      var v = w.view, pw = views.filter(function (x) { return x.view.id === v.parent; })[0];
      if (!pw) return;
      var L = pw.layer, ar = 3 * k, aw = 0.9 * k;
      function arrow(tip, dir) {
        var n = [-dir[1], dir[0]];
        prims.push({ k: 'fill', pts: [tip, [tip[0] - dir[0] * ar + n[0] * aw, tip[1] - dir[1] * ar + n[1] * aw], [tip[0] - dir[0] * ar - n[0] * aw, tip[1] - dir[1] * ar - n[1] * aw]], layer: L });
      }
      if (v.kind === 'section') {
        var sc = v.section, ext = 5 * k, shaft = 8 * k, lh = 5 * k, a, b, dv;
        if (sc.axis === 'h') {
          var y = pw.toSheet([0, sc.at])[1];
          a = [pw.box.x0 - ext, y]; b = [pw.box.x1 + ext, y]; dv = [0, -sc.sign];
        } else {
          var x = pw.toSheet([sc.at, 0])[0];
          a = [x, pw.box.y0 - ext]; b = [x, pw.box.y1 + ext]; dv = [-sc.sign, 0];
        }
        line(a, b, L, 'chain');
        [a, b].forEach(function (e0) {
          var tip = [e0[0] + dv[0] * shaft, e0[1] + dv[1] * shaft];
          line(e0, tip, L, 'thick'); arrow(tip, dv);
          var tp = [tip[0] + dv[0] * 2 * k, tip[1] + dv[1] * 2 * k - (dv[1] > 0 ? 0 : dv[1] < 0 ? lh : lh / 2)];
          if (dv[0]) tp[0] += dv[0] * 1 * k;
          text(tp, lh, v.label, 'middle', L);
        });
      } else if (v.kind === 'detail') {
        var dc = pw.toSheet(v.detail.c), r = v.detail.r * pw.scale;
        prims.push({ k: 'circle', c: dc, r: r, layer: L, style: 'thick' });
        var q = Math.SQRT1_2;
        text([dc[0] + (r + 2 * k) * q, dc[1] + (r + 2 * k) * q], 5 * k, v.label, 'start', L);
      }
    });
    // Bill of Materials (assemblies): a table anchored to the sheet; balloons on the views that asked for them
    var rows = bomRows(model, mesh, doc.bom || null, { build: ctx.build }), bom = null, balloons = [];
    if (doc.bom) doc.bomRows = rows.length;
    if (rows.length && doc.bom && doc.bom.show !== false) {
      var bb = bomBox(doc, units, rows.length), th = BOM_TEXT * k, BL = 'BOM';
      rect([bb.x0, bb.y0], [bb.x1, bb.y1], BL, 'thick');
      for (var ri = 1; ri <= rows.length; ri++) line([bb.x0, bb.y1 - ri * bb.rowH], [bb.x1, bb.y1 - ri * bb.rowH], BL, 'thin');
      for (var ci = 1; ci < bb.cols.length - 1; ci++) line([bb.cols[ci], bb.y0], [bb.cols[ci], bb.y1], BL, 'thin');
      var cellText = function (rowIndex, col, t) {
        var al = bb.columns[col].align;
        var x = al === 'middle' ? (bb.cols[col] + bb.cols[col + 1]) / 2 : bb.cols[col] + 1.5 * k, y = bb.y1 - (rowIndex + 1) * bb.rowH + (bb.rowH - th) / 2;
        var maxCh = Math.floor((bb.cols[col + 1] - bb.cols[col] - 3 * k) / (th * 0.6));
        t = t == null ? '' : String(t);
        if (t) text([x, y], th, t.length > maxCh ? t.slice(0, Math.max(1, maxCh - 3)) + '...' : t, al, BL);
      };
      bb.columns.forEach(function (c, i) { cellText(0, i, c.title); });
      var cells = rows.map(function (r) { return bb.columns.map(function (c) { return bomCell(r, c); }); });
      cells.forEach(function (cr, i) { cr.forEach(function (t, j) { cellText(i + 1, j, t); }); });
      bom = { rows: rows, box: bb, layer: BL, columns: bb.columns, cells: cells, type: bomType(doc.bom.type) };
    }
    // a part drawing without a Bill of Materials still numbers its manual balloons: the part is item 1
    var brows = rows;
    if (!brows.length && model.type !== 'assembly' && views.some(function (w) { return (w.view.balloons || []).length; })) {
      var nb = 0; mesh.faces.forEach(function (f) { nb = Math.max(nb, (f.body || 0) + 1); });
      brows = [{ item: 1, key: 'part', srcKey: 'part', qty: 1, components: [], indices: Array.apply(null, Array(Math.max(1, nb))).map(function (x, i) { return i; }) }];
    }
    views.forEach(function (w) {
      if (!(w.view.balloons || []).length || !brows.length) return;
      var nb0 = prims.length;
      balloonSpots(w, brows, k).forEach(function (b) {
        var L = 'BALLOONS', d = [b.attach[0] - b.c[0], b.attach[1] - b.c[1]], Ln = Math.hypot(d[0], d[1]) || 1, u = [d[0] / Ln, d[1] / Ln];
        var start = [b.c[0] + u[0] * b.r, b.c[1] + u[1] * b.r];
        line(start, b.attach, L, 'thin');
        prims.push({ k: 'fill', pts: [b.attach, [b.attach[0] - u[0] * 3 * k + u[1] * 0.9 * k, b.attach[1] - u[1] * 3 * k - u[0] * 0.9 * k], [b.attach[0] - u[0] * 3 * k - u[1] * 0.9 * k, b.attach[1] - u[1] * 3 * k + u[0] * 0.9 * k]], layer: L });
        prims.push({ k: 'circle', c: b.c, r: b.r, layer: L, style: 'thin' });
        text([b.c[0], b.c[1] - 1.25 * k], 3.5 * k, String(b.item), 'middle', L);
        // Stacked balloons: the other items touch this one in the stack direction; QTY: "2X" beside the stack
        var sd = STACK_DIRS[b.stackDir] || STACK_DIRS.right, far = b.c;
        (b.stack || []).forEach(function (s, j) {
          var c2 = [b.c[0] + sd[0] * 2 * b.r * (j + 1), b.c[1] + sd[1] * 2 * b.r * (j + 1)];
          prims.push({ k: 'circle', c: c2, r: b.r, layer: L, style: 'thin' });
          text([c2[0], c2[1] - 1.25 * k], 3.5 * k, String(s.item), 'middle', L);
          far = c2;
        });
        if (b.qty) {
          var qp = b.qtyPos || 'right', qt = b.qtyText, g2 = 1.2 * k, qx = qp === 'left' ? Math.min(b.c[0], far[0]) - b.r - g2 : Math.max(b.c[0], far[0]) + b.r + g2;
          if (qp === 'up') text([(b.c[0] + far[0]) / 2, Math.max(b.c[1], far[1]) + b.r + g2], 3.5 * k, qt, 'middle', L);
          else if (qp === 'down') text([(b.c[0] + far[0]) / 2, Math.min(b.c[1], far[1]) - b.r - g2 - 3.5 * k], 3.5 * k, qt, 'middle', L);
          else text([qx, b.c[1] - 1.25 * k], 3.5 * k, qt, qp === 'left' ? 'end' : 'start', L);
        }
        b.view = w.view.id;
        balloons.push(b);
      });
      for (var pi = nb0; pi < prims.length; pi++) prims[pi].view = w.view.id;   // a dragged view takes them along
    });
    // dimensions
    var suppressed = doc.suppressed || [];
    // a model item's Dimension PropertyManager settings live in doc.dimProps under its style key (view:kind:n)
    var nth = {};
    var dims = doc.autoDims ? autoDims(doc, projections, units).filter(function (d) {
      d.key = autoDimKey(d);
      var sk = d.view + ':' + d.kind; nth[sk] = nth[sk] || 0; d.style = styleKey(d, nth[sk]++);
      var pp = doc.dimProps && doc.dimProps[d.style];
      if (pp) { setDimProps(d, pp); d.text = dimText(d, units); }
      return suppressed.indexOf(d.key) < 0;
    }) : [];
    doc.views.forEach(function (v) {
      (v.dims || []).forEach(function (d, i) {
        if (projections[v.id]) reattachUserDim(d, projections[v.id]);
        var c = JSON.parse(JSON.stringify(d)); c.view = v.id; c.index = i; c.text = dimText(c, units); dims.push(c);
      });
    });
    // annotations (centre marks, centrelines, hole callouts) are worked out first, so leader texts keep clear of them
    var threads = partThreads(model), annPre = {};
    views.forEach(function (w) { (w.view.annotations || []).forEach(function (an, i) { annPre[w.view.id + ':' + i] = annotationPrims(an, w, k, mesh, doc, units, threads); }); });
    var placed = [], shown = [];
    // what a leader's text must keep clear of: the drawn geometry of every view (it may sit on empty paper inside its
    // own view, beside the hole it names), the other views, the title block, the BOM, and every dimension placed before
    var geo = { segs: [], circles: [] }, viewLayers = {};
    views.forEach(function (w) { viewLayers[w.layer] = 1; });
    prims.forEach(function (p) {
      if (!viewLayers[p.layer]) return;
      if (p.k === 'line') geo.segs.push([p.a, p.b]);
      else if (p.k === 'circle') geo.circles.push(p);
      else if (p.k === 'arc' || p.k === 'ellipse') {
        var n = 24, prev = null;
        for (var i = 0; i <= n; i++) {
          var q;
          if (p.k === 'arc') { var sp = ((p.a1 - p.a0) % 360 + 360) % 360 || 360, a = (p.a0 + sp * i / n) * Math.PI / 180; q = [p.c[0] + p.r * Math.cos(a), p.c[1] + p.r * Math.sin(a)]; }
          else q = ellipseAt(p, p.t0 + (p.t1 - p.t0) * i / n).p;
          if (prev) geo.segs.push([prev, q]);
          prev = q;
        }
      }
    });
    var obs = { texts: [], segs: [], geo: geo, boxes: views.map(function (w) { return { box: w.box, view: w.view.id }; }).concat([{ box: tbRect }]),
      sheet: { x0: b1, y0: b1, x1: S[0] - b1, y1: S[1] - b1 } };
    if (bom) obs.boxes.push({ box: bom.box });
    Object.keys(annPre).forEach(function (key) { annPre[key].prims.forEach(function (x) { if (x.k === 'line') geo.segs.push([x.a, x.b]); else if (x.k === 'text') obs.texts.push(textRect(x)); }); });
    dims.forEach(function (d) {
      var vw = views.filter(function (w) { return w.view.id === d.view; })[0];
      if (!vw) return;
      var p = placeDim(d, vw, k, placed, obs), pg = primGeo(p);
      obs.texts = obs.texts.concat(pg.texts); obs.segs = obs.segs.concat(pg.segs);
      if (d.dangling) p.forEach(function (x) { x.color = 'dangling'; });
      var bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      function grow(q) { bx.x0 = Math.min(bx.x0, q[0]); bx.x1 = Math.max(bx.x1, q[0]); bx.y0 = Math.min(bx.y0, q[1]); bx.y1 = Math.max(bx.y1, q[1]); }
      // the arrow tips (clicked to flip the arrows) and the text's rectangle (edited in place), r4/drawings4
      d.arrows = []; d.tbox = null;
      p.forEach(function (x) {
        x.view = d.view;
        prims.push(x);
        if (x.k === 'fill') d.arrows.push(x.pts[0]);
        if (x.k === 'text') { var tr0 = textRect(x); d.tbox = d.tbox ? { x0: Math.min(d.tbox.x0, tr0.x0), y0: Math.min(d.tbox.y0, tr0.y0), x1: Math.max(d.tbox.x1, tr0.x1), y1: Math.max(d.tbox.y1, tr0.y1) } : tr0; }
        if (x.a) { grow(x.a); grow(x.b); }
        if (x.k === 'text') { var w = textWidth(x.text, x.h), vert = Math.abs(x.rot) > 45; grow(x.p); grow(vert ? [x.p[0] - x.h, x.p[1] + w / 2] : [x.p[0] + w, x.p[1] + x.h]); if (vert) grow([x.p[0], x.p[1] - w / 2]); else if (x.anchor === 'middle') grow([x.p[0] - w / 2, x.p[1]]); }
      });
      d.box = bx;
      placed.push(d); shown.push(d);
    });
    dims = shown;
    // cosmetic threads (holewizard.js Straight Tap holes): a dashed circle at the major diameter in views along the axis
    views.forEach(function (w) {
      if (!w.ortho || w.section || w.clip) return;
      threadsAlong(threads, w.frame).forEach(function (t) { prims.push({ k: 'circle', c: w.toSheet(t.c), r: t.r * w.scale, layer: w.layer, style: 'hidden', thread: t.label }); });
    });
    // annotations: centre marks, centrelines, hole callouts
    var annotations = [];
    views.forEach(function (w) {
      (w.view.annotations || []).forEach(function (an, i) {
        var r = annPre[w.view.id + ':' + i], bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        function grow(q) { bx.x0 = Math.min(bx.x0, q[0]); bx.x1 = Math.max(bx.x1, q[0]); bx.y0 = Math.min(bx.y0, q[1]); bx.y1 = Math.max(bx.y1, q[1]); }
        r.prims.forEach(function (x) {
          x.view = w.view.id;
          prims.push(x);
          if (x.a) { grow(x.a); grow(x.b); }
          if (x.k === 'circle') { grow([x.c[0] - x.r, x.c[1] - x.r]); grow([x.c[0] + x.r, x.c[1] + x.r]); }
          if (x.k === 'text') { var tw = textWidth(x.text, x.h); grow(x.p); grow([x.p[0] + (x.anchor === 'end' ? -tw : tw), x.p[1] + x.h]); }
        });
        annotations.push({ id: an.id, view: w.view.id, index: i, type: an.type, style: an.style || null, auto: !!an.auto, text: r.text, dangling: r.dangling, box: bx, info: r.info });
      });
    });
    return { size: S, units: units, prims: prims, views: views, dims: dims, projections: projections, scale: scale, bom: bom, balloons: balloons, annotations: annotations };
  }
  function layerName(v, used) {
    var base = v.kind === 'section' ? 'SECTION_' + v.label : v.kind === 'detail' ? 'DETAIL_' + v.label : String(v.orient).toUpperCase(), name = base, n = 2;
    while (used[name]) name = base + '_' + n++;
    used[name] = true;
    return name;
  }
  // Paper-space primitives of one dimension. Linear dimensions stack outward from the view box (10 mm, then 8 mm
  // steps) so two on the same side do not overlap; diameters get a 45° leader with the arrow on the circle.
  // Dimension properties: at (the dimension line, model units across it), tx (text slid along the line, paper),
  // lead (a leader's elbow from the circle centre / chamfer, paper), off (an aligned dimension's offset), flip
  // (arrows outside), tol / prec / label (dimLabel). The effective values are written back (lineAt, leadNow, offNow)
  // for dragging.
  // placements an automatically placed radius / diameter tries in turn, first clear one wins (placeDim):
  // radius [fraction along the arc, leader length mm]; diameter [turn of the leader degrees, leader length mm, 1]: a
  // short leader with the text beside the circle (on empty paper, inside the view if need be), then [turn, extra run
  // mm]: the leader runs out past the view outline
  var ALT_RAD = [[0.5, 8], [0.5, 16], [0.25, 8], [0.75, 8], [0.25, 16], [0.75, 16], [0.1, 12], [0.9, 12], [0.5, 26], [0.25, 26], [0.75, 26]];
  var ALT_DIA = [[0, 5, 1], [0, 10, 1], [30, 5, 1], [-30, 5, 1], [60, 6, 1], [-60, 6, 1], [90, 6, 1], [-90, 6, 1], [180, 6, 1], [135, 6, 1], [-135, 6, 1],
    [0, 0], [0, 8], [20, 0], [-20, 0], [20, 8], [-20, 8], [40, 0], [-40, 0], [0, 16], [40, 10], [-40, 10]];
  // the paper rectangle a text primitive covers
  function textRect(x) {
    var w = textWidth(x.text, x.h), vert = Math.abs(x.rot || 0) > 45, r = { x0: x.p[0], y0: x.p[1], x1: x.p[0], y1: x.p[1] };
    function g(q) { r.x0 = Math.min(r.x0, q[0]); r.x1 = Math.max(r.x1, q[0]); r.y0 = Math.min(r.y0, q[1]); r.y1 = Math.max(r.y1, q[1]); }
    if (vert) { g([x.p[0] - x.h, x.p[1] - w / 2]); g([x.p[0], x.p[1] + w / 2]); }
    else { var s = x.anchor === 'middle' ? -w / 2 : x.anchor === 'end' ? -w : 0; g([x.p[0] + s, x.p[1]]); g([x.p[0] + s + w, x.p[1] + x.h]); }
    return r;
  }
  function rectsMeet(a, b, m) { return a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.y0 < b.y1 + m && b.y0 < a.y1 + m; }
  function segHitsRect(a, b, r) {
    var t0 = 0, t1 = 1, dx = b[0] - a[0], dy = b[1] - a[1];
    var ps = [-dx, dx, -dy, dy], qs = [a[0] - r.x0, r.x1 - a[0], a[1] - r.y0, r.y1 - a[1]];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(ps[i]) < 1e-15) { if (qs[i] < 0) return false; continue; }
      var t = qs[i] / ps[i];
      if (ps[i] < 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
      if (t0 > t1) return false;
    }
    return true;
  }
  // texts and lines of a dimension's primitives
  function primGeo(p) {
    var g = { texts: [], segs: [] };
    p.forEach(function (x) { if (x.k === 'text') g.texts.push(textRect(x)); else if (x.k === 'line') g.segs.push([x.a, x.b]); });
    return g;
  }
  // how badly a dimension's geometry g collides with what is on the sheet already (obs: { texts, segs, geo: { segs,
  // circles } (the views' drawn geometry), boxes: [{ box, view }], sheet }); own: the dimension's view, whose empty
  // paper its text may use
  function clashCost(g, obs, k, own) {
    var c = 0, m = 0.8 * k;
    g.texts.forEach(function (t) {
      var tm = { x0: t.x0 - m / 2, y0: t.y0 - m / 2, x1: t.x1 + m / 2, y1: t.y1 + m / 2 };
      obs.texts.forEach(function (o) { if (rectsMeet(t, o, m)) c += 10; });
      obs.segs.forEach(function (s) { if (segHitsRect(s[0], s[1], tm)) c += 3; });
      obs.boxes.forEach(function (b) { if ((b.view == null || b.view !== own) && rectsMeet(t, b.box, 0)) c += 6; });
      if (obs.geo) {
        obs.geo.segs.forEach(function (s) { if (segHitsRect(s[0], s[1], tm)) c += 4; });
        obs.geo.circles.forEach(function (ci) {
          // the outline crosses the rectangle: its nearest point inside the circle, its farthest outside
          var nx = Math.max(tm.x0, Math.min(ci.c[0], tm.x1)), ny = Math.max(tm.y0, Math.min(ci.c[1], tm.y1));
          var fx = Math.max(Math.abs(tm.x0 - ci.c[0]), Math.abs(tm.x1 - ci.c[0])), fy = Math.max(Math.abs(tm.y0 - ci.c[1]), Math.abs(tm.y1 - ci.c[1]));
          if (Math.hypot(nx - ci.c[0], ny - ci.c[1]) <= ci.r && Math.hypot(fx, fy) >= ci.r) c += 4;
        });
      }
      if (obs.sheet && (t.x0 < obs.sheet.x0 || t.y0 < obs.sheet.y0 || t.x1 > obs.sheet.x1 || t.y1 > obs.sheet.y1)) c += 20;
    });
    g.segs.forEach(function (s) { obs.texts.forEach(function (o) { if (segHitsRect(s[0], s[1], o)) c += 3; }); });
    return c;
  }
  // dimPrims for a dimension, an unplaced radius / diameter (no dragged leader) trying ALT_* until it is clear
  function placeDim(d, vw, k, placed, obs) {
    if ((d.kind !== 'rad' && d.kind !== 'dia') || d.lead || !obs) return dimPrims(d, vw, k, placed);
    var alts = d.kind === 'rad' ? ALT_RAD : ALT_DIA, best = 0, bestCost = Infinity;
    for (var i = 0; i < alts.length; i++) {
      d._alt = i;
      var c = clashCost(primGeo(dimPrims(d, vw, k, placed)), obs, k, d.view);
      if (c < bestCost) { best = i; bestCost = c; }
      if (c === 0) break;
    }
    d._alt = best;
    var p = dimPrims(d, vw, k, placed);
    delete d._alt;
    return p;
  }
  function dimPrims(d, vw, k, placed) {
    var out = [], L = 'DIMENSIONS', th = 3.5 * k, ar = 3 * k, aw = 0.9 * k, units = k === 1 ? 'mm' : 'in';
    function line(a, b) { out.push({ k: 'line', a: a, b: b, layer: L, style: 'thin' }); }
    function arrow(tip, dir) {
      var n = [-dir[1], dir[0]];
      out.push({ k: 'fill', pts: [tip, [tip[0] - dir[0] * ar + n[0] * aw, tip[1] - dir[1] * ar + n[1] * aw], [tip[0] - dir[0] * ar - n[0] * aw, tip[1] - dir[1] * ar - n[1] * aw]], layer: L });
    }
    // the dimension text at p (anchor, rotation): one text, or the value with its tolerance stacked beside it
    function label(p, anchor, rot, lab) {
      if (lab.upper == null) { out.push({ k: 'text', p: p, h: th, text: lab.main, anchor: anchor, layer: L, rot: rot }); return; }
      var a = rot * Math.PI / 180, t = [Math.cos(a), Math.sin(a)], n = [-t[1], t[0]], th2 = lab.main == null ? th * 0.8 : th * 0.7;
      var wm = lab.main == null ? 0 : textWidth(lab.main, th), gp = lab.main == null ? 0 : th * 0.4, wt = Math.max(textWidth(lab.upper, th2), textWidth(lab.lower, th2));
      var W = wm + gp + wt, s0 = anchor === 'middle' ? -W / 2 : anchor === 'end' ? -W : 0;
      function at(al, up) { return [p[0] + t[0] * al + n[0] * up, p[1] + t[1] * al + n[1] * up]; }
      if (lab.main != null) out.push({ k: 'text', p: at(s0, 0), h: th, text: lab.main, anchor: 'start', layer: L, rot: rot });
      var up = lab.main == null ? th * 0.55 : th * 0.55, dn = lab.main == null ? -th * 0.45 : -th * 0.2;
      out.push({ k: 'text', p: at(s0 + wm + gp, up), h: th2, text: lab.upper, anchor: 'start', layer: L, rot: rot, tol: 'upper' });
      out.push({ k: 'text', p: at(s0 + wm + gp, dn), h: th2, text: lab.lower, anchor: 'start', layer: L, rot: rot, tol: 'lower' });
    }
    var box = vw.box, labMain = d.tol || d.prec != null || d.label != null || d.kind === 'chamfer' ? dimLabel(d, units) : { main: d.text, upper: null, lower: null };
    // a straight leader from `tip` (arrow) to `elbow`, a shelf and the text above it
    function leader(tip, elbow, lab, arrowDir) {
      var sgn = elbow[0] >= tip[0] - 1e-9 ? 1 : -1, tw = Math.max(textWidth(lab.main || '', th), lab.upper != null ? textWidth(lab.upper, th * 0.7) + textWidth(lab.main || '', th) + th * 0.4 : 0), end = [elbow[0] + sgn * (tw + 2 * k), elbow[1]];
      line(tip, elbow); line(elbow, end); arrow(tip, arrowDir);
      label([elbow[0] + sgn * 1 * k, elbow[1] + 1 * k], sgn > 0 ? 'start' : 'end', 0, lab);
    }
    if (d.kind === 'rad') {
      // a radius: the leader leaves the arc at its middle, straight out from the centre; arrow on the arc
      // (an unplaced one tries other points along the arc and longer leaders until it is clear of the others: d._alt)
      var ralt = ALT_RAD[d._alt || 0] || ALT_RAD[0], ra0 = d.a0 || 0, ra1 = d.a1 != null ? d.a1 : 360;
      var rc = vw.toSheet(d.c), rr = d.r * vw.scale, am = (ra0 + (ra1 - ra0) * ralt[0]) * Math.PI / 180, ru;
      if (d.lead) { var rl = Math.hypot(d.lead[0], d.lead[1]) || 1; ru = [d.lead[0] / rl, d.lead[1] / rl]; }
      else ru = [Math.cos(am), Math.sin(am)];
      var rtip = [rc[0] + ru[0] * rr, rc[1] + ru[1] * rr], rel = d.lead ? [rc[0] + d.lead[0], rc[1] + d.lead[1]] : [rtip[0] + ru[0] * ralt[1] * k, rtip[1] + ru[1] * ralt[1] * k];
      leader(rtip, rel, labMain, [-ru[0], -ru[1]]);
      d.leadNow = [rel[0] - rc[0], rel[1] - rc[1]];
      return out;
    }
    if (d.kind === 'dia') {
      // leaders of one view fan out (45°, 135°, -45°, -135°, …) and run past the view outline so concentric callouts
      // do not cross each other; the shelf points away from the view
      var nth = placed.filter(function (p) { return p.view === d.view && p.kind === 'dia'; }).length;
      var c = vw.toSheet(d.c), r = d.r * vw.scale, mid = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
      var off = [c[0] - mid[0], c[1] - mid[1]], offL = Math.hypot(off[0], off[1]), u, elbow, conc = 0;
      if (d.lead) {
        var ll = Math.hypot(d.lead[0], d.lead[1]) || 1;
        u = [d.lead[0] / ll, d.lead[1] / ll]; elbow = [c[0] + d.lead[0], c[1] + d.lead[1]];
      } else {
        if (offL > r * 0.5) {
          // an off-centre circle: straight out from the view; concentric ones (a counterbore) fan upward 60°, 80°
          // (hole callouts leave at 35°, between them)
          u = [off[0] / offL, off[1] / offL];
          conc = placed.filter(function (p) { return p.view === d.view && p.kind === 'dia' && Math.hypot(p.c[0] - d.c[0], p.c[1] - d.c[1]) <= 1e-9 * (1 + Math.abs(d.c[0]) + Math.abs(d.c[1])); }).length;
          if (conc) { var fa = (u[0] >= 0 ? 1 : -1) * [60, 80, -35, -60][(conc - 1) % 4] * Math.PI / 180; u = [u[0] * Math.cos(fa) - u[1] * Math.sin(fa), u[0] * Math.sin(fa) + u[1] * Math.cos(fa)]; }
        }
        else { var ang = [45, 135, -45, -135, 70, 110, -70, -110][nth % 8] * Math.PI / 180; u = [Math.cos(ang), Math.sin(ang)]; }
        // an unplaced one that would cover another dimension turns and / or runs further (d._alt)
        var dalt = ALT_DIA[d._alt || 0] || ALT_DIA[0];
        if (dalt[0]) { var ra = dalt[0] * Math.PI / 180; u = [u[0] * Math.cos(ra) - u[1] * Math.sin(ra), u[0] * Math.sin(ra) + u[1] * Math.cos(ra)]; }
        var tip0 = [c[0] + u[0] * r, c[1] + u[1] * r];
        if (dalt[2]) elbow = [tip0[0] + u[0] * dalt[1] * k, tip0[1] + u[1] * dalt[1] * k];   // short, beside the circle
        else {
          // run from the tip past the view outline (6 mm), and past the overall-dimension lanes on the left and below
          var tx = Math.abs(u[0]) < 1e-9 ? Infinity : u[0] > 0 ? (box.x1 - tip0[0]) / u[0] : (box.x0 - tip0[0]) / u[0];
          var ty = Math.abs(u[1]) < 1e-9 ? Infinity : u[1] > 0 ? (box.y1 - tip0[1]) / u[1] : (box.y0 - tip0[1]) / u[1];
          var run = Math.max(0, Math.min(tx, ty)) + (6 + 4 * Math.floor(nth / 4) + dalt[1]) * k;
          if (u[0] < -0.2 && !conc) run = Math.max(run, (box.x0 - 24 * k - tip0[0]) / u[0]);
          if (u[1] < -0.2 && !conc) run = Math.max(run, (box.y0 - 24 * k - tip0[1]) / u[1]);
          elbow = [tip0[0] + u[0] * run, tip0[1] + u[1] * run];
        }
      }
      // flipped: the leader crosses the circle and the arrow meets the far side from inside
      var tip = d.flip ? [c[0] - u[0] * r, c[1] - u[1] * r] : [c[0] + u[0] * r, c[1] + u[1] * r];
      var sgd = (d.lead ? d.lead[0] : u[0]) >= 0 ? 1 : -1;
      var tw = textWidth(labMain.main || '', th) + (labMain.upper != null ? th * 0.4 + textWidth(labMain.upper, th * 0.7) : 0), end = [elbow[0] + sgd * (tw + 2 * k), elbow[1]];
      line(tip, elbow); line(elbow, end); arrow(tip, [-u[0], -u[1]]);
      label([elbow[0] + sgd * 1 * k, elbow[1] + 1 * k], sgd > 0 ? 'start' : 'end', 0, labMain);
      d.leadNow = [elbow[0] - c[0], elbow[1] - c[1]];
      return out;
    }
    if (d.kind === 'chamfer') {
      var A = vw.toSheet(d.a), B = vw.toSheet(d.b), m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], cc = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
      var lead = d.lead || [(m[0] >= cc[0] ? 1 : -1) * 10 * k, (m[1] >= cc[1] ? 1 : -1) * 10 * k], el = [m[0] + lead[0], m[1] + lead[1]], lu = Math.hypot(lead[0], lead[1]) || 1;
      leader(m, el, labMain, [-lead[0] / lu, -lead[1] / lu]);
      d.leadNow = lead.slice();
      return out;
    }
    var gapE = 1.5 * k, ext = 2 * k;
    // a linear dimension between sheet points a and b, horizontal (hz) or vertical, its dimension line at pos
    function linear(a, b, hz, pos, lab, tx) {
      var i0 = hz ? 0 : 1, i1 = hz ? 1 : 0, sg = pos < a[i1] ? -1 : 1;
      function P(along, across) { var q = [0, 0]; q[i0] = along; q[i1] = across; return q; }
      line(P(a[i0], a[i1] + sg * gapE), P(a[i0], pos + sg * ext)); line(P(b[i0], b[i1] + sg * gapE), P(b[i0], pos + sg * ext));
      var dir = b[i0] >= a[i0] ? 1 : -1, xo = ar + 4 * k;
      if (d.flip) line(P(a[i0] - dir * xo, pos), P(b[i0] + dir * xo, pos)); else line(P(a[i0], pos), P(b[i0], pos));
      var fa = P(-dir, 0), fb = P(dir, 0);
      if (d.flip) { arrow(P(a[i0], pos), fb); arrow(P(b[i0], pos), fa); } else { arrow(P(a[i0], pos), fa); arrow(P(b[i0], pos), fb); }
      if (hz) label([(a[0] + b[0]) / 2 + (tx || 0), pos + 1 * k], 'middle', 0, lab);
      else label([pos - 1 * k, (a[1] + b[1]) / 2 + (tx || 0)], 'middle', 90, lab);
    }
    if (d.kind === 'ordinate' || d.kind === 'baseline') {
      var hz2 = d.dir !== 'v', ax = hz2 ? 0 : 1, items = [{ ref: d.base, val: 0 }].concat(d.refs.map(function (r2, i) { return { ref: r2, val: (d.values || [])[i] || 0 }; }));
      var side = d.side || 1, sp = function (ref) { return ref.kind === 'dia' ? vw.toSheet(ref.c) : null; };
      // the feature point of a reference: a circle centre, or the end of an edge nearest the dimension side
      items.forEach(function (it) {
        var q = sp(it.ref);
        if (!q) { var e0 = vw.toSheet(it.ref.a), e1 = vw.toSheet(it.ref.b); q = (e0[1 - ax] - e1[1 - ax]) * side > 0 ? e0 : e1; if (Math.abs(e0[1 - ax] - e1[1 - ax]) < 1e-9) q = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2]; q[ax] = vw.toSheet(ax ? [0, refPos(it.ref, 1)] : [refPos(it.ref, 0), 0])[ax]; }
        it.p = q;
      });
      var lvl = d.at != null ? vw.toSheet(hz2 ? [0, d.at] : [d.at, 0])[1 - ax] : (hz2 ? (side > 0 ? box.y1 : box.y0) : (side > 0 ? box.x1 : box.x0)) + side * 10 * k;
      d.lineAt = hz2 ? vw.fromSheet([0, lvl])[1] : vw.fromSheet([lvl, 0])[0];
      var prec = d.prec != null && d.prec !== '' ? +d.prec : null;
      if (d.kind === 'ordinate') {
        // texts on one line across the dimension direction; crowded ones jog sideways
        var sorted = items.slice().sort(function (p, q) { return p.p[ax] - q.p[ax]; }), minGap = th * 1.4;
        sorted.forEach(function (it, i) { it.t = it.p[ax]; if (i && it.t < sorted[i - 1].t + minGap) it.t = sorted[i - 1].t + minGap; });
        var shift = (sorted[0].p[ax] + sorted[sorted.length - 1].p[ax] - sorted[0].t - sorted[sorted.length - 1].t) / 2;
        if (shift < 0) sorted.forEach(function (it) { it.t += shift; });
        sorted.forEach(function (it) {
          function Q(along, across) { var q = [0, 0]; q[ax] = along; q[1 - ax] = across; return q; }
          var from = it.p[1 - ax] + (lvl > it.p[1 - ax] ? 1 : -1) * gapE, sgl = lvl > it.p[1 - ax] ? 1 : -1;
          if (Math.abs(it.t - it.p[ax]) < 1e-9) line(Q(it.p[ax], from), Q(it.p[ax], lvl));
          else { line(Q(it.p[ax], from), Q(it.p[ax], lvl - sgl * 4 * k)); line(Q(it.p[ax], lvl - sgl * 4 * k), Q(it.t, lvl - sgl * 2 * k)); line(Q(it.t, lvl - sgl * 2 * k), Q(it.t, lvl)); }
          var tt = numText(Math.abs(it.val), units, prec);
          if (hz2) out.push({ k: 'text', p: [it.t + th / 2, lvl + sgl * 1 * k], h: th, text: tt, anchor: sgl > 0 ? 'start' : 'end', layer: L, rot: 90 });
          else out.push({ k: 'text', p: [lvl + sgl * 1 * k, it.t - th / 2], h: th, text: tt, anchor: sgl > 0 ? 'start' : 'end', layer: L, rot: 0 });
        });
      } else {
        // baseline: one linear dimension per reference from the base, nearest first, 8 mm apart
        var bp = items[0].p, rest = items.slice(1).sort(function (p, q) { return Math.abs(p.val) - Math.abs(q.val); });
        rest.forEach(function (it, i) {
          var pos = lvl + side * 8 * k * i;
          var lab = d.tol || d.label != null ? dimLabel(Object.assign({}, d, { kind: 'h', value: Math.abs(it.val) }), units) : { main: numText(Math.abs(it.val), units, prec), upper: null, lower: null };
          var a2 = bp.slice(), b2 = it.p.slice();
          linear(a2, b2, hz2, pos, lab, 0);
        });
      }
      return out;
    }
    var a = vw.toSheet(d.a), b = vw.toSheet(d.b);
    var same = placed.filter(function (p) { return p.view === d.view && p.kind === d.kind && p.side === d.side; }).length;
    var offs = (10 + 8 * same) * k;
    if (d.kind === 'h') {
      var y = d.side < 0 ? box.y0 - offs : box.y1 + offs;
      if (d.at != null) y = vw.toSheet([0, d.at])[1];
      linear(a, b, true, y, labMain, d.tx);
      d.lineAt = vw.fromSheet([0, y])[1];
    } else if (d.kind === 'v') {
      var x = d.side < 0 ? box.x0 - offs : box.x1 + offs;
      if (d.at != null) x = vw.toSheet([d.at, 0])[0];
      linear(a, b, false, x, labMain, d.tx);
      d.lineAt = vw.fromSheet([x, 0])[0];
    } else if (d.kind === 'aligned') {
      var dx = b[0] - a[0], dy = b[1] - a[1], Ln = Math.hypot(dx, dy) || 1, t = [dx / Ln, dy / Ln], n0 = [-t[1], t[0]], n = n0;
      // offset away from the view centre, or where it was dragged to
      var mid2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cc2 = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2], o = 8 * k;
      if (d.off != null) { o = Math.abs(d.off); if (d.off < 0) n = [-n0[0], -n0[1]]; }
      else if ((mid2[0] - cc2[0]) * n[0] + (mid2[1] - cc2[1]) * n[1] < 0) n = [-n[0], -n[1]];
      d.offNow = o * (n === n0 ? 1 : -1);
      var pa = [a[0] + n[0] * o, a[1] + n[1] * o], pb = [b[0] + n[0] * o, b[1] + n[1] * o];
      line([a[0] + n[0] * gapE, a[1] + n[1] * gapE], [pa[0] + n[0] * ext, pa[1] + n[1] * ext]);
      line([b[0] + n[0] * gapE, b[1] + n[1] * gapE], [pb[0] + n[0] * ext, pb[1] + n[1] * ext]);
      var xo2 = ar + 4 * k;
      if (d.flip) { line([pa[0] - t[0] * xo2, pa[1] - t[1] * xo2], [pb[0] + t[0] * xo2, pb[1] + t[1] * xo2]); arrow(pa, t); arrow(pb, [-t[0], -t[1]]); }
      else { line(pa, pb); arrow(pa, [-t[0], -t[1]]); arrow(pb, t); }
      var ang2 = Math.atan2(t[1], t[0]) * 180 / Math.PI;
      if (ang2 > 90) ang2 -= 180; if (ang2 <= -90) ang2 += 180;
      var ta = ang2 * Math.PI / 180, tt2 = [Math.cos(ta), Math.sin(ta)], sh = d.tx || 0;
      label([(pa[0] + pb[0]) / 2 + n[0] * 1 * k + tt2[0] * sh, (pa[1] + pb[1]) / 2 + n[1] * 1 * k + tt2[1] * sh], 'middle', ang2, labMain);
    }
    return out;
  }
  function textWidth(t, h) { return String(t).length * h * 0.6; }

  // ------------------------------------------------------------------ writers
  function num(x) { return String(Math.round(x * 1e4) / 1e4); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // widths in paper mm
  var STROKE = { visible: 0.5, hidden: 0.35, thin: 0.25, thick: 0.7, hatch: 0.18, chain: 0.7, center: 0.25, tangent: 0.35, tanfont: 0.25 };
  var CENTER_DASH = [6, 1.5, 1.5, 1.5];   // centre marks and centrelines: long dash, short dash (paper mm)
  // plainText(s): text for writers without the ASME symbol glyphs (DXF R12, PDF Helvetica): ↧ 10 -> X 10 DEEP,
  // ⌴ -> CBORE, ⌵ -> CSK (the words the symbols replaced)
  function plainText(t) {
    return String(t).replace(/\u21a7\s*([^\s,]+)/g, 'X $1 DEEP').replace(/\u2334\s*/g, 'CBORE ').replace(/\u2335\s*/g, 'CSK ');
  }
  // SolidWorks draws dangling annotations (their model reference is gone) in olive brown
  var COLORS = { dangling: '#a07c00' }, DXF_COLORS = { dangling: 42 }, PDF_COLORS = { dangling: '0.627 0.486 0' };
  // a CCW arc (degrees) as start / end points
  function arcEnds(p) {
    var a0 = p.a0 * Math.PI / 180, a1 = p.a1 * Math.PI / 180;
    return [[p.c[0] + p.r * Math.cos(a0), p.c[1] + p.r * Math.sin(a0)], [p.c[0] + p.r * Math.cos(a1), p.c[1] + p.r * Math.sin(a1)]];
  }
  // ellipsePrim(el, toSheet, s, layer, style): a projected true circle { c, ax, ay, t0, t1 } (the point at θ is
  // c + cos θ ax + sin θ ay, model units of the view) as a sheet primitive in principal form: { k: 'ellipse', c,
  // major (vector), ratio, t0, t1 } with the point at t = c + cos t major + sin t minor, minor = ratio × major turned
  // 90° CCW, t0 < t1 (the DXF ELLIPSE convention)
  function ellipsePrim(el, toSheet, s, layer, style) {
    var ax = [el.ax[0] * s, el.ax[1] * s], ay = [el.ay[0] * s, el.ay[1] * s];
    var ts = 0.5 * Math.atan2(2 * (ax[0] * ay[0] + ax[1] * ay[1]), ax[0] * ax[0] + ax[1] * ax[1] - ay[0] * ay[0] - ay[1] * ay[1]);
    var M = [ax[0] * Math.cos(ts) + ay[0] * Math.sin(ts), ax[1] * Math.cos(ts) + ay[1] * Math.sin(ts)];
    var N = [-ax[0] * Math.sin(ts) + ay[0] * Math.cos(ts), -ax[1] * Math.sin(ts) + ay[1] * Math.cos(ts)];
    var t0 = el.t0 - ts, t1 = el.t1 - ts;
    if (Math.hypot(N[0], N[1]) > Math.hypot(M[0], M[1])) { var M0 = M; M = N; N = [-M0[0], -M0[1]]; t0 -= Math.PI / 2; t1 -= Math.PI / 2; }
    if (M[0] * N[1] - M[1] * N[0] < 0) { N = [-N[0], -N[1]]; var x = t0; t0 = -t1; t1 = -x; }
    var Ml = Math.hypot(M[0], M[1]), full = !!el.full || t1 - t0 >= TWO_PI - 1e-9;
    if (full) { t0 = 0; t1 = TWO_PI; } else { var sh = Math.floor(t0 / TWO_PI) * TWO_PI; t0 -= sh; t1 -= sh; }
    return { k: 'ellipse', c: toSheet(el.c), major: M, ratio: Ml > 1e-15 ? Math.hypot(N[0], N[1]) / Ml : 0, t0: t0, t1: t1, full: full, layer: layer, style: style };
  }
  // point and derivative of an ellipse primitive at t
  function ellipseAt(p, t) {
    var M = p.major, N = [-M[1] * p.ratio, M[0] * p.ratio], c = Math.cos(t), s = Math.sin(t);
    return { p: [p.c[0] + M[0] * c + N[0] * s, p.c[1] + M[1] * c + N[1] * s], d: [-M[0] * s + N[0] * c, -M[1] * s + N[1] * c] };
  }
  function toSVG(sheet, opts) {
    var P = svgParts(sheet, opts), out = [P.head, P.bg];
    P.groups.forEach(function (g) { out.push(g.open); if (g.body) out.push(g.body); out.push('</g>'); });
    out.push('</svg>');
    return out.join('\n');
  }
  // svgParts(sheet, { live }) -> { head, bg, groups: [{ key, open, body }] }: the SVG in pieces, one group per layer,
  // so the app can patch only the layers that changed (r3/drawings3). With live, a layer that is not a view's
  // (dimensions, annotations, balloons) is split into runs per view (<g data-of="id">), so a dragged view can take
  // its dimensions along with a transform until the sheet is worked out again.
  function svgParts(sheet, opts) {
    opts = opts || {};
    var S = sheet.size, k = sheet.units === 'in' ? 1 / MM : 1, H = S[1];
    function X(p) { return num(p[0]); } function Y(p) { return num(H - p[1]); }
    var dash = num(3 * k) + ' ' + num(1.5 * k), chain = [8, 1.5, 1.5, 1.5].map(function (x) { return num(x * k); }).join(' '), center = CENTER_DASH.map(function (x) { return num(x * k); }).join(' ');
    var res = { head: '<svg xmlns="http://www.w3.org/2000/svg" width="' + num(S[0]) + sheet.units + '" height="' + num(S[1]) + sheet.units + '" viewBox="0 0 ' + num(S[0]) + ' ' + num(S[1]) + '" font-family="Arial, Helvetica, sans-serif">',
      bg: '<rect class="sheet-bg" x="0" y="0" width="' + num(S[0]) + '" height="' + num(S[1]) + '" fill="#fff"/>', groups: [] };
    var groups = {}, gorder = [];
    sheet.prims.forEach(function (p) { if (!groups[p.layer]) { groups[p.layer] = []; gorder.push(p.layer); } groups[p.layer].push(p); });
    gorder.forEach(function (layer) {
      var vw = sheet.views.filter(function (w) { return w.layer === layer; })[0], out = [], run = null;
      var grp = { key: layer, open: '<g data-layer="' + esc(layer) + '"' + (vw ? ' data-view="' + vw.view.id + '" class="dv"' : '') + ' fill="none" stroke="#000" stroke-linecap="round">' };
      res.groups.push(grp);
      var lst = groups[layer];
      lst.forEach(function (p, pi) {
        // a chain of lines (chainLines) is one path: its dashes run on along it
        if (p.k === 'line' && p.chain && lst[pi - 1] && lst[pi - 1].chain === p.chain) return;
        if (p.k === 'line' && p.chain && lst[pi + 1] && lst[pi + 1].chain === p.chain) {
          var pts = [X(p.a) + ' ' + Y(p.a), X(p.b) + ' ' + Y(p.b)];
          for (var pj = pi + 1; lst[pj] && lst[pj].chain === p.chain; pj++) pts.push(X(lst[pj].b) + ' ' + Y(lst[pj].b));
          var dshc = p.style === 'hidden' ? ' stroke-dasharray="' + dash + '"' : p.style === 'tanfont' ? ' stroke-dasharray="' + chain + '"' : '';
          out.push('<path class="' + p.style + '" d="M' + pts.join(' L') + '" stroke-width="' + num((STROKE[p.style] || 0.25) * k) + '" stroke-linejoin="round"' + dshc + '/>');
          return;
        }
        // hatch lines (r6/drawings6): a run of them is one path, each line a move and a relative line-to, so a hatched
        // section is about a third the size of one <line> per hatch line (a dashed pattern's dashes are many lines)
        if (p.k === 'line' && p.style === 'hatch' && !p.color && lst[pi - 1] && lst[pi - 1].k === 'line' && lst[pi - 1].style === 'hatch' && !lst[pi - 1].color) return;
        if (p.k === 'line' && p.style === 'hatch' && !p.color) {
          var hd = [], cx = null, cy = 0, rd = function (x) { return Math.round(x * 1e4) / 1e4; };
          for (var hj = pi; lst[hj] && lst[hj].k === 'line' && lst[hj].style === 'hatch' && !lst[hj].color; hj++) {
            // relative moves from the point drawn so far (rounded), so the numbers stay short and errors never add up
            var ax = lst[hj].a[0], ay = H - lst[hj].a[1], bx = lst[hj].b[0], by = H - lst[hj].b[1], mx, my, lx, ly;
            if (cx === null) { cx = rd(ax); cy = rd(ay); hd.push('M' + num(cx) + ' ' + num(cy)); }
            else { mx = rd(ax - cx); my = rd(ay - cy); cx += mx; cy += my; hd.push('m' + num(mx) + ' ' + num(my)); }
            lx = rd(bx - cx); ly = rd(by - cy); cx += lx; cy += ly; hd.push('l' + num(lx) + ' ' + num(ly));
          }
          out.push('<path class="hatch" d="' + hd.join('') + '" stroke-width="' + num(STROKE.hatch * k) + '"/>');
          return;
        }
        if (opts.live && !vw) {
          var of = p.view != null ? String(p.view) : null;
          if (of !== run) { if (run != null) out.push('</g>'); if (of != null) out.push('<g data-of="' + of + '">'); run = of; }
        }
        var sw = num((STROKE[p.style] || 0.25) * k), cls = p.style ? ' class="' + p.style + '"' : '';
        var dsh = p.style === 'hidden' ? ' stroke-dasharray="' + dash + '"' : p.style === 'chain' || p.style === 'tanfont' ? ' stroke-dasharray="' + chain + '"' : p.style === 'center' ? ' stroke-dasharray="' + center + '"' : '';
        var col = p.color && COLORS[p.color];
        if (col) { dsh += p.k === 'fill' || p.k === 'text' ? '' : ' stroke="' + col + '"'; cls += ' data-color="' + p.color + '"'; }
        if (p.k === 'arc') {
          // two halves, so an arc of nearly 360° (its ends a rounding step apart) is not dropped by the viewer
          var span = ((p.a1 - p.a0) % 360 + 360) % 360;
          if (span < 1e-9 && p.a1 !== p.a0) span = 360;
          var ae = arcEnds({ c: p.c, r: p.r, a0: p.a0, a1: p.a0 + span / 2 }), ae2 = arcEnds({ c: p.c, r: p.r, a0: p.a0, a1: p.a0 + span }), ra = ' A' + num(p.r) + ' ' + num(p.r) + ' 0 0 0 ';
          out.push('<path' + cls + ' d="M' + X(ae[0]) + ' ' + Y(ae[0]) + ra + X(ae[1]) + ' ' + Y(ae[1]) + ra + X(ae2[1]) + ' ' + Y(ae2[1]) + '" stroke-width="' + sw + '"' + dsh + '/>');
        } else if (p.k === 'ellipse') {
          var rx = Math.hypot(p.major[0], p.major[1]), ry = rx * p.ratio, rot = -Math.atan2(p.major[1], p.major[0]) * 180 / Math.PI;
          if (p.full) out.push('<ellipse' + cls + ' cx="' + X(p.c) + '" cy="' + Y(p.c) + '" rx="' + num(rx) + '" ry="' + num(ry) + '" transform="rotate(' + num(rot) + ' ' + X(p.c) + ' ' + Y(p.c) + ')" stroke-width="' + sw + '"' + dsh + '/>');
          else {
            var e0 = ellipseAt(p, p.t0).p, em = ellipseAt(p, (p.t0 + p.t1) / 2).p, e1 = ellipseAt(p, p.t1).p, ea = ' A' + num(rx) + ' ' + num(ry) + ' ' + num(rot) + ' 0 0 ';
            out.push('<path' + cls + ' d="M' + X(e0) + ' ' + Y(e0) + ea + X(em) + ' ' + Y(em) + ea + X(e1) + ' ' + Y(e1) + '" stroke-width="' + sw + '"' + dsh + '/>');
          }
        } else if (p.k === 'line') out.push('<line' + cls + ' x1="' + X(p.a) + '" y1="' + Y(p.a) + '" x2="' + X(p.b) + '" y2="' + Y(p.b) + '" stroke-width="' + sw + '"' + dsh + '/>');
        else if (p.k === 'circle') out.push('<circle' + cls + ' cx="' + X(p.c) + '" cy="' + Y(p.c) + '" r="' + num(p.r) + '" stroke-width="' + sw + '"' + dsh + '/>');
        else if (p.k === 'fill') out.push('<path' + (col ? ' data-color="' + p.color + '"' : '') + ' d="M' + p.pts.map(function (q) { return X(q) + ' ' + Y(q); }).join(' L') + ' Z" fill="' + (col || '#000') + '" stroke="none"/>');
        else if (p.k === 'text') {
          var tr = p.rot ? ' transform="rotate(' + num(-p.rot) + ' ' + X(p.p) + ' ' + Y(p.p) + ')"' : '';
          out.push('<text x="' + X(p.p) + '" y="' + Y(p.p) + '" font-size="' + num(p.h) + '" text-anchor="' + p.anchor + '" fill="' + (col || '#000') + '" stroke="none"' + tr + (col ? ' data-color="' + p.color + '"' : '') + '>' + esc(p.text) + '</text>');
        }
      });
      if (run != null) out.push('</g>');
      grp.body = out.join('\n');
    });
    return res;
  }

  // DXF R12: one layer per drawing view (FRONT, TOP, RIGHT, ISOMETRIC…), plus DIMENSIONS and SHEET; hidden edges use
  // the HIDDEN linetype. Paper units ($INSUNITS 4 = mm, 1 = in).
  function toDXF(sheet) {
    var L = [];
    function pr(c, v) { L.push(String(c), String(v)); }
    var layers = [];
    sheet.prims.forEach(function (p) { if (layers.indexOf(p.layer) < 0) layers.push(p.layer); });
    var colors = { SHEET: 7, DIMENSIONS: 3, BOM: 7, BALLOONS: 3, ANNOTATIONS: 3 }, THIN = { hatch: 1, tangent: 1, tanfont: 1, center: 1 };
    pr(0, 'SECTION'); pr(2, 'HEADER');
    pr(9, '$ACADVER'); pr(1, 'AC1009');
    pr(9, '$INSUNITS'); pr(70, sheet.units === 'in' ? 1 : 4);
    pr(9, '$MEASUREMENT'); pr(70, sheet.units === 'in' ? 0 : 1);
    pr(9, '$EXTMIN'); pr(10, 0); pr(20, 0); pr(30, 0);
    pr(9, '$EXTMAX'); pr(10, num(sheet.size[0])); pr(20, num(sheet.size[1])); pr(30, 0);
    pr(9, '$LTSCALE'); pr(40, sheet.units === 'in' ? 0.04 : 1);
    pr(0, 'ENDSEC');
    pr(0, 'SECTION'); pr(2, 'TABLES');
    var useCenter = sheet.prims.some(function (p) { return p.style === 'center'; });   // CENTER only when a centre mark / line uses it
    pr(0, 'TABLE'); pr(2, 'LTYPE'); pr(70, useCenter ? 4 : 3);
    pr(0, 'LTYPE'); pr(2, 'CONTINUOUS'); pr(70, 0); pr(3, 'Solid line'); pr(72, 65); pr(73, 0); pr(40, 0);
    pr(0, 'LTYPE'); pr(2, 'HIDDEN'); pr(70, 0); pr(3, '__ __ __ __'); pr(72, 65); pr(73, 2); pr(40, 4.5); pr(49, 3); pr(49, -1.5);
    pr(0, 'LTYPE'); pr(2, 'PHANTOM'); pr(70, 0); pr(3, '____ _ ____ _'); pr(72, 65); pr(73, 4); pr(40, 12.5); pr(49, 8); pr(49, -1.5); pr(49, 1.5); pr(49, -1.5);
    if (useCenter) { pr(0, 'LTYPE'); pr(2, 'CENTER'); pr(70, 0); pr(3, '____ _ ____ _'); pr(72, 65); pr(73, 4); pr(40, 10.5); pr(49, 6); pr(49, -1.5); pr(49, 1.5); pr(49, -1.5); }
    pr(0, 'ENDTAB');
    pr(0, 'TABLE'); pr(2, 'LAYER'); pr(70, layers.length);
    layers.forEach(function (n) {
      // view layers plot black / white (7) like the sheet; thin lines (hatch, tangent edges, centre marks) on them are
      // colour 8, so a plot-by-colour pen table gives the thick / thin weights (R12 has no lineweights) (r5/drawings5)
      var col = colors[n] || 7;
      pr(0, 'LAYER'); pr(2, n); pr(70, 0); pr(62, col); pr(6, 'CONTINUOUS');
    });
    pr(0, 'ENDTAB');
    pr(0, 'ENDSEC');
    pr(0, 'SECTION'); pr(2, 'ENTITIES');
    sheet.prims.forEach(function (p) {
      var ltn = p.style === 'hidden' ? 'HIDDEN' : p.style === 'chain' || p.style === 'tanfont' ? 'PHANTOM' : p.style === 'center' ? 'CENTER' : null, dc = p.color && DXF_COLORS[p.color] || (THIN[p.style] && !colors[p.layer] ? 8 : 0);
      var lt = function () { if (ltn) pr(6, ltn); if (dc) pr(62, dc); };
      // hatch lines leave out z (30 / 31, default 0): a dashed hatch pattern is thousands of lines (r6/drawings6)
      if (p.k === 'line' && p.style === 'hatch') { pr(0, 'LINE'); pr(8, p.layer); lt(); pr(10, num(p.a[0])); pr(20, num(p.a[1])); pr(11, num(p.b[0])); pr(21, num(p.b[1])); }
      else if (p.k === 'line') { pr(0, 'LINE'); pr(8, p.layer); lt(); pr(10, num(p.a[0])); pr(20, num(p.a[1])); pr(30, 0); pr(11, num(p.b[0])); pr(21, num(p.b[1])); pr(31, 0); }
      else if (p.k === 'circle') { pr(0, 'CIRCLE'); pr(8, p.layer); lt(); pr(10, num(p.c[0])); pr(20, num(p.c[1])); pr(30, 0); pr(40, num(p.r)); }
      else if (p.k === 'arc') { pr(0, 'ARC'); pr(8, p.layer); lt(); pr(10, num(p.c[0])); pr(20, num(p.c[1])); pr(30, 0); pr(40, num(p.r)); pr(50, num(((p.a0 % 360) + 360) % 360)); pr(51, num(((p.a1 % 360) + 360) % 360)); }
      else if (p.k === 'ellipse') {
        // DXF R12 has no ELLIPSE entity: a 2D POLYLINE through points on the exact ellipse (chord error under 0.01 mm)
        var Rm = Math.hypot(p.major[0], p.major[1]), tolE = 0.01 * (sheet.units === 'in' ? 1 / MM : 1), sw = p.t1 - p.t0;
        var step = Rm > tolE ? 2 * Math.acos(Math.max(-1, 1 - tolE / Rm)) : Math.PI / 4, n = Math.max(8, Math.min(720, Math.ceil(sw / step)));
        pr(0, 'POLYLINE'); pr(8, p.layer); lt(); pr(66, 1); pr(10, 0); pr(20, 0); pr(30, 0); pr(70, p.full ? 1 : 0);
        for (var i = 0; i < (p.full ? n : n + 1); i++) { var ep = ellipseAt(p, p.t0 + sw * i / n).p; pr(0, 'VERTEX'); pr(8, p.layer); pr(10, num(ep[0])); pr(20, num(ep[1])); pr(30, 0); }
        pr(0, 'SEQEND'); pr(8, p.layer);
      } else if (p.k === 'fill') {
        pr(0, 'SOLID'); pr(8, p.layer); lt();
        var q = [p.pts[0], p.pts[1], p.pts[2], p.pts[2]];
        q.forEach(function (pt, i) { pr(10 + i, num(pt[0])); pr(20 + i, num(pt[1])); pr(30 + i, 0); });
      } else if (p.k === 'text') {
        pr(0, 'TEXT'); pr(8, p.layer); lt(); pr(10, num(p.p[0])); pr(20, num(p.p[1])); pr(30, 0); pr(40, num(p.h)); pr(1, plainText(p.text).replace(/\u00d8/g, '%%c').replace(/\u00b1/g, '%%p').replace(/\u00b0/g, '%%d').replace(/\u00d7/g, 'x').replace(/[^\x20-\x7e]/g, '?'));
        if (p.rot) pr(50, num(p.rot));
        if (p.anchor !== 'start') { pr(72, p.anchor === 'middle' ? 1 : 2); pr(11, num(p.p[0])); pr(21, num(p.p[1])); pr(31, 0); }
      }
    });
    pr(0, 'ENDSEC'); pr(0, 'EOF');
    return L.join('\n');
  }

  // PDF 1.4, one page at the sheet's real size, Helvetica (WinAnsi) text; pure ASCII so it survives a text Blob.
  function toPDF(sheet) {
    var ptPer = sheet.units === 'in' ? 72 : 72 / MM, k = sheet.units === 'in' ? 1 / MM : 1;
    function P(x) { return num(x * ptPer); }
    var c = ['1 J 1 j'];
    var dash = [3 * k * ptPer, 1.5 * k * ptPer];
    var cur = null, curCol = '0 0 0', chain = [8, 1.5, 1.5, 1.5].map(function (x) { return num(x * k * ptPer); }).join(' '), center = CENTER_DASH.map(function (x) { return num(x * k * ptPer); }).join(' ');
    function style(s) {
      if (s === cur) return; cur = s;
      c.push(num((STROKE[s] || 0.25) * k * ptPer) + ' w ' + (s === 'hidden' ? '[' + num(dash[0]) + ' ' + num(dash[1]) + '] 0 d' : s === 'chain' || s === 'tanfont' ? '[' + chain + '] 0 d' : s === 'center' ? '[' + center + '] 0 d' : '[] 0 d'));
    }
    function color(p) {
      var col = p.color && PDF_COLORS[p.color] || '0 0 0';
      if (col === curCol) return; curCol = col;
      c.push(col + ' RG ' + col + ' rg');
    }
    // a CCW arc as cubic Beziers of at most 90 degrees
    function arcPath(p) {
      var a0 = p.a0 * Math.PI / 180, sweep = (((p.a1 - p.a0) % 360) + 360) % 360 * Math.PI / 180 || 2 * Math.PI, n = Math.ceil(sweep / (Math.PI / 2) - 1e-9), da = sweep / n;
      var kk = 4 / 3 * Math.tan(da / 4), x = p.c[0], y = p.c[1], r = p.r, s = P(x + r * Math.cos(a0)) + ' ' + P(y + r * Math.sin(a0)) + ' m';
      for (var i = 0; i < n; i++) {
        var t0 = a0 + i * da, t1 = t0 + da;
        s += ' ' + P(x + r * (Math.cos(t0) - kk * Math.sin(t0))) + ' ' + P(y + r * (Math.sin(t0) + kk * Math.cos(t0))) + ' ' +
          P(x + r * (Math.cos(t1) + kk * Math.sin(t1))) + ' ' + P(y + r * (Math.sin(t1) - kk * Math.cos(t1))) + ' ' + P(x + r * Math.cos(t1)) + ' ' + P(y + r * Math.sin(t1)) + ' c';
      }
      return s + ' S';
    }
    // an ellipse primitive as cubic Beziers of at most 90 degrees of its parameter (the affine image of arcPath's)
    function ellipsePath(p) {
      var sw = p.t1 - p.t0, n = Math.max(1, Math.ceil(sw / (Math.PI / 2) - 1e-9)), da = sw / n, kk = 4 / 3 * Math.tan(da / 4);
      var a = ellipseAt(p, p.t0), s = P(a.p[0]) + ' ' + P(a.p[1]) + ' m';
      for (var i = 0; i < n; i++) {
        var b = ellipseAt(p, p.t0 + (i + 1) * da);
        s += ' ' + P(a.p[0] + kk * a.d[0]) + ' ' + P(a.p[1] + kk * a.d[1]) + ' ' + P(b.p[0] - kk * b.d[0]) + ' ' + P(b.p[1] - kk * b.d[1]) + ' ' + P(b.p[0]) + ' ' + P(b.p[1]) + ' c';
        a = b;
      }
      return s + (p.full ? ' h S' : ' S');
    }
    function pdfText(s) {
      var out = '';
      s = plainText(s);
      for (var i = 0; i < s.length; i++) {
        var ch = s.charCodeAt(i);
        if (ch === 0xd8) out += '\\330';
        else if (ch === 0xd7) out += '\\327';
        else if (ch === 0xb1) out += '\\261';
        else if (ch === 0xb0) out += '\\260';
        else if (ch === 40 || ch === 41 || ch === 92) out += '\\' + s[i];
        else if (ch >= 32 && ch < 127) out += s[i];
        else out += '?';
      }
      return out;
    }
    sheet.prims.forEach(function (p, pi) {
      color(p);
      // a chain of lines (chainLines) is one path, so its dashes run on along it
      var prv = sheet.prims[pi - 1], nxt = sheet.prims[pi + 1];
      if (p.k === 'line' && p.chain && (prv && prv.chain === p.chain || nxt && nxt.chain === p.chain)) {
        style(p.style);
        var first = !(prv && prv.chain === p.chain), last = !(nxt && nxt.chain === p.chain);
        c.push((first ? P(p.a[0]) + ' ' + P(p.a[1]) + ' m ' : '') + P(p.b[0]) + ' ' + P(p.b[1]) + ' l' + (last ? ' S' : ''));
        return;
      }
      if (p.k === 'arc') { style(p.style); c.push(arcPath(p)); }
      else if (p.k === 'ellipse') { style(p.style); c.push(ellipsePath(p)); }
      else if (p.k === 'line') { style(p.style); c.push(P(p.a[0]) + ' ' + P(p.a[1]) + ' m ' + P(p.b[0]) + ' ' + P(p.b[1]) + ' l S'); }
      else if (p.k === 'circle') {
        style(p.style);
        var x = p.c[0], y = p.c[1], r = p.r, m = 0.5522847498 * r;
        c.push(P(x + r) + ' ' + P(y) + ' m ' +
          P(x + r) + ' ' + P(y + m) + ' ' + P(x + m) + ' ' + P(y + r) + ' ' + P(x) + ' ' + P(y + r) + ' c ' +
          P(x - m) + ' ' + P(y + r) + ' ' + P(x - r) + ' ' + P(y + m) + ' ' + P(x - r) + ' ' + P(y) + ' c ' +
          P(x - r) + ' ' + P(y - m) + ' ' + P(x - m) + ' ' + P(y - r) + ' ' + P(x) + ' ' + P(y - r) + ' c ' +
          P(x + m) + ' ' + P(y - r) + ' ' + P(x + r) + ' ' + P(y - m) + ' ' + P(x + r) + ' ' + P(y) + ' c S');
      } else if (p.k === 'fill') c.push(P(p.pts[0][0]) + ' ' + P(p.pts[0][1]) + ' m ' + P(p.pts[1][0]) + ' ' + P(p.pts[1][1]) + ' l ' + P(p.pts[2][0]) + ' ' + P(p.pts[2][1]) + ' l h f');
      else if (p.k === 'text') {
        var fs = p.h * ptPer * 1.35, w = textWidth(plainText(p.text), p.h) * ptPer * 1.1;   // cap height ≈ 0.72 em
        var shift = p.anchor === 'middle' ? -w / 2 : p.anchor === 'end' ? -w : 0;
        var a = (p.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        var x0 = p.p[0] * ptPer + ca * shift, y0 = p.p[1] * ptPer + sa * shift;
        c.push('BT /F1 ' + num(fs) + ' Tf ' + num(ca) + ' ' + num(sa) + ' ' + num(-sa) + ' ' + num(ca) + ' ' + num(x0) + ' ' + num(y0) + ' Tm (' + pdfText(p.text) + ') Tj ET');
      }
    });
    var content = c.join('\n');
    var W = P(sheet.size[0]), H = P(sheet.size[1]);
    var objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    ];
    var out = '%PDF-1.4\n', offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return out;
  }

  // ------------------------------------------------------------------ annotations
  // Centre marks, centrelines, hole callouts (view.annotations), ordinate / baseline / chamfer dimensions (view.dims),
  // dimension tolerances, precision and text, driving the part from a model dimension, and manual / stacked balloons
  // with a quantity (view.balloons). Every annotation stores the view geometry it was placed on (model units in the
  // view frame) and is reattached to the current projection on every render, like a Smart Dimension; one whose
  // geometry is gone is drawn dangling (olive).
  // doc.options (Tools ▸ Options ▸ Document Properties): { autoCenterMarks, autoCenterlines (Auto insert on view
  // creation), markSize (paper mm, 2.5), extLines (centre-mark extension lines, true), balloonQty (QTY on new balloons) }
  var MARK_SIZE = 2.5, MARK_GAP = 1, MARK_EXT = 2.5, CL_EXT = 3;
  function docOptions(doc) {
    var o = doc.options || {};
    return { autoCenterMarks: !!o.autoCenterMarks, autoCenterlines: !!o.autoCenterlines, markSize: +o.markSize > 0 ? +o.markSize : MARK_SIZE,
      extLines: o.extLines !== false, balloonQty: !!o.balloonQty };
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
  // holeText(info, units, count, prec) -> callout lines: '4X Ø6.6 THRU', '⌴ Ø11 ↧ 6.8' / '⌵ Ø12 X 90°'
  function holeText(h, units, count, prec) {
    function n(x) { return numText(x, units, prec); }
    var lines = [(count > 1 ? count + 'X ' : '') + 'Ø' + n(h.dia) + (h.thru ? ' THRU' : ' ↧ ' + n(h.depth))];
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
    if (!isOrthoFrame(ct.frame)) return 0;
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
    if (!isOrthoFrame(ct.frame)) return 0;
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
    return reattachDim(d, pr);
  }

  // ------------------------------------------------------------------ dimension text: precision, tolerance, text
  // d.prec (decimal places; default: up to 2 in mm / 3 in inches, trailing zeros dropped), d.tol = { type: 'none' |
  // 'bilateral' | 'limit' | 'symmetric', plus, minus, prec }, d.label (dimension text, "<DIM>" is the value)
  var TOL_TYPES = [['none', 'None'], ['bilateral', 'Bilateral'], ['limit', 'Limit'], ['symmetric', 'Symmetric']];
  function numText(x, units, prec) { return prec != null && prec !== '' && +prec >= 0 ? (Math.round(+x * Math.pow(10, +prec)) / Math.pow(10, +prec)).toFixed(+prec) : fmtDim(x, units); }
  // dimLabel(d, units) -> { main, upper, lower, text }: main is null for a limit tolerance (upper over lower); text is
  // the one-line form ("100.00 +0.10/-0.05", "100.10/99.95", "100.00 ±0.05")
  function dimLabel(d, units) {
    var prec = d.prec != null && d.prec !== '' ? +d.prec : null, tol = d.tol && d.tol.type && d.tol.type !== 'none' ? d.tol : null;
    function base(x) {
      if (d.kind === 'chamfer') return numText(x, units, prec) + ' X ' + fmtAngle(d.angle) + '°';
      if (d.kind === 'dia') return (d.count > 1 ? d.count + 'X ' : '') + 'Ø' + numText(x, units, prec);
      if (d.kind === 'rad') return (d.count > 1 ? d.count + 'X ' : '') + 'R' + numText(x, units, prec);
      return numText(x, units, prec);
    }
    var out = { main: base(d.value), upper: null, lower: null };
    if (tol) {
      var tp = tol.prec != null && tol.prec !== '' ? +tol.prec : prec, plus = Math.abs(+tol.plus || 0), minus = Math.abs(+tol.minus || 0);
      var tn = function (x) { return numText(x, units, tp); };
      if (tol.type === 'symmetric') out.main += ' ±' + tn(plus);
      else if (tol.type === 'bilateral') { out.upper = '+' + tn(plus); out.lower = (minus ? '-' : '') + tn(minus); }
      else if (tol.type === 'limit') { out.upper = base(d.value + plus); out.lower = base(d.value - minus); out.main = null; }
    }
    if (d.label != null && String(d.label) !== '' && out.main != null) out.main = String(d.label).split('<DIM>').join(out.main);
    out.text = out.main == null ? out.upper + '/' + out.lower : out.main + (out.upper != null ? ' ' + out.upper + '/' + out.lower : '');
    return out;
  }
  // the dimension properties the Dimension PropertyManager edits; a model item keeps them in doc.dimProps under
  // styleKey (view:kind:n, stable when the part changes size), a Smart Dimension on itself
  var DIM_PROPS = ['at', 'tx', 'lead', 'off', 'flip', 'tol', 'prec', 'label'];
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
  function annotationPrims(an, w, k, mesh, doc, units, threads) {
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
        if (h.r > 0 && reattachDim(ref, pr)) { h.c = ref.c; h.r = ref.r; } else if (h.r > 0) dangling = true;
      });
      var size = an.size || o.markSize, ext = an.ext != null ? an.ext : o.extLines, cs = an.holes.map(function (h) { return w.toSheet(h.c); });
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
      var h = w.ortho ? holeInfo(mesh, w.frame, an.c, an.r) : null, lines;
      if (h) {
        // 4X: the visible holes of the view that read the same (one per centre: a counterbore shows two circles)
        var one = holeText(h, units, 1, an.prec).join('|'), count = 0, seen = [];
        pr.circles.visible.forEach(function (c) {
          if (seen.some(function (q) { return Math.hypot(q[0] - c.c[0], q[1] - c.c[1]) <= 1e-6 * (1 + Math.abs(q[0]) + Math.abs(q[1])); })) return;
          var q = holeInfo(mesh, w.frame, c.c, c.r);
          if (q && holeText(q, units, 1, an.prec).join('|') === one) { count++; seen.push(c.c); }
        });
        lines = holeText(h, units, Math.max(1, count), an.prec);
        info = { hole: h, count: Math.max(1, count) };
        // a Straight Tap hole of the Hole Wizard: the tap drill line, then the thread 'M8x1.25 ↧ 12' / 'M8x1.25 THRU'
        var tap = w.ortho ? threadsAlong(threads, w.frame).filter(function (t) { return Math.hypot(t.c[0] - h.c[0], t.c[1] - h.c[1]) <= 1e-6 * (1 + t.r) && Math.abs(t.drill - h.dia) <= 1e-6 * (1 + t.drill); })[0] : null;
        if (tap) { lines.push(tap.label + (tap.depth == null || h.thru ? ' THRU' : ' ↧ ' + numText(tap.depth, units, an.prec))); info.thread = tap.label; }
      } else lines = ['Ø' + numText(2 * an.r, units, an.prec)];
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
      var sg = lead[0] >= 0 ? 1 : -1, tw = Math.max.apply(null, lines.map(function (s) { return textWidth(s, th); }));
      line(tip, elbow); line(elbow, [elbow[0] + sg * (tw + 2 * k), elbow[1]]);
      var ar = 3 * k, aw = 0.9 * k, dv = [-uu[0], -uu[1]], nn = [-dv[1], dv[0]];
      out.push({ k: 'fill', pts: [tip, [tip[0] - dv[0] * ar + nn[0] * aw, tip[1] - dv[1] * ar + nn[1] * aw], [tip[0] - dv[0] * ar - nn[0] * aw, tip[1] - dv[1] * ar - nn[1] * aw]], layer: L });
      lines.forEach(function (s, i) { out.push({ k: 'text', p: [elbow[0] + sg * 1 * k, elbow[1] + 1 * k + (lines.length - 1 - i) * th * 1.5], h: th, text: s, anchor: sg > 0 ? 'start' : 'end', layer: L, rot: 0 }); });
      an.leadNow = lead.slice();
      text = lines.join(' ');
      info = info || {};
      info.lines = lines;
    }
    if (dangling) out.forEach(function (x) { x.color = 'dangling'; });
    return { prims: out, dangling: dangling, text: text, info: info };
  }

  return {
    ORIENTS: Object.keys(ORIENTS), FORMATS: FORMATS, SCALES: SCALES,
    orientation: orientation, meshEdges: meshEdges, pairOpenEdges: pairOpenEdges, projectView: projectView, extentsOf: extentsOf, textRect: textRect,
    newDrawing: newDrawing, addView: addView, standard3View: standard3View, layout: layout, moveView: moveView, findView: findView,
    sheetSize: sheetSize, scaleText: scaleText, scaleLabel: scaleLabel, parseScale: parseScale, scaleValue: scaleValue,
    autoDims: autoDims, dimText: dimText, fmtDim: fmtDim, compute: compute, toSVG: toSVG, svgParts: svgParts, toDXF: toDXF, toPDF: toPDF,
    frameOf: frameOf, viewFrame: viewFrame, projectedFrame: projectedFrame, sectionFrame: sectionFrame, isOrthoFrame: isOrthoFrame,
    addProjectedView: addProjectedView, addSectionView: addSectionView, addDetailView: addDetailView, detailScale: detailScale, nextLabel: nextLabel,
    sectionOf: sectionOf, hatchLines: hatchLines, hatchStyle: hatchStyle, hatchPattern: hatchPattern, patternLines: patternLines, HATCH_PATTERNS: Object.keys(HATCH_PATTERNS), clipProjection: clipProjection, reattachDim: reattachDim, deleteView: deleteView,
    bomRows: bomRows, bomBox: bomBox, partInfo: partInfo, autoBalloon: autoBalloon, deleteBalloons: deleteBalloons, balloonSpots: balloonSpots,
    BOM_ANCHORS: BOM_ANCHORS, BOM_COLS: BOM_COLS, BOM_TYPES: BOM_TYPES, bomType: bomType, bomColumns: bomColumns, bomColumnSpecs: bomColumnSpecs,
    TB_FIELDS: TB_FIELDS, titleBlock: titleBlock, titleText: titleText, titleFieldAt: titleFieldAt, bomPropertyNames: bomPropertyNames,
    // annotations
    circlesAlong: circlesAlong, meshCurves: meshCurves, holeInfo: holeInfo, holeText: holeText, cylAxes: cylAxes, fitCircle: fitCircle, lineIntervals: lineIntervals,
    addCenterMark: addCenterMark, autoCenterMarks: autoCenterMarks, addCenterline: addCenterline, autoCenterlines: autoCenterlines, autoInsert: autoInsert,
    addHoleCallout: addHoleCallout, findAnnotation: findAnnotation, deleteAnnotation: deleteAnnotation, docOptions: docOptions,
    addOrdinate: addOrdinate, addBaseline: addBaseline, addChamferDim: addChamferDim, refFrom: refFrom,
    TOL_TYPES: TOL_TYPES, dimLabel: dimLabel, numText: numText, styleKey: styleKey, setDimProps: setDimProps, DIM_PROPS: DIM_PROPS,
    dimSource: dimSource, driveDim: driveDim, addBalloon: addBalloon, STACK_DIRS: STACK_DIRS, plainText: plainText
  };
})();

// ====================================================================== drawing document UI
// Only when the app is loaded (tests/kernel-tests.html loads the engine above without a UI).
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.App || typeof document === 'undefined') return;
  var App = UI.App, K = UI.K, $ = UI.$, el = UI.el;

  // ------------------------------------------------------------------ icons (drawing documents)
  var DI = {
    drawing: '<path d="M2.5 2.5 h11 v11 h-11 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 9.5 h4 v2.5 h-4 z M4.5 4.5 h4 v3.5 h-4 z M10 9.5 h2 v2.5 h-2 z" fill="none" stroke="#2f7fd6" stroke-width="0.9"/>',
    sheet: '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M9 10 h5 M9 10 v3" stroke="currentColor" stroke-width="0.9" fill="none"/>',
    sheetFormat: '<path d="M2 3 h12 v10 H2 z" fill="#f2f4f7" stroke="currentColor" stroke-width="1.1"/><path d="M8 9.5 h6 M8 9.5 v3.5 M11 9.5 v3.5" stroke="currentColor" stroke-width="0.8" fill="none"/>',
    drawingView: '<path d="M2 2.5 h12 v11 H2 z" fill="none" stroke="#2f7fd6" stroke-width="1" stroke-dasharray="2 1.2"/><path d="M4.5 5 h7 v6 h-7 z" fill="#bfcfe0" stroke="currentColor" stroke-width="1"/>',
    std3view: '<path d="M1.5 8.5 h6 v5.5 h-6 z M1.5 2 h6 v5 h-6 z M9 8.5 h5.5 v5.5 H9 z" fill="#bfcfe0" stroke="currentColor" stroke-width="1"/><path d="M4.5 3.5 v2 M3 4.5 h3" stroke="#2f7fd6" stroke-width="0.8"/>',
    modelView: '<path d="M2 2.5 h12 v11 H2 z" fill="none" stroke="#2f7fd6" stroke-width="1" stroke-dasharray="2 1.2"/><path d="M5 7 l3 -2 3 2 v4 l-3 2 -3 -2 z" fill="#bfcfe0" stroke="currentColor" stroke-width="1"/><path d="M5 7 l3 2 3 -2 M8 9 v4" fill="none" stroke="currentColor" stroke-width="0.8"/>',
    projView: '<path d="M2 8.5 h6 v5.5 H2 z" fill="#bfcfe0" stroke="currentColor" stroke-width="1"/><path d="M2 2 h6 v5 H2 z" fill="none" stroke="#2f7fd6" stroke-width="1" stroke-dasharray="1.6 1"/><path d="M11.5 12 V4 M9.8 5.8 l1.7 -1.8 1.7 1.8" fill="none" stroke="#3ba776" stroke-width="1.2"/>',
    modelItems: '<path d="M3 13 l3 -2 3 2 V8 l-3 -2 -3 2 z" fill="#bfcfe0" stroke="currentColor" stroke-width="0.9"/><path d="M8 3.5 h6 M8 3.5 l1.2 -0.8 M8 3.5 l1.2 0.8 M14 3.5 l-1.2 -0.8 M14 3.5 l-1.2 0.8" fill="none" stroke="#2f7fd6" stroke-width="1"/><path d="M11 7 v6" stroke="#2f7fd6" stroke-width="1"/>',
    sheetProps: '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 6 h7 M4.5 8.5 h7 M4.5 11 h4" stroke="#2f7fd6" stroke-width="1"/>',
    svgExport: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><text x="8" y="12" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#e0553c">SVG</text>',
    pdfExport: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><text x="8" y="12" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#d9453b">PDF</text>',
    dxfExport: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><text x="8" y="12" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#2f7fd6">DXF</text>',
    sectionView: '<path d="M2 3 h12 v10 H2 z" fill="#bfcfe0" stroke="currentColor" stroke-width="1"/><path d="M3 12 l3 -3 M3 9 l3 -3 M3 6 l2 -2 M5 12 l1 -1" stroke="currentColor" stroke-width="0.6"/><path d="M8 1 v14" stroke="#e0553c" stroke-width="1.3" stroke-dasharray="3 1 1 1"/><path d="M8 1.5 h3 M8 14.5 h3 M10 0.3 l1.4 1.2 -1.4 1.2 M10 13.3 l1.4 1.2 -1.4 1.2" fill="none" stroke="#e0553c" stroke-width="1"/>',
    detailView: '<path d="M1.5 9 h7 v5 h-7 z" fill="#bfcfe0" stroke="currentColor" stroke-width="0.9"/><circle cx="7" cy="9" r="2.4" fill="none" stroke="#e0553c" stroke-width="1"/><circle cx="11.5" cy="5" r="3.8" fill="#fff" stroke="#2f7fd6" stroke-width="1"/><path d="M8 5 h3.5 v4" fill="none" stroke="currentColor" stroke-width="1"/>',
    autoBalloon: '<path d="M2 13 h6 v-5 h-6 z" fill="#bfcfe0" stroke="currentColor" stroke-width="0.9"/><path d="M7 9.5 L10.2 6.3" stroke="currentColor" stroke-width="0.9"/><circle cx="12" cy="4.5" r="3.2" fill="#fff" stroke="#2f7fd6" stroke-width="1.1"/><text x="12" y="6.2" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#2f7fd6">1</text>',
    bom: '<path d="M1.5 3 h13 v10 h-13 z" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M1.5 5.5 h13" stroke="currentColor" stroke-width="1.1"/><path d="M1.5 8 h13 M1.5 10.5 h13 M4.5 3 v10 M12 3 v10" stroke="currentColor" stroke-width="0.6"/><path d="M5.8 6.8 h4.6 M5.8 9.3 h3.6 M5.8 11.8 h4.2" stroke="#2f7fd6" stroke-width="0.8"/>',
    closeDoc: '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M5.5 5.5 l5 5 M10.5 5.5 l-5 5" stroke="#e0553c" stroke-width="1.4"/>',
    centerMark: '<circle cx="8" cy="8" r="4.2" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M6.6 8 h2.8 M8 6.6 v2.8" stroke="#2f7fd6" stroke-width="1.1"/><path d="M1 8 h4 M11 8 h4 M8 1 v4 M8 11 v4" stroke="#2f7fd6" stroke-width="0.9" stroke-dasharray="2.2 0.8 0.6 0.8"/>',
    centerline: '<path d="M2 4.5 h12 M2 11.5 h12" stroke="currentColor" stroke-width="1.1"/><path d="M0.8 8 h14.4" stroke="#2f7fd6" stroke-width="1" stroke-dasharray="3 1 1 1"/>',
    holeCallout: '<circle cx="5" cy="11" r="3" fill="#fff" stroke="currentColor" stroke-width="1"/><path d="M7.1 8.9 L10 6 h5" fill="none" stroke="#2f7fd6" stroke-width="1"/><text x="12" y="4.6" font-size="4.6" font-weight="700" font-family="Arial" text-anchor="middle" fill="#2f7fd6">\u00d8</text>',
    balloon: '<path d="M2.5 13.5 L8.4 7.6" stroke="currentColor" stroke-width="0.9"/><path d="M2.5 13.5 l0.6 -2 1.4 1.4 z" fill="currentColor"/><circle cx="11" cy="5" r="3.8" fill="#fff" stroke="#2f7fd6" stroke-width="1.1"/><text x="11" y="6.8" font-size="5" font-weight="700" font-family="Arial" text-anchor="middle" fill="#2f7fd6">1</text>',
    stackBalloon: '<path d="M2 14 L5 11" stroke="currentColor" stroke-width="0.9"/><circle cx="6.5" cy="9.5" r="2.6" fill="#fff" stroke="#2f7fd6" stroke-width="1"/><circle cx="11.7" cy="9.5" r="2.6" fill="#fff" stroke="#2f7fd6" stroke-width="1"/><circle cx="9.1" cy="4.4" r="2.6" fill="#fff" stroke="#2f7fd6" stroke-width="1"/>',
    ordinateDim: '<path d="M3 13.5 V3 M7 13.5 V6 M12 13.5 V8" stroke="#2f7fd6" stroke-width="0.9"/><path d="M1.5 13.5 h13" stroke="currentColor" stroke-width="1.1"/><text x="3" y="2.6" font-size="3.4" font-family="Arial" text-anchor="middle" fill="currentColor">0</text>',
    baselineDim: '<path d="M2.5 14 V2" stroke="currentColor" stroke-width="1.1"/><path d="M2.5 5 h7 M2.5 9 h11" stroke="#2f7fd6" stroke-width="0.9"/><path d="M9.5 3.5 v3 M13.5 7.5 v3" stroke="currentColor" stroke-width="0.9"/>',
    chamferDim: '<path d="M2 14 V7 L7 2 h7" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.5 4.5 L8.5 8.5 h6" fill="none" stroke="#2f7fd6" stroke-width="0.9"/>',
    docProps: '<path d="M3 1.5 h7 l3 3 v10 H3 z" fill="#fff" stroke="currentColor" stroke-width="1"/><circle cx="8" cy="9" r="2.6" fill="none" stroke="#2f7fd6" stroke-width="1.3" stroke-dasharray="1.4 0.9"/><circle cx="8" cy="9" r="0.9" fill="#2f7fd6"/>'
  };
  var baseIcons = Icons;
  var wrapped = function (name, size, cls) {
    if (!DI[name]) return baseIcons(name, size, cls);
    size = size || 32;
    return '<svg class="ico ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 16 16" aria-hidden="true">' + DI[name] + '</svg>';
  };
  wrapped.has = function (name) { return !!DI[name] || baseIcons.has(name); };
  Icons = wrapped;   // eslint-disable-line no-global-assign

  // ------------------------------------------------------------------ state
  var D = {
    active: false, index: 0, sheet: null, sel: null, hover: null, tool: null, pending: null,
    vb: null, drag: null, root: null, host: null, tree: null, renderQueued: false
  };
  // drawings belong to the open part or assembly document (model.drawings)
  function doc() { var l = App.model && App.model.drawings; return l && l[D.index] || null; }
  // an assembly drawing's BOM row count drives where Standard 3 View leaves room for the table
  // the build the sheet reads mass and bodies from (the open document's)
  function cctx() { return { build: App.build || null }; }
  function syncBom(dc) { dc = dc || doc(); if (dc && dc.bom) dc.bomRows = Drawing.bomRows(App.model, mesh(), dc.bom, cctx()).length; return dc; }
  function relayout(dc) { syncBom(dc); Drawing.layout(dc, mesh(), units()); }
  function units() { return App.model.units === 'in' ? 'in' : 'mm'; }
  function mesh() { return App.mesh || { positions: new Float32Array(0), faces: [], triCount: 0 }; }
  function paperK() { return units() === 'in' ? 1 / 25.4 : 1; }
  function edit(fn) {
    UI.pushUndo();
    fn(doc());
    UI.autosave();
    render();
  }

  // ------------------------------------------------------------------ DOM
  function ensureDom() {
    if (D.root) return;
    D.root = el('div', { id: 'drawing-doc', hidden: true });
    D.host = el('div', { id: 'drawing-sheet' });
    var tabs = el('div', { id: 'drawing-tabs' });
    D.root.appendChild(D.host);
    D.root.appendChild(tabs);
    UI.viewport.appendChild(D.root);
    D.tree = el('div', { id: 'drawing-tree', hidden: true });
    $('left').appendChild(D.tree);
    D.host.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    D.host.addEventListener('wheel', onWheel, { passive: false });
    D.host.addEventListener('dblclick', onDblClick);
    D.host.addEventListener('contextmenu', onContext);
  }
  function renderTabs() {
    var tabs = $('drawing-tabs'), dc = doc();
    tabs.innerHTML = '';
    tabs.appendChild(el('button', { class: 'dw-tab active', text: dc ? dc.sheet.name : 'Sheet1', title: 'Sheet (right-click for Sheet Properties)', oncontextmenu: function (e) { e.preventDefault(); UI.showMenu(e.clientX, e.clientY, sheetMenu()); } }));
    tabs.appendChild(el('span', { class: 'dw-sp' }));
    tabs.appendChild(el('button', { class: 'dw-tab', html: Icons(isAsm() ? 'assembly' : 'part', 14) + '<span>' + (App.model.name || 'Part') + '</span>', title: 'Switch to the ' + (isAsm() ? 'assembly' : 'part') + ' document (Window menu)', onclick: function () { closeDrawing(); } }));
  }

  // ------------------------------------------------------------------ open / close
  // makeDrawing(opts): File ▸ Make Drawing from Part / Assembly. Reuses the document's first drawing or creates one
  // with Standard 3 View + Isometric (and, for an assembly, a Bill of Materials in the top-right corner of the sheet;
  // opts.bom === false leaves it out) as one undo step, then shows the drawing document.
  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function docKind() { return isAsm() ? 'assembly' : 'part'; }
  function makeDrawing(opts) {
    opts = opts || {};
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return null; }
    if (App.mode === 'sketch' && UI.exitSketch) UI.exitSketch();
    if (UI.hasPM && UI.hasPM()) UI.pmCancel();
    var list = App.model.drawings || [];
    if (!list.length || opts.fresh) {
      UI.pushUndo();
      App.model.drawings = list = list.concat([]);
      var dc = Drawing.newDrawing(App.model, Object.assign({ options: defaultDocOptions() }, opts));
      syncBom(dc);
      Drawing.standard3View(dc, App.mesh, units(), opts);
      list.push(dc);
      UI.autosave();
      D.index = list.length - 1;
    } else D.index = opts.index != null ? opts.index : 0;
    openDrawing();
    return doc();
  }
  function openDrawing() {
    ensureDom();
    if (!doc()) return;
    D.active = true; D.sel = null; D.hover = null; D.tool = null; D.pending = null; D.vb = null;
    $('app').classList.add('drawing-mode');
    D.root.hidden = false; D.tree.hidden = false;
    App.ribbonTab = 'Drawing';
    UI.refreshRibbon();
    UI.renderMenuBar();
    render();
    fitSheet();
    UI.setStatus('Drawing ' + doc().name + (isAsm() ? ' of assembly ' + App.model.name + ': Auto Balloon numbers the components after the Bill of Materials' : '') + ': drag a view to move it, Smart Dimension (D) to dimension an edge or circle, wheel to zoom.');
  }
  function closeDrawing() {
    if (!D.active) return;
    if (UI.hasPM && UI.hasPM()) UI.pmCancel();
    closeInlineEdit(false);
    D.active = false; D.tool = null; D.pending = null;
    $('app').classList.remove('drawing-mode', 'dw-pm');
    D.root.hidden = true; D.tree.hidden = true;
    App.ribbonTab = 'Features';
    UI.setFmTab('tree');
    UI.refreshRibbon();
    UI.renderMenuBar();
    UI.refreshStatus();
    UI.setStatus((isAsm() ? 'Assembly ' : 'Part ') + App.model.name);
  }

  // ------------------------------------------------------------------ render
  // render(light): works the sheet out again and patches the SVG in place, layer by layer: only the layers whose
  // markup changed are parsed again (a dragged dimension re-parses the DIMENSIONS layer, not the views' thousands of
  // edges), the sheet never goes blank between two states, and the pan / zoom and overlay stay (r3/drawings3).
  // light: a drag frame, the FeatureManager and the tabs are left alone.
  function render(light) {
    if (!D.active) return;
    var dc = doc();
    if (!dc) { closeDrawing(); return; }
    var t0 = performance.now();
    // this render answers any queued one (a queued full render makes this one full)
    if (D.renderQueued && D.renderFull) light = false;
    D.qtok = (D.qtok || 0) + 1; D.renderQueued = false; D.renderFull = false;
    syncBom(dc);
    if (dc.layout === 'auto') Drawing.layout(dc, mesh(), units());
    D.sheet = Drawing.compute(dc, mesh(), App.model, cctx());
    D.occtDrove = !!(UI.occt && UI.occt.status && UI.occt.status().driving);
    D.rendered = {};
    D.sheet.views.forEach(function (w) { D.rendered[w.view.id] = [w.view.x, w.view.y]; });
    patchSheet(Drawing.svgParts(D.sheet, { live: true }));
    applyViewBox();
    drawOverlay();
    if (light !== true) { renderTree(); renderTabs(); }
    $('doc-title').textContent = dc.name + ' - ' + dc.sheet.name;
    D.lastRenderMs = performance.now() - t0;
  }
  // the sheet SVG from svgParts: built whole the first time (or when the sheet size or the list of layers changed),
  // afterwards only the changed layers' contents are replaced; transforms left by a live view drag are cleared
  function patchSheet(P) {
    var s = svgEl(), keys = P.groups.map(function (g) { return g.open; }).join('\n');
    if (!s || D.svgHead !== P.head || D.svgKeys !== keys) {
      D.host.innerHTML = P.head + '\n' + P.bg + '\n' + P.groups.map(function (g) { return g.open + '\n' + g.body + '\n</g>'; }).join('\n') + '\n</svg>';
      s = svgEl();
      s.setAttribute('width', '100%'); s.setAttribute('height', '100%');
      s.appendChild(document.createElementNS(NS, 'g')).setAttribute('id', 'dw-overlay');
      D.svgHead = P.head; D.svgKeys = keys; D.svgBodies = P.groups.map(function (g) { return g.body; });
      D.patched = P.groups.length;
      return;
    }
    var nodes = s.querySelectorAll(':scope > g[data-layer]'), n = 0;
    P.groups.forEach(function (g, i) {
      var node = nodes[i];
      if (!node) return;
      if (D.svgBodies[i] !== g.body) { node.innerHTML = g.body; D.svgBodies[i] = g.body; n++; }
      else if (D.shifted) {
        if (node.hasAttribute('transform')) node.removeAttribute('transform');
        var sub = node.querySelectorAll('g[transform]');
        for (var j = 0; j < sub.length; j++) sub[j].removeAttribute('transform');
      }
      if (node.hasAttribute('transform')) node.removeAttribute('transform');
    });
    D.shifted = false;
    D.patched = n;
  }
  // a dragged view follows the mouse at full frame rate: its layer (and its dimensions, annotations and balloons, and
  // the aligned views that move with it) is translated where it was drawn; the sheet is worked out again on release
  function liveShift() {
    var s = svgEl();
    if (!s || !D.sheet || !D.rendered) return;
    D.sheet.views.forEach(function (w) {
      var o = liveOffset(w.view.id), dx = o[0], dy = o[1], tr = dx || dy ? 'translate(' + dx + ' ' + (-dy) + ')' : null;
      var nodes = s.querySelectorAll('g[data-view="' + w.view.id + '"], g[data-of="' + w.view.id + '"]');
      for (var i = 0; i < nodes.length; i++) { if (tr) nodes[i].setAttribute('transform', tr); else nodes[i].removeAttribute('transform'); }
      if (tr) D.shifted = true;
    });
  }
  // how far a view has been dragged since the sheet was last worked out (paper units)
  function liveOffset(id) {
    var r = D.rendered && D.rendered[id], v = r && doc() && Drawing.findView(doc(), id);
    return v ? [v.x - r[0], v.y - r[1]] : [0, 0];
  }
  // The sheet was drawn from OpenCascade's exact solid and the part has just been rebuilt by Anvil's kernel, with
  // OpenCascade's build of it on the way: the drawing keeps its last sheet rather than redraw Anvil's approximation
  // (facet edges, a swept handle's chords) and then the exact solid again a moment later (r3/drawings3). ui-occt.js
  // says when a build is queued, running or held (UI.occt.pending, r4/drawings4); the sheet waits for it up to 3 s.
  function occtSwapComing(since) {
    if (!D.occtDrove || !UI.occt || !UI.occt.on || !UI.occt.on()) return false;
    var st = UI.occt.status(), dt = performance.now() - since;
    if (st.driving || dt > 3000) return false;
    if (UI.occt.pending) return UI.occt.pending();
    return dt < 1500 && (st.state === 'building' || dt < 250);
  }
  function queueRender(light) {
    if (light !== true) D.renderFull = true;
    if (D.renderQueued) return;
    D.renderQueued = true;
    // the next frame, or 60 ms when frames are throttled (a page in a background tab / pane): a part change still
    // redraws the sheet. While OpenCascade is about to swap its exact solid in for Anvil's approximation (UI.holdFrame,
    // ui-occt.js), the sheet keeps its last drawing instead of flashing the approximation's facet edges first.
    var tok = D.qtok, since = performance.now(), go = function () {
      if (tok !== D.qtok || !D.renderQueued) return;   // answered by a render since
      var hold = App.holdFrameUntil && App.holdFrameUntil - performance.now();
      if (!(hold > 0) && occtSwapComing(since)) hold = 40;
      if (hold > 0 && D.renderFull && !D.drag) { setTimeout(go, Math.min(hold + 5, 40)); return; }
      render(!D.renderFull);
    };
    requestAnimationFrame(go); setTimeout(go, 60);
  }
  function svgEl() { return D.host && D.host.querySelector('svg'); }
  function applyViewBox() {
    var s = svgEl();
    if (!s || !D.sheet) return;
    if (!D.vb) D.vb = fitBox();
    s.setAttribute('viewBox', D.vb.x + ' ' + D.vb.y + ' ' + D.vb.w + ' ' + D.vb.h);
    positionInlineEdit();
  }
  function fitBox() {
    var S = D.sheet.size, m = Math.max(S[0], S[1]) * 0.03;
    return { x: -m, y: -m, w: S[0] + 2 * m, h: S[1] + 2 * m };
  }
  function fitSheet() { stopVbAnim(); ZM.pending = 0; D.vb = null; applyViewBox(); }
  // client px -> paper coordinates (y up)
  function toPaper(ev) {
    var s = svgEl();
    if (!s) return [0, 0];
    var pt = s.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    var m = s.getScreenCTM();
    if (!m) return [0, 0];
    var q = pt.matrixTransform(m.inverse());
    return [q.x, D.sheet.size[1] - q.y];
  }
  function pxToPaper(px) {
    var s = svgEl(), m = s && s.getScreenCTM();
    return m ? px / m.a : px;
  }
  var NS = 'http://www.w3.org/2000/svg';
  function svgNode(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function drawOverlay() {
    var s = svgEl(), g = s && s.querySelector('#dw-overlay');
    if (!g) return;
    g.innerHTML = '';
    var H = D.sheet.size[1], pad = 2 * paperK(), sw = pxToPaper(1.2);
    D.sheet.views.forEach(function (w) {
      var sel = D.sel && D.sel.kind === 'view' && D.sel.id === w.view.id, hov = D.hover && (D.hover.kind === 'view' && D.hover.id === w.view.id || D.hover.pre && D.hover.view === w.view.id);
      if (!sel && !hov) return;
      var o = liveOffset(w.view.id);
      svgNode('rect', { class: 'dw-vbox' + (sel ? ' sel' : ''), x: w.box.x0 + o[0] - pad, y: H - w.box.y1 - o[1] - pad, width: w.box.x1 - w.box.x0 + 2 * pad, height: w.box.y1 - w.box.y0 + 2 * pad, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g);
    });
    D.sheet.dims.forEach(function (d) {
      var sel = D.sel && D.sel.kind === 'dim' && dimMatches(D.sel, d), hov = D.hover && D.hover.kind === 'dim' && dimMatches(D.hover, d);
      if (!sel && !hov || !d.box) return;
      svgNode('rect', { class: 'dw-dbox' + (sel ? ' sel' : ''), x: d.box.x0 - pad / 2, y: H - d.box.y1 - pad / 2, width: d.box.x1 - d.box.x0 + pad, height: d.box.y1 - d.box.y0 + pad, 'stroke-width': sw }, g);
      // the selected dimension's arrow handles: click one to flip the arrows (r4/drawings4)
      if (sel && FLIP_KINDS[d.kind] && d.arrows && !(D.drag && D.drag.moved)) d.arrows.forEach(function (a) { svgNode('circle', { class: 'dw-handle', cx: a[0], cy: H - a[1], r: pxToPaper(3.2), 'stroke-width': sw }, g); });
    });
    if (D.snapGuide) svgNode('line', { class: 'dw-guide', x1: D.snapGuide.a[0], y1: H - D.snapGuide.a[1], x2: D.snapGuide.b[0], y2: H - D.snapGuide.b[1], 'stroke-width': sw, 'stroke-dasharray': pxToPaper(4) + ' ' + pxToPaper(3) }, g);
    if (D.sel && D.sel.kind === 'bom' && D.sheet.bom) { var bb = D.sheet.bom.box; svgNode('rect', { class: 'dw-vbox sel', x: bb.x0 - pad, y: H - bb.y1 - pad, width: bb.x1 - bb.x0 + 2 * pad, height: bb.y1 - bb.y0 + 2 * pad, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g); }
    (D.sheet.balloons || []).forEach(function (b) {
      var bsel = D.sel && D.sel.kind === 'balloon' && D.sel.view === b.view && (D.sel.index != null ? D.sel.index === b.index : D.sel.key === b.key && D.sel.component === b.component);
      var bhov = D.hover && D.hover.kind === 'balloon' && D.hover.view === b.view && D.hover.index === b.index;
      if (bsel || bhov) svgNode('circle', { class: 'dw-hot' + (bsel ? '' : ' pre'), cx: b.c[0], cy: H - b.c[1], r: b.r + pad / 2, 'stroke-width': pxToPaper(2) }, g);
    });
    (D.sheet.annotations || []).forEach(function (a) {
      var asel = D.sel && D.sel.kind === 'annot' && D.sel.id === a.id, ahov = D.hover && D.hover.kind === 'annot' && D.hover.id === a.id;
      if (!(asel || ahov) || !isFinite(a.box.x0)) return;
      svgNode('rect', { class: 'dw-dbox' + (asel ? ' sel' : ''), x: a.box.x0 - pad / 2, y: H - a.box.y1 - pad / 2, width: a.box.x1 - a.box.x0 + pad, height: a.box.y1 - a.box.y0 + pad, 'stroke-width': sw }, g);
    });
    if (D.tool === 'centermark' && D.pending && D.pending.view != null) {
      var cw = sheetView(D.pending.view);
      if (cw) D.pending.holes.forEach(function (h0) { var q0 = cw.toSheet(h0.c); svgNode('circle', { class: 'dw-hot', cx: q0[0], cy: H - q0[1], r: h0.r * cw.scale, 'stroke-width': pxToPaper(3) }, g); });
    }
    if ((D.tool === 'balloon' || D.tool === 'stackballoon') && D.pending && D.pending.item && !D.pending.placed && D.pending.at) {
      var bw = sheetView(D.pending.view), ap = bw ? bw.toSheet(D.pending.attach) : D.pending.cp;
      svgNode('line', { class: 'dw-cut', x1: ap[0], y1: H - ap[1], x2: D.pending.at[0], y2: H - D.pending.at[1], 'stroke-width': pxToPaper(1.5) }, g);
      svgNode('circle', { class: 'dw-cut', cx: D.pending.at[0], cy: H - D.pending.at[1], r: 5 * paperK(), 'stroke-width': pxToPaper(1.5) }, g);
    }
    if (D.hover && D.hover.kind === 'entity') {
      var h = D.hover, hc = 'dw-hot' + (h.pre ? ' pre' : ''), hw = pxToPaper(h.pre ? 2.4 : 3);
      if (h.circle) svgNode('circle', { class: hc, cx: h.circle.c[0], cy: H - h.circle.c[1], r: h.circle.r, 'stroke-width': hw }, g);
      else if (h.arc) {
        var ha = h.arc, h0 = ha.a0 * Math.PI / 180, h1 = ha.a1 * Math.PI / 180;
        svgNode('path', { class: hc, d: 'M' + (ha.c[0] + ha.r * Math.cos(h0)) + ' ' + (H - ha.c[1] - ha.r * Math.sin(h0)) + ' A' + ha.r + ' ' + ha.r + ' 0 ' + (ha.a1 - ha.a0 > 180 ? 1 : 0) + ' 0 ' + (ha.c[0] + ha.r * Math.cos(h1)) + ' ' + (H - ha.c[1] - ha.r * Math.sin(h1)), fill: 'none', 'stroke-width': hw }, g);
      } else svgNode('line', { class: hc, x1: h.a[0], y1: H - h.a[1], x2: h.b[0], y2: H - h.b[1], 'stroke-width': hw }, g);
    }
    function ghost(cx, cy, gw, gh) { svgNode('rect', { class: 'dw-ghost', x: cx - gw / 2, y: H - cy - gh / 2, width: gw, height: gh, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g); }
    var P = D.pending;
    if (D.tool === 'place' && P && P.at) ghost(P.at[0], P.at[1], P.w, P.h);
    if (D.tool === 'project' && P && P.parent != null && P.at) { var pl = projectPlacement(P.at); if (pl) ghost(pl.x, pl.y, pl.w, pl.h); }
    if (D.tool === 'section' && P && P.at) {
      var sl = P.parent != null ? P.line : sectionLineAt(P.at);
      if (sl) svgNode('line', { class: 'dw-cut', x1: sl.a[0], y1: H - sl.a[1], x2: sl.b[0], y2: H - sl.b[1], 'stroke-width': pxToPaper(2), 'stroke-dasharray': pxToPaper(12) + ' ' + pxToPaper(3) + ' ' + pxToPaper(3) + ' ' + pxToPaper(3) }, g);
      if (P.parent != null) { var sp = sectionPlacement(P.at); if (sp) ghost(sp.x, sp.y, sp.w, sp.h); }
    }
    if (D.tool === 'detail' && P && P.parent != null) {
      var dw = sheetView(P.parent), rr = P.r != null ? P.r : P.at ? Math.hypot(P.at[0] - P.cp[0], P.at[1] - P.cp[1]) / dw.scale : 0;
      if (rr > 0) svgNode('circle', { class: 'dw-cut', cx: P.cp[0], cy: H - P.cp[1], r: rr * dw.scale, 'stroke-width': pxToPaper(2) }, g);
      if (P.r != null && P.at) { var ds = Drawing.scaleValue(P.scale); ghost(P.at[0], P.at[1], 2 * P.r * ds, 2 * P.r * ds); }
    }
  }
  function dimMatches(ref, d) { return ref.view === d.view && (ref.key ? ref.key === d.key : ref.index === d.index && d.index != null); }

  // ------------------------------------------------------------------ hit testing
  function viewAt(p) {
    var pad = 3 * paperK(), hit = null;
    D.sheet.views.forEach(function (w) { if (p[0] >= w.box.x0 - pad && p[0] <= w.box.x1 + pad && p[1] >= w.box.y0 - pad && p[1] <= w.box.y1 + pad) hit = w; });
    return hit;
  }
  function dimAt(p) {
    var t = pxToPaper(4), hit = null;
    D.sheet.dims.forEach(function (d) { var b = d.box; if (b && p[0] >= b.x0 - t && p[0] <= b.x1 + t && p[1] >= b.y0 - t && p[1] <= b.y1 + t) hit = d; });
    return hit;
  }
  // nearest visible line or circle of an orthographic view within 6 px: { view, a, b (paper), la, lb (model 2D) } or { view, circle, c, r }
  function entityAt(p, any) {
    var tol = pxToPaper(6), best = null, bd = tol;
    D.sheet.views.forEach(function (w) {
      if (!w.ortho && !any) return;   // lengths in a pictorial view are foreshortened (any: pre-highlight only)
      var b = w.box;
      if (p[0] < b.x0 - tol || p[0] > b.x1 + tol || p[1] < b.y0 - tol || p[1] > b.y1 + tol) return;
      w.proj.lines.visible.forEach(function (l) {
        var a = w.toSheet([l[0], l[1]]), b = w.toSheet([l[2], l[3]]), d = segDist(p, a, b);
        if (d < bd) { bd = d; best = { kind: 'entity', view: w.view.id, a: a, b: b, la: [l[0], l[1]], lb: [l[2], l[3]] }; }
      });
      w.proj.circles.visible.forEach(function (c) {
        var cc = w.toSheet(c.c), r = c.r * w.scale, d = Math.abs(Math.hypot(p[0] - cc[0], p[1] - cc[1]) - r);
        if (d < bd) { bd = d; best = { kind: 'entity', view: w.view.id, circle: { c: cc, r: r }, mc: c }; }
      });
      // true arcs: a radius
      (w.proj.arcs ? w.proj.arcs.visible : []).forEach(function (a) {
        var cc = w.toSheet(a.c), r = a.r * w.scale, d = Math.abs(Math.hypot(p[0] - cc[0], p[1] - cc[1]) - r);
        var ang = Math.atan2(p[1] - cc[1], p[0] - cc[0]) * 180 / Math.PI, inside = false;
        for (var j = -2; j <= 2; j++) if (ang + 360 * j >= a.a0 && ang + 360 * j <= a.a1) inside = true;
        if (inside && d < bd) { bd = d; best = { kind: 'entity', view: w.view.id, arc: { c: cc, r: r, a0: a.a0, a1: a.a1 }, ma: a }; }
      });
    });
    return best;
  }
  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }

  // ------------------------------------------------------------------ mouse
  // the sheet sits inside the part viewport: its mouse events must not reach the viewport's own handlers (a double-click
  // there opens the feature under the pointer in the hidden 3D view, a middle drag rotates it)
  function onDown(e) {
    if (!D.active || !D.sheet) return;
    if (D.inline && D.inline.box.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    closeInlineEdit(false);
    var p = toPaper(e);
    stopVbAnim();
    if (ZM.pending) { ZM.pending = 0; }
    if (e.button === 1 || e.button === 2 && e.shiftKey) {
      // middle drag pans; a middle double-click fits the sheet (as in the 3D view)
      var now = performance.now();
      if (e.button === 1 && now - (D.mmbAt || -1e9) < 350) { D.mmbAt = 0; D.drag = null; glideTo(fitBox(), e.isTrusted); return; }
      if (e.button === 1) D.mmbAt = now;
      D.drag = { kind: 'pan', x: e.clientX, y: e.clientY, vb: D.vb && JSON.parse(JSON.stringify(D.vb)) };
      return;
    }
    if (e.button !== 0) return;
    if (D.tool === 'place' && D.pending) { placePending(p); return; }
    if (D.tool === 'project' && D.pending) { projectClick(p); return; }
    if (D.tool === 'section' && D.pending) { sectionClick(p); return; }
    if (D.tool === 'detail' && D.pending) { detailClick(p); return; }
    if (D.tool === 'dim') {
      var ent = entityAt(p);
      if (ent) addDimension(ent); else UI.setStatus('Smart Dimension: click a visible edge or circle of an orthographic view.');
      return;
    }
    if (D.tool === 'centermark') { centerMarkClick(p); return; }
    if (D.tool === 'centerline') { centerlineClick(p); return; }
    if (D.tool === 'holecallout') { holeCalloutClick(p); return; }
    if (D.tool === 'ordinate' || D.tool === 'baseline') { chainDimClick(p); return; }
    if (D.tool === 'chamferdim') { chamferClick(p); return; }
    if (D.tool === 'balloon' || D.tool === 'stackballoon') { balloonClick(p); return; }
    var bl = balloonAt(p);
    if (bl) {
      D.sel = balloonRef(bl);
      D.drag = { kind: 'balloon', view: bl.view, index: bl.index, start: p, c0: bl.c.slice(), moved: false };
      drawOverlay(); renderTree();
      UI.setStatus('Balloon ' + bl.item + ' (Bill of Materials item ' + bl.item + ') — drag to move it, double-click for properties, Delete removes it.');
      return;
    }
    var an = annotAt(p);
    if (an) {
      D.sel = { kind: 'annot', id: an.id, view: an.view };
      if (an.type === 'holeCallout') D.drag = { kind: 'annot', id: an.id, start: p, lead0: (Drawing.findAnnotation(doc(), an.id).annotation.leadNow || [0, 0]).slice(), moved: false };
      drawOverlay(); renderTree();
      UI.setStatus(an.text + (an.dangling ? ' (dangling: its geometry is gone)' : '') + (an.type === 'holeCallout' ? ' — drag to move it, double-click for its text' : '') + ', Delete removes it.');
      return;
    }
    var bt = bomAt(p);
    if (bt) {
      D.sel = { kind: 'bom' };
      D.drag = { kind: 'bom', start: p, x0: bt.box.x0, y0: bt.box.y1, moved: false };
      drawOverlay(); renderTree();
      UI.setStatus('Bill of Materials (' + bt.rows.length + ' items) — drag to move it off its anchor, double-click for properties, Delete removes it.');
      return;
    }
    // a click on an arrowhead of the selected dimension flips its arrows (SolidWorks' arrow handles), r4/drawings4
    var fl = arrowAt(p);
    if (fl) { flipArrows(fl); return; }
    var dm = dimAt(p);
    if (dm) { D.sel = { kind: 'dim', view: dm.view, key: dm.key || null, index: dm.index }; startDimDrag(dm, p); drawOverlay(); renderTree(); UI.setStatus('Dimension ' + dm.text + (dm.auto ? ' (model item)' : '') + ' \u2014 drag to move it (it snaps in line with the others), click an arrowhead to flip the arrows, double-click to edit the value in place, Delete removes it.'); return; }
    var w = viewAt(p);
    if (w) {
      D.sel = { kind: 'view', id: w.view.id };
      D.drag = { kind: 'view', id: w.view.id, start: p, x0: w.view.x, y0: w.view.y, moved: false };
      drawOverlay(); renderTree();
      UI.setStatus(w.view.name + ' (' + w.view.orient + ') \u2014 drag to move' + (w.view.parent != null ? ' along its projection' : '') + ', right-click for options.');
      return;
    }
    D.sel = null;
    D.drag = { kind: 'pan', x: e.clientX, y: e.clientY, vb: JSON.parse(JSON.stringify(D.vb)) };
    drawOverlay(); renderTree();
  }
  function onMove(e) {
    if (!D.active || !D.sheet) return;
    if (D.drag && D.drag.kind === 'pan') {
      var s = svgEl(), m = s && s.getScreenCTM();
      if (!m || !D.drag.vb) return;
      D.vb = { x: D.drag.vb.x - (e.clientX - D.drag.x) / m.a, y: D.drag.vb.y - (e.clientY - D.drag.y) / m.d, w: D.drag.vb.w, h: D.drag.vb.h };
      applyViewBox();
      D.host.classList.add('dw-panning');
      return;
    }
    if (D.drag && D.drag.kind === 'bom') {
      var pb = toPaper(e), db = D.drag;
      if (!db.moved && Math.hypot(pb[0] - db.start[0], pb[1] - db.start[1]) < pxToPaper(3)) return;
      if (!db.moved) { UI.pushUndo(); db.moved = true; D.host.classList.add('dw-dragging'); }
      doc().bom.x = db.x0 + pb[0] - db.start[0]; doc().bom.y = db.y0 + pb[1] - db.start[1];
      queueRender(true);
      return;
    }
    if (D.drag && (D.drag.kind === 'dim' || D.drag.kind === 'balloon' || D.drag.kind === 'annot')) {
      var pd = toPaper(e), dd = D.drag;
      if (!dd.moved && Math.hypot(pd[0] - dd.start[0], pd[1] - dd.start[1]) < pxToPaper(3)) return;
      if (!dd.moved) { UI.pushUndo(); dd.moved = true; D.host.classList.add('dw-dragging'); }
      if (dd.kind === 'dim') { dd.noSnap = !!e.altKey; dragDim(pd); }   // Alt: no snapping (r4/drawings4)
      else if (dd.kind === 'balloon') {
        var vb = Drawing.findView(doc(), dd.view), bb = vb && vb.balloons && vb.balloons[dd.index];
        if (bb) { bb.pos = [dd.c0[0] + pd[0] - dd.start[0] - vb.x, dd.c0[1] + pd[1] - dd.start[1] - vb.y]; queueRender(true); }
      } else {
        var fa = Drawing.findAnnotation(doc(), dd.id);
        if (fa) { fa.annotation.lead = [dd.lead0[0] + pd[0] - dd.start[0], dd.lead0[1] + pd[1] - dd.start[1]]; queueRender(true); }
      }
      return;
    }
    if (D.drag && D.drag.kind === 'view') {
      var p = toPaper(e), dg = D.drag;
      if (!dg.moved && Math.hypot(p[0] - dg.start[0], p[1] - dg.start[1]) < pxToPaper(3)) return;
      if (!dg.moved) { UI.pushUndo(); dg.moved = true; D.host.classList.add('dw-dragging'); D.hover = null; }
      Drawing.moveView(doc(), dg.id, dg.x0 + p[0] - dg.start[0], dg.y0 + p[1] - dg.start[1]);
      liveShift(); drawOverlay();
      return;
    }
    if (e.target && e.target.nodeType && D.host.contains(e.target)) {
      var q = toPaper(e), h = null;
      if (/^(place|project|section|detail)$/.test(D.tool) && D.pending) { D.pending.at = q; drawOverlay(); return; }
      if (D.pending && (D.tool === 'balloon' || D.tool === 'stackballoon')) D.pending.at = q;
      if (/^(dim|centermark|holecallout|ordinate|baseline|chamferdim)$/.test(D.tool)) h = entityAt(q);
      else if (D.tool === 'balloon' || D.tool === 'stackballoon') { var eg = edgeAt(q); h = eg ? { kind: 'edge', view: eg.view, body: eg.body } : null; if (D.pending && D.pending.item && !D.pending.placed) { D.hover = h; drawOverlay(); return; } }
      else if (D.tool === 'centerline') h = null;
      else h = preHighlight(q);
      if (JSON.stringify(h) !== JSON.stringify(D.hover)) { D.hover = h; drawOverlay(); }
    }
  }
  // what the cursor pre-highlights with no tool running (SolidWorks): a balloon, an annotation, a dimension, else the
  // model edge under it (in any view; its view's frame shows too), else the view
  function preHighlight(q) {
    var bl = balloonAt(q);
    if (bl) return { kind: 'balloon', view: bl.view, index: bl.index };
    var an = annotAt(q);
    if (an) return { kind: 'annot', id: an.id };
    var dm = dimAt(q);
    if (dm) return { kind: 'dim', view: dm.view, key: dm.key || null, index: dm.index };
    var ent = entityAt(q, true);
    if (ent) { ent.pre = true; return ent; }
    var w = viewAt(q);
    return w ? { kind: 'view', id: w.view.id } : null;
  }
  function onUp() {
    if (!D.drag) return;
    var dg = D.drag;
    D.drag = null;
    if (D.host) D.host.classList.remove('dw-dragging', 'dw-panning');
    if (D.snapGuide) { D.snapGuide = null; drawOverlay(); }
    if ((dg.kind === 'view' || dg.kind === 'bom' || dg.kind === 'dim' || dg.kind === 'balloon' || dg.kind === 'annot') && dg.moved) { UI.autosave(); render(); }
  }
  // Wheel zoom about the cursor, as in the 3D view (smooth/viewport): each notch (or trackpad scroll / pinch, in
  // proportion to its delta) adds to a pending zoom that eases out over ~50 ms; one notch (deltaY 100) is 1.15×.
  // A script's wheel event (untrusted) or reduced motion zooms at once.
  var WHEEL_K = Math.log(1.15) / 100, ZM = { pending: 0, cx: 0, cy: 0, last: 0, raf: 0 };
  function smoothOn() {
    if (UI.viewAnimation === false) return false;
    try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (err) { }
    return true;
  }
  function zoomAbout(f, cx, cy) {
    var s = svgEl(), m = s && s.getScreenCTM();
    if (!m || !D.vb) return;
    var pt = s.createSVGPoint(); pt.x = cx; pt.y = cy;
    var q = pt.matrixTransform(m.inverse()), S = D.sheet.size, big = Math.max(S[0], S[1]);
    // from a tenth of a millimetre of paper across the window to ten sheets
    f = Math.max(big * 0.02 / D.vb.w, Math.min(big * 10 / D.vb.w, f));
    D.vb = { x: q.x - (q.x - D.vb.x) * f, y: q.y - (q.y - D.vb.y) * f, w: D.vb.w * f, h: D.vb.h * f };
    applyViewBox();
    drawOverlay();
  }
  function stepZoom(now) {
    ZM.raf = 0;
    if (!ZM.pending || !D.active) { ZM.pending = 0; return; }
    var dt = Math.max(0, now - ZM.last), p = ZM.pending, step = p * (1 - Math.exp(-dt / 50));
    ZM.last = now;
    if (Math.abs(p - step) < 2e-4) step = p;
    ZM.pending = p - step;
    zoomAbout(Math.exp(step), ZM.cx, ZM.cy);
    if (ZM.pending) ZM.raf = requestAnimationFrame(stepZoom);
  }
  function onWheel(e) {
    if (!D.active || !D.vb) return;
    e.preventDefault(); e.stopPropagation();
    var dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    var d = Math.max(-0.7, Math.min(0.7, dy * (e.ctrlKey ? 0.01 : WHEEL_K)));
    if (!d) return;
    stopVbAnim();
    if (!e.isTrusted || !smoothOn()) { ZM.pending = 0; zoomAbout(Math.exp(d), e.clientX, e.clientY); return; }
    if (!ZM.pending) ZM.last = performance.now();
    ZM.pending += d; ZM.cx = e.clientX; ZM.cy = e.clientY;
    if (!ZM.raf) ZM.raf = requestAnimationFrame(stepZoom);
  }
  // the sheet glides to a new pan / zoom (F, a middle double-click) over 250 ms; at once for scripts / reduced motion
  var VBA = null;
  function stopVbAnim() { if (VBA) { cancelAnimationFrame(VBA.raf); VBA = null; } }
  function glideTo(vb, animate) {
    stopVbAnim(); ZM.pending = 0;
    if (!animate || !smoothOn() || !D.vb) { D.vb = vb; applyViewBox(); drawOverlay(); return; }
    var from = D.vb, t0 = performance.now();
    VBA = { raf: 0 };
    (function step() {
      var t = Math.min(1, (performance.now() - t0) / 250), e = 1 - Math.pow(1 - t, 3);
      // the zoom eases in log space, so the motion looks even at every scale
      var w = from.w * Math.pow(vb.w / from.w, e), k = Math.abs(vb.w - from.w) > 1e-9 ? (w - from.w) / (vb.w - from.w) : e;
      D.vb = { x: from.x + (vb.x - from.x) * k, y: from.y + (vb.y - from.y) * k, w: w, h: from.h * Math.pow(vb.h / from.h, e) };
      applyViewBox(); drawOverlay();
      if (t < 1 && VBA) VBA.raf = requestAnimationFrame(step); else { VBA = null; D.vb = vb; applyViewBox(); drawOverlay(); }
    })();
  }
  function onDblClick(e) {
    if (D.active) e.stopPropagation();
    if (!D.active || D.tool) return;
    var pp = toPaper(e);
    D.drag = null;
    var bq = balloonAt(pp);
    if (bq) { cmdBalloonProps(bq); return; }
    var aq = annotAt(pp);
    if (aq) { if (aq.type === 'holeCallout') cmdCalloutProps(aq); return; }
    var dq = dimAt(pp);
    if (dq) { cmdDimensionPM(dimRef(dq)); openInlineEdit(dq); return; }
    if (bomAt(toPaper(e))) { cmdBOM(); return; }
    var tf = D.sheet && Drawing.titleFieldAt(D.sheet.size, units(), pp);
    if (tf) { openTitleEdit(tf); return; }
    var w = viewAt(toPaper(e));
    if (w) cmdViewProperties(w.view.id); else cmdSheetProperties();
  }
  function onContext(e) {
    e.preventDefault(); e.stopPropagation();
    if (!D.active) return;
    var p = toPaper(e), w = viewAt(p);
    if (bomAt(p)) { D.sel = { kind: 'bom' }; drawOverlay(); renderTree(); UI.showMenu(e.clientX, e.clientY, bomMenu()); return; }
    if (w) { D.sel = { kind: 'view', id: w.view.id }; drawOverlay(); renderTree(); UI.showMenu(e.clientX, e.clientY, viewMenu(w.view)); }
    else UI.showMenu(e.clientX, e.clientY, sheetMenu());
  }

  // ------------------------------------------------------------------ commands
  function cmdStandard3View() {
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return; }
    edit(function (dc) { syncBom(dc); Drawing.standard3View(dc, mesh(), units()); });
    D.sel = null; fitSheet();
    UI.setStatus('Standard 3 View: Front, Top and Right (' + (doc().sheet.projection === 'first' ? 'first' : 'third') + '-angle) plus an Isometric, scale ' + Drawing.scaleText(doc().sheet.scale) + '.');
  }
  var ORTHO_NAMES = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom'];
  function scaleOptions() { return [['sheet', 'Use sheet scale']].concat(Drawing.SCALES.map(function (s) { return [Drawing.scaleText(s), Drawing.scaleText(s)]; })); }
  function openDrawingPM(spec) {
    var onClose = spec.onClose;
    spec.onClose = function () { $('app').classList.remove('dw-pm'); closeInlineEdit(false); if (onClose) onClose(); if (D.active) { UI.setFmTab('tree'); render(); } };
    UI.openPM(spec);
    $('app').classList.add('dw-pm');
  }
  // Model View: choose an orientation, display style and scale, then click the sheet to place the view.
  function cmdModelView() {
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return; }
    openDrawingPM({
      title: 'Model View', icon: 'modelView', command: 'modelView',
      message: 'Pick the orientation, press OK, then click on the sheet to place the view.',
      values: { orient: 'Isometric', display: 'hlr', scale: 'sheet' },
      groups: [
        { title: 'Orientation', fields: [{ type: 'select', key: 'orient', label: 'View', options: Drawing.ORIENTS }] },
        { title: 'Display Style', fields: [{ type: 'select', key: 'display', label: 'Style', options: [['hlv', 'Hidden Lines Visible'], ['hlr', 'Hidden Lines Removed']] }] },
        { title: 'Scale', fields: [{ type: 'select', key: 'scale', label: 'Scale', options: scaleOptions() }] }
      ],
      onOK: function (v) { startPlacing({ orient: v.orient, display: v.display, scale: v.scale === 'sheet' ? null : Drawing.parseScale(v.scale) }); }
    });
  }
  function startPlacing(spec) {
    var dc = doc(), s = Drawing.scaleValue(spec.scale || dc.sheet.scale), ext = Drawing.extentsOf(mesh(), spec.orient);
    D.tool = 'place';
    D.pending = { spec: spec, w: Math.max(ext.w * s, 1), h: Math.max(ext.h * s, 1), at: null };
    UI.setStatus('Model View (' + spec.orient + '): click on the sheet to place it. Esc cancels.');
    UI.refreshRibbon();
  }
  function placePending(p) {
    var spec = D.pending.spec;
    D.tool = null; D.pending = null;
    var v;
    edit(function (dc) {
      v = Drawing.addView(dc, spec.orient, { display: spec.display || (ORTHO_NAMES.indexOf(spec.orient) >= 0 ? 'hlv' : 'hlr'), scale: spec.scale || null, x: p[0], y: p[1] });
      dc.layout = 'manual';
      autoInsertViews(dc, [v.id]);
    });
    D.sel = { kind: 'view', id: v.id };
    drawOverlay(); renderTree(); UI.refreshRibbon();
    UI.setStatus(v.name + ' (' + v.orient + ') placed.');
    return v;
  }
  // ------------------------------------------------------------------ Projected, Section and Detail View tools
  function startTool(tool, pending) { D.tool = tool; D.pending = pending; D.hover = null; drawOverlay(); UI.refreshRibbon(); }
  function endTool(msg) { D.tool = null; D.pending = null; D.hover = null; drawOverlay(); UI.refreshRibbon(); UI.setStatus(msg || 'Ready'); }
  function sheetView(id) { return D.sheet && D.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function parentAt(p) { var w = viewAt(p); return w && w.view.kind !== 'detail' ? w : null; }
  // Projected View: the parent is the selected view or the next one clicked; then the preview follows the pointer to
  // whichever side of the parent it is on (up / down / left / right), aligned with it, and a click places the view.
  function cmdProjectedView() {
    if (D.tool === 'project') { endTool(); return; }
    var w = D.sel && D.sel.kind === 'view' ? sheetView(D.sel.id) : null;
    startTool('project', { parent: w && w.view.kind !== 'detail' ? w.view.id : null, at: null });
    UI.setStatus(D.pending.parent != null ? 'Projected View from ' + w.view.name + ': move the pointer above, below, left or right of it and click to place. Esc cancels.' : 'Projected View: click the view to project from. Esc cancels.');
  }
  function projectPlacement(p) {
    var w = sheetView(D.pending.parent);
    if (!w) return null;
    var v = w.view, dx = p[0] - v.x, dy = p[1] - v.y;
    var dir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'up' : 'down'), vert = dir === 'up' || dir === 'down';
    var F = Drawing.projectedFrame(w.frame, dir, doc().sheet.projection), ext = Drawing.extentsOf(mesh(), F);
    return { dir: dir, x: vert ? v.x : p[0], y: vert ? p[1] : v.y, w: ext.w * w.scale, h: ext.h * w.scale, name: F.name };
  }
  function projectClick(p) {
    if (D.pending.parent == null) {
      var w = parentAt(p);
      if (!w) { UI.setStatus('Projected View: click a model, projected or section view to project from.'); return; }
      D.pending.parent = w.view.id; D.sel = { kind: 'view', id: w.view.id }; D.pending.at = p;
      drawOverlay(); renderTree();
      UI.setStatus('Projected View from ' + w.view.name + ': move the pointer to a side of it and click to place.');
      return;
    }
    var pl = projectPlacement(p), parent = D.pending.parent, v;
    if (!pl) { endTool(); return; }
    endTool();
    edit(function (dc) { v = Drawing.addProjectedView(dc, mesh(), parent, pl.dir, { x: pl.x, y: pl.y }); autoInsertViews(dc, [v.id]); });
    D.sel = { kind: 'view', id: v.id }; drawOverlay(); renderTree();
    UI.setStatus(v.name + ' (' + v.orient + ') projected ' + pl.dir + ' from its parent, aligned with it.');
    return v;
  }
  // Section View: PropertyManager (cutting line Horizontal / Vertical, label), then click in a view to put the cutting
  // line there (it snaps to hole and boss centres within 8 px), then click on the side the section view goes.
  function cmdSectionView() {
    if (D.tool === 'section') { endTool(); return; }
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return; }
    openDrawingPM({
      title: 'Section View', icon: 'sectionView', command: 'sectionView',
      message: 'Pick the cutting line, press OK, click in a view to place it (it snaps to hole centres), then click on the side where the section view goes.',
      values: { axis: 'h', label: Drawing.nextLabel(doc()) },
      groups: [
        { title: 'Cutting Line', fields: [{ type: 'select', key: 'axis', label: 'Line', options: [['h', 'Horizontal'], ['v', 'Vertical']] }] },
        { title: 'Section View', fields: [{ type: 'text', key: 'label', label: 'Label' }] }
      ],
      onOK: function (val) {
        startTool('section', { axis: val.axis === 'v' ? 'v' : 'h', label: cleanLabel(val.label), parent: null, at: null });
        UI.setStatus('Section View: click in a view to place the ' + (val.axis === 'v' ? 'vertical' : 'horizontal') + ' cutting line. Esc cancels.');
      }
    });
  }
  function cleanLabel(t) { t = String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3); return t || Drawing.nextLabel(doc()); }
  // the cutting line under the pointer: { w, at (model), a, b (paper) }, snapped to circle centres
  function sectionLineAt(p, w) {
    w = w || parentAt(p);
    if (!w) return null;
    var axis = D.pending.axis, mp = w.fromSheet(p), at = axis === 'h' ? mp[1] : mp[0], snap = pxToPaper(8), best = snap;
    w.proj.circles.visible.concat(w.proj.circles.hidden).forEach(function (c) {
      var cs = w.toSheet(c.c), d = axis === 'h' ? Math.abs(cs[1] - p[1]) : Math.abs(cs[0] - p[0]);
      if (d < best) { best = d; at = axis === 'h' ? c.c[1] : c.c[0]; }
    });
    var ext = 5 * paperK(), q = w.toSheet(axis === 'h' ? [0, at] : [at, 0]);
    return axis === 'h' ? { w: w, at: at, a: [w.box.x0 - ext, q[1]], b: [w.box.x1 + ext, q[1]] } : { w: w, at: at, a: [q[0], w.box.y0 - ext], b: [q[0], w.box.y1 + ext] };
  }
  // the pointer's side of the cutting line picks where the view goes; the viewer stands on that side in third angle
  function sectionPlacement(p) {
    var P = D.pending, w = sheetView(P.parent);
    if (!w) return null;
    var side = P.axis === 'h' ? (p[1] >= P.line.a[1] ? 1 : -1) : (p[0] >= P.line.a[0] ? 1 : -1);
    var sign = doc().sheet.projection === 'first' ? -side : side;
    var F = Drawing.sectionFrame(w.frame, P.axis, sign), ext = Drawing.extentsOf(mesh(), F);
    return { sign: sign, x: P.axis === 'h' ? w.view.x : p[0], y: P.axis === 'h' ? p[1] : w.view.y, w: ext.w * w.scale, h: ext.h * w.scale };
  }
  function sectionClick(p) {
    var P = D.pending;
    if (P.parent == null) {
      var sl = sectionLineAt(p);
      if (!sl) { UI.setStatus('Section View: click inside a model, projected or section view to place the cutting line.'); return; }
      P.parent = sl.w.view.id; P.at = p; P.cut = sl.at; P.line = sl;
      drawOverlay();
      UI.setStatus('Section View ' + P.label + '-' + P.label + ': click on the side of the cutting line where the view goes (the arrows point away from it).');
      return;
    }
    var pl = sectionPlacement(p), spec = { axis: P.axis, at: P.cut, sign: pl.sign, x: pl.x, y: pl.y, label: P.label }, parent = P.parent, v;
    endTool();
    edit(function (dc) { v = Drawing.addSectionView(dc, mesh(), parent, spec); autoInsertViews(dc, [v.id]); });
    D.sel = { kind: 'view', id: v.id }; drawOverlay(); renderTree();
    UI.setStatus(v.name + ' placed, cut at ' + Drawing.fmtDim(spec.at, units()) + ' ' + units() + '.');
    return v;
  }
  // Detail View: click the centre of the detail circle in a view, click again to set its radius, then click where
  // the enlarged view goes (twice the parent's scale; change it in the view's properties).
  function cmdDetailView() {
    if (D.tool === 'detail') { endTool(); return; }
    if (!App.mesh || !App.mesh.triCount) { UI.toast(isAsm() ? 'The assembly has no components to draw yet.' : 'The part has no solid body to draw yet.'); return; }
    startTool('detail', { parent: null, at: null });
    UI.setStatus('Detail View: click the centre of the detail circle in a view. Esc cancels.');
  }
  function detailClick(p) {
    var P = D.pending;
    if (P.parent == null) {
      var w = parentAt(p);
      if (!w) { UI.setStatus('Detail View: click inside a model, projected or section view.'); return; }
      P.parent = w.view.id; P.c = w.fromSheet(p); P.cp = p;
      UI.setStatus('Detail View: click to set the radius of the detail circle.');
      return;
    }
    var w2 = sheetView(P.parent);
    if (P.r == null) {
      var r = Math.hypot(p[0] - P.cp[0], p[1] - P.cp[1]) / w2.scale;
      if (!(r > 0)) return;
      P.r = r; P.scale = Drawing.detailScale(w2.view.scale || doc().sheet.scale || [1, 1]);
      UI.setStatus('Detail View (' + Drawing.scaleText(P.scale) + '): click where the view goes.');
      return;
    }
    var spec = { c: P.c, r: P.r, scale: P.scale, x: p[0], y: p[1] }, parent = P.parent, v;
    endTool();
    edit(function (dc) { v = Drawing.addDetailView(dc, mesh(), parent, spec); autoInsertViews(dc, [v.id]); });
    D.sel = { kind: 'view', id: v.id }; drawOverlay(); renderTree();
    UI.setStatus(v.name + ' placed.');
    return v;
  }
  function cmdViewProperties(id) {
    var v = Drawing.findView(doc(), id);
    if (!v) return;
    openDrawingPM({
      title: v.name, icon: 'drawingView', command: 'viewProps',
      values: { orient: v.orient, display: v.display, tangent: v.tangent || 'removed', scale: v.scale ? Drawing.scaleText(v.scale) : 'sheet' },
      // projected, section and detail views take their direction from the parent
      groups: (v.kind ? [] : [{ title: 'Orientation', fields: [{ type: 'select', key: 'orient', label: 'View', options: Drawing.ORIENTS }] }]).concat([
        { title: 'Display Style', fields: [{ type: 'select', key: 'display', label: 'Style', options: [['hlv', 'Hidden Lines Visible'], ['hlr', 'Hidden Lines Removed']] }].concat(v.kind === 'detail' ? [] : [
          { type: 'select', key: 'tangent', label: 'Tangent edges', options: [['visible', 'Tangent Edges Visible'], ['font', 'Tangent Edges With Font'], ['removed', 'Tangent Edges Removed']] }]) },
        { title: 'Scale', fields: [{ type: 'select', key: 'scale', label: 'Scale', options: v.kind === 'detail' ? scaleOptions().slice(1) : scaleOptions() }] }
      ]),
      onOK: function (val) {
        edit(function (dc) {
          var w = Drawing.findView(dc, id);
          if (!w) return;
          if (!w.kind && w.orient !== val.orient) {
            w.orient = val.orient; w.role = null; w.parent = null; w.align = null; w.dims = [];
            // projected views keep the frame they were made with: no longer aligned with the turned parent
            dc.views.forEach(function (c) { if (c.parent === w.id && c.kind === 'projected') { c.parent = null; c.align = null; } });
          }
          if (w.kind === 'detail' && val.scale !== 'sheet') w.name = 'Detail View ' + w.label + ' (' + val.scale + ')';
          w.display = val.display; w.scale = val.scale === 'sheet' ? null : Drawing.parseScale(val.scale);
          if (val.tangent === 'visible' || val.tangent === 'font') w.tangent = val.tangent; else if (val.tangent) delete w.tangent;
          if (w.role === 'iso') w.role = null;
          dc.layout = 'manual';
        });
      }
    });
  }
  function setViewDisplay(id, display) {
    edit(function (dc) { var v = Drawing.findView(dc, id); if (v) v.display = display; });
  }
  // Tangent Edges Visible / With Font / Removed (SolidWorks: view right-click ▸ Tangent Edge); 'removed' is the default
  function setViewTangent(id, mode) {
    edit(function (dc) { var v = Drawing.findView(dc, id); if (v) { if (mode === 'visible' || mode === 'font') v.tangent = mode; else delete v.tangent; } });
  }
  function deleteView(id) {
    edit(function (dc) { Drawing.deleteView(dc, id); });
    D.sel = null; render();
  }
  function deleteSelection() {
    var s = D.sel;
    if (!s) return false;
    if (s.kind === 'view') { deleteView(s.id); return true; }
    if (s.kind === 'bom') { setBom(null); D.sel = null; render(); return true; }
    if (s.kind === 'annot') { edit(function (dc) { Drawing.deleteAnnotation(dc, s.id); }); D.sel = null; render(); return true; }
    if (s.kind === 'balloon') {
      edit(function (dc) {
        var v = Drawing.findView(dc, s.view);
        if (v && v.balloons && s.index != null) v.balloons.splice(s.index, 1);
        else if (v && v.balloons) v.balloons = v.balloons.filter(function (b) { return !(b.key === s.key && b.component === s.component); });
      });
      D.sel = null; render();
      return true;
    }
    if (s.kind === 'dim') {
      edit(function (dc) {
        if (s.key) { dc.suppressed = (dc.suppressed || []).concat([s.key]); return; }
        var v = Drawing.findView(dc, s.view);
        if (v && v.dims) v.dims.splice(s.index, 1);
      });
      D.sel = null; render();
      return true;
    }
    return false;
  }
  function addDimension(ent) {
    var dc = doc(), v = Drawing.findView(dc, ent.view);
    if (!v) return;
    var d;
    if (ent.circle) d = { kind: 'dia', c: ent.mc.c.slice(), r: ent.mc.r, count: 1, value: 2 * ent.mc.r };
    else if (ent.arc) d = { kind: 'rad', c: ent.ma.c.slice(), r: ent.ma.r, a0: ent.ma.a0, a1: ent.ma.a1, count: 1, value: ent.ma.r };
    else {
      var a = ent.la, b = ent.lb, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), w = D.sheet.views.filter(function (x) { return x.view.id === v.id; })[0];
      var cu = (w.proj.bounds.umin + w.proj.bounds.umax) / 2, cv = (w.proj.bounds.vmin + w.proj.bounds.vmax) / 2;
      if (Math.abs(dy) <= L * 1e-9) d = { kind: 'h', a: a.slice(), b: b.slice(), side: (a[1] + b[1]) / 2 >= cv ? 1 : -1, value: Math.abs(dx) };
      else if (Math.abs(dx) <= L * 1e-9) d = { kind: 'v', a: a.slice(), b: b.slice(), side: (a[0] + b[0]) / 2 >= cu ? 1 : -1, value: Math.abs(dy) };
      else d = { kind: 'aligned', a: a.slice(), b: b.slice(), value: L };
    }
    edit(function (dcc) { var vv = Drawing.findView(dcc, ent.view); vv.dims = (vv.dims || []).concat([d]); });
    UI.setStatus('Dimension ' + Drawing.dimText(d, units()) + ' added to ' + v.name + '.');
    return d;
  }
  function cmdSmartDimension() {
    D.tool = D.tool === 'dim' ? null : 'dim'; D.pending = null; D.hover = null;
    drawOverlay(); UI.refreshRibbon();
    UI.setStatus(D.tool === 'dim' ? 'Smart Dimension: click a visible edge (length) or circle (diameter) in an orthographic view. Esc ends.' : 'Ready');
  }
  function cmdModelItems() {
    edit(function (dc) { dc.autoDims = !dc.autoDims; if (dc.autoDims) dc.suppressed = []; });
    UI.refreshRibbon();
    UI.setStatus(doc().autoDims ? 'Model Items: overall sizes and diameters shown.' : 'Model Items hidden.');
  }
  function setSheet(props) {
    edit(function (dc) {
      if (props.format && Drawing.FORMATS[props.format]) dc.sheet.format = props.format;
      if (props.projection) dc.sheet.projection = props.projection === 'first' ? 'first' : 'third';
      if (props.scale === 'auto' || props.scale === null) dc.sheet.autoScale = true;
      else if (props.scale) { var sc = Array.isArray(props.scale) ? props.scale : Drawing.parseScale(props.scale); if (sc) { dc.sheet.scale = sc; dc.sheet.autoScale = false; } }
      if (props.name) dc.sheet.name = String(props.name);
      if (props.titleBlock) applyTitleBlock(dc, props.titleBlock);   // same undo step as the sheet change
      // re-place the standard views for the new sheet / scale / projection
      if (dc.views.some(function (v) { return v.role; })) { var manual = dc.layout === 'manual'; relayout(dc); if (manual) dc.layout = 'manual'; }
    });
    fitSheet();
  }
  function cmdSheetProperties() {
    var dc = doc(), s = dc.sheet;
    var fmt = el('select'), sc = el('select'), nm = el('input', { type: 'text', value: s.name }), proj = el('select');
    Object.keys(Drawing.FORMATS).forEach(function (f) { var o = el('option', { value: f, text: f + ' (' + Drawing.FORMATS[f].map(function (x) { return units() === 'in' ? (x / 25.4).toFixed(1) : Math.round(x); }).join(' \u00d7 ') + ' ' + units() + ')' }); if (f === s.format) o.selected = true; fmt.appendChild(o); });
    [['auto', 'Automatic (' + Drawing.scaleText(s.scale) + ')']].concat(Drawing.SCALES.map(function (x) { return [Drawing.scaleText(x), Drawing.scaleText(x)]; })).forEach(function (o) { var op = el('option', { value: o[0], text: o[1] }); if ((s.autoScale && o[0] === 'auto') || (!s.autoScale && o[0] === Drawing.scaleText(s.scale))) op.selected = true; sc.appendChild(op); });
    [['third', 'Third angle'], ['first', 'First angle']].forEach(function (o) { var op = el('option', { value: o[0], text: o[1] }); if (s.projection === o[0]) op.selected = true; proj.appendChild(op); });
    var body = el('div', { class: 'dw-props' }, [
      el('label', { text: 'Name' }), nm, el('label', { text: 'Sheet format / size' }), fmt,
      el('label', { text: 'Scale' }), sc, el('label', { text: 'Type of projection' }), proj
    ]);
    // title block: each field's text with its links ($PRPSHEET:"Material" reads the model's custom property)
    var own = dc.titleBlock || {}, shown = Drawing.titleBlock(dc, App.model, cctx()), tbInputs = {};
    body.appendChild(el('div', { class: 'dw-tb-head', text: 'Title block (links: $PRPSHEET:"property" from File \u25b8 Properties, $PRP:"SW-File Name" from the drawing)' }));
    Drawing.TB_FIELDS.forEach(function (f) {
      var inp = el('input', { type: 'text', value: own[f.key] != null ? own[f.key] : f.link, title: 'Shows: ' + (shown[f.key] || '(empty)'), 'data-tb': f.key });
      tbInputs[f.key] = inp;
      body.appendChild(el('label', { text: f.label })); body.appendChild(inp);
    });
    UI.showModal({ title: 'Sheet Properties', body: body, buttons: [
      { label: 'Apply Changes', primary: true, action: function () { UI.closeModal(); var tb = {}; Object.keys(tbInputs).forEach(function (k) { tb[k] = tbInputs[k].value; }); setSheet({ name: nm.value, format: fmt.value, scale: sc.value, projection: proj.value, titleBlock: tb }); } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  function safeName() { return (doc().name + '_' + (App.model.name || 'part')).replace(/[^\w\-]+/g, '_'); }
  function exportAs(kind) {
    if (!D.sheet) render();
    var sh = D.sheet;
    if (kind === 'svg') UI.exportDialog('Save Drawing as SVG', safeName() + '.svg', Drawing.toSVG(sh), 'image/svg+xml');
    else if (kind === 'dxf') UI.exportDialog('Save Drawing as DXF (one layer per view)', safeName() + '.dxf', Drawing.toDXF(sh), 'application/dxf');
    else if (kind === 'pdf') UI.exportDialog('Save Drawing as PDF', safeName() + '.pdf', Drawing.toPDF(sh), 'application/pdf');
  }
  function viewMenu(v) {
    return [
      { label: 'Properties\u2026', action: function () { cmdViewProperties(v.id); } },
      { sep: true },
      { label: 'Projected View', disabled: v.kind === 'detail', action: function () { D.sel = { kind: 'view', id: v.id }; cmdProjectedView(); } },
      { label: 'Auto Balloon', disabled: !isAsm() || v.kind === 'detail', action: function () { autoBalloonView(v.id); } },
      { sep: true },
      { label: 'Display \u25b8 Hidden Lines Visible', checked: v.display === 'hlv', action: function () { setViewDisplay(v.id, 'hlv'); } },
      { label: 'Display \u25b8 Hidden Lines Removed', checked: v.display === 'hlr', action: function () { setViewDisplay(v.id, 'hlr'); } },
      { sep: true },
      { label: 'Tangent Edge \u25b8 Tangent Edges Visible', disabled: v.kind === 'detail', checked: v.tangent === 'visible', action: function () { setViewTangent(v.id, 'visible'); } },
      { label: 'Tangent Edge \u25b8 Tangent Edges With Font', disabled: v.kind === 'detail', checked: v.tangent === 'font', action: function () { setViewTangent(v.id, 'font'); } },
      { label: 'Tangent Edge \u25b8 Tangent Edges Removed', disabled: v.kind === 'detail', checked: !v.tangent || v.tangent === 'removed', action: function () { setViewTangent(v.id, 'removed'); } },
      { sep: true },
      { label: 'Delete', key: 'Del', action: function () { deleteView(v.id); } }
    ];
  }
  function sheetMenu() {
    return [
      { label: 'Properties\u2026', action: cmdSheetProperties },
      { label: 'Standard 3 View', action: cmdStandard3View },
      { label: 'Model View\u2026', action: cmdModelView },
      { label: 'Model Items', checked: !!(doc() && doc().autoDims), action: cmdModelItems },
      { label: 'Document Properties\u2026', action: cmdDocProps },
      { sep: true },
      { label: 'Zoom to Fit', key: 'F', action: fitSheet }
    ];
  }


  // ------------------------------------------------------------------ assembly drawings: Auto Balloon, Bill of Materials
  function defaultBalloonView() {
    var dc = doc(), s = D.sel && D.sel.kind === 'view' ? Drawing.findView(dc, D.sel.id) : null;
    return s || dc.views.filter(function (v) { return v.role === 'iso'; })[0] || dc.views.filter(function (v) { return v.orient === 'Isometric'; })[0] || dc.views[0] || null;
  }
  function needAsm(what) {
    if (isAsm()) return true;
    UI.toast(what + ' numbers the components of an assembly: open the drawing of an assembly (File ▸ Make Drawing from Assembly).');
    return false;
  }
  function autoBalloonView(id, opts) {
    if (!needAsm('Auto Balloon')) return 0;
    edit(function (dc) { Drawing.autoBalloon(dc, App.model, id, opts); });
    var n = (D.sheet.balloons || []).filter(function (b) { return b.view === id; }).length, v = Drawing.findView(doc(), id);
    UI.setStatus('Auto Balloon: ' + n + ' balloon' + (n === 1 ? '' : 's') + ' on ' + (v ? v.name : 'the view') + ', numbered after the Bill of Materials.');
    return n;
  }
  // Auto Balloon PropertyManager: the view (default: the selected one, else the isometric) and Ignore multiple instances
  function cmdAutoBalloon() {
    if (!needAsm('Auto Balloon')) return;
    var dc = doc(), v0 = defaultBalloonView();
    if (!v0) { UI.toast('Add a drawing view first.'); return; }
    openDrawingPM({
      title: 'Auto Balloon', icon: 'autoBalloon', command: 'autoBalloon',
      message: 'Balloons every component in the view with its Bill of Materials item number, on a square around the view.',
      values: { view: v0.id, ignoreMultiple: true },
      groups: [
        { title: 'Drawing View', fields: [{ type: 'select', key: 'view', label: 'View', options: dc.views.map(function (v) { return [v.id, v.name + (v.kind ? '' : ' (' + v.orient + ')')]; }) }] },
        { title: 'Balloon Layout', fields: [{ type: 'static', label: 'Layout', value: 'Square' }, { type: 'check', key: 'ignoreMultiple', label: 'Ignore multiple instances' }] }
      ],
      onOK: function (val) { autoBalloonView(+val.view, { ignoreMultiple: !!val.ignoreMultiple }); }
    });
  }
  // Bill of Materials PropertyManager: Table Position (the corner of the sheet it is anchored to) or remove it
  var ANCHOR_NAMES = { 'top-right': 'Top Right', 'top-left': 'Top Left', 'bottom-right': 'Bottom Right (above the title block)', 'bottom-left': 'Bottom Left' };
  function setBom(props) {
    edit(function (dc) {
      if (props === null) { dc.bom = { show: false, anchor: (dc.bom && dc.bom.anchor) || 'top-right' }; return; }
      var b = dc.bom || { anchor: 'top-right' };
      b.show = true;
      if (props.anchor && ANCHOR_NAMES[props.anchor]) { b.anchor = props.anchor; delete b.x; delete b.y; }
      if (props.x != null && props.y != null) { b.x = +props.x; b.y = +props.y; }
      if (props.type) b.type = Drawing.bomType(props.type);
      if (props.columns !== undefined) { if (props.columns && props.columns.length) b.columns = JSON.parse(JSON.stringify(props.columns)); else delete b.columns; }
      dc.bom = b;
      syncBom(dc);
      if (dc.layout === 'auto') Drawing.layout(dc, mesh(), units());
    });
  }
  // Bill of Materials PropertyManager (part and assembly drawings): Table Position, BOM Type (Top-level only / Parts
  // only), Columns (show / hide each one) and Add Column (a column bound to a custom property: Material, Mass, Vendor…)
  function cmdBOM() {
    var b = doc().bom || { anchor: 'top-right' }, specs = Drawing.bomColumnSpecs(b);
    var values = { anchor: b.x != null ? 'moved' : b.anchor || 'top-right', type: Drawing.bomType(b.type), addProp: '', addTitle: '' };
    var colFields = specs.map(function (c, i) {
      values['col' + i] = !c.hidden;
      var t = c.title || (c.type === 'property' ? String(c.prop).toUpperCase() : { item: 'ITEM NO.', partNumber: 'PART NUMBER', description: 'DESCRIPTION', qty: 'QTY.' }[c.type]);
      return { type: 'check', key: 'col' + i, label: t + (c.type === 'property' ? '  (property "' + c.prop + '")' : '') };
    });
    var used = {}; specs.forEach(function (c) { if (c.type === 'property') used[String(c.prop).toLowerCase()] = 1; });
    var names = Drawing.bomPropertyNames(App.model).filter(function (n) { return !used[n.toLowerCase()]; });
    openDrawingPM({
      title: 'Bill of Materials', icon: 'bom', command: 'bom',
      message: (isAsm() ? 'One row per distinct part (identical components counted together)' : 'The part, or with Parts only each of its solid bodies') + '. Columns can show custom properties from File ▸ Properties (Material and Mass fall back to the part’s material and mass). Balloons use the item numbers.',
      values: values,
      groups: [
        { title: 'Table Position', fields: [{ type: 'select', key: 'anchor', label: 'Anchor', options: (b.x != null ? [['moved', 'Where it was dragged']] : []).concat(Drawing.BOM_ANCHORS.map(function (a) { return [a, ANCHOR_NAMES[a]]; })) }] },
        { title: 'BOM Type', fields: [{ type: 'select', key: 'type', label: 'Type', options: Drawing.BOM_TYPES }] },
        { title: 'Columns', fields: colFields },
        { title: 'Add Column', collapsed: false, fields: [
          { type: 'select', key: 'addProp', label: 'Property', options: [['', '(none)']].concat(names.map(function (n) { return [n, n]; })) },
          { type: 'text', key: 'addTitle', label: 'Title (optional)' }
        ] }
      ],
      onOK: function (val) {
        var cols = specs.map(function (c, i) { var o = JSON.parse(JSON.stringify(c)); if (val['col' + i]) delete o.hidden; else o.hidden = true; return o; });
        if (val.addProp) { var nc = { type: 'property', prop: val.addProp }; if (String(val.addTitle || '').trim()) nc.title = String(val.addTitle).trim(); cols.push(nc); }
        var props = { type: val.type, columns: cols };
        if (val.anchor !== 'moved') props.anchor = val.anchor;
        setBom(props);
        var n = D.sheet.bom ? D.sheet.bom.rows.length : 0;
        UI.setStatus('Bill of Materials (' + ({ parts: 'Parts only', indented: 'Indented' }[val.type] || 'Top-level only') + '): ' + n + ' item' + (n === 1 ? '' : 's') + ', ' + (doc().bom.x != null ? 'where it was dragged' : 'anchored ' + ANCHOR_NAMES[doc().bom.anchor]) + '.');
      }
    });
  }
  // setTitleBlock({ key: text | null }): a title block field's text (links included); null restores the default link
  function setTitleBlock(map) { edit(function (dc) { applyTitleBlock(dc, map); }); }
  function applyTitleBlock(dc, map) {
    var tb = dc.titleBlock || {};
    Object.keys(map || {}).forEach(function (k) {
      var f = Drawing.TB_FIELDS.filter(function (x) { return x.key === k; })[0];
      if (!f) return;
      if (map[k] == null || String(map[k]) === f.link) delete tb[k]; else tb[k] = String(map[k]);
    });
    if (Object.keys(tb).length) dc.titleBlock = tb; else delete dc.titleBlock;
  }
  function bomMenu() {
    return [
      { label: 'Properties…', action: cmdBOM },
      { label: 'Delete', key: 'Del', action: function () { setBom(null); D.sel = null; render(); } }
    ];
  }
  function bomAt(p) { var b = D.sheet && D.sheet.bom && D.sheet.bom.box; return b && p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1 ? D.sheet.bom : null; }
  function balloonAt(p) {
    var hit = null;
    (D.sheet && D.sheet.balloons || []).forEach(function (b) { if (Math.hypot(p[0] - b.c[0], p[1] - b.c[1]) <= b.r + pxToPaper(2)) hit = b; });
    return hit;
  }


  // ------------------------------------------------------------------ annotations: tools, PropertyManagers, dragging
  // Annotation ribbon tab (SolidWorks placement): Smart Dimension, Ordinate / Baseline / Chamfer Dimension, Model
  // Items, Balloon, Stacked Balloon, Auto Balloon, Hole Callout, Center Mark, Centerline. Every tool is picked from the
  // ribbon (or Insert ▸ Annotations), clicks go to the tool while it is active, Esc or the PropertyManager's ✓ / ✗ ends it.
  // Drag a dimension's text, a callout or a balloon to move it; double-click a dimension for the Dimension
  // PropertyManager (value, tolerance, precision, text, arrows: a model item's value drives the part) or a balloon for
  // the Balloon PropertyManager (quantity, stack direction).
  function sheetDim(ref) { return D.sheet && D.sheet.dims.filter(function (d) { return dimMatches(ref, d); })[0] || null; }
  function dimRef(d) { return { kind: 'dim', view: d.view, key: d.key || null, index: d.index, style: d.style || null }; }
  // where a dimension's properties live: a model item's in doc.dimProps[style], a Smart Dimension's on itself
  function dimTarget(dc, d) {
    if (d.auto) { dc.dimProps = dc.dimProps || {}; return dc.dimProps[d.style] || (dc.dimProps[d.style] = {}); }
    var v = Drawing.findView(dc, d.view);
    return v && v.dims ? v.dims[d.index] : null;
  }
  function cleanDimProps(dc) { if (dc.dimProps) Object.keys(dc.dimProps).forEach(function (k) { if (!Object.keys(dc.dimProps[k]).length) delete dc.dimProps[k]; }); }
  function setDimProps(d, props) {
    edit(function (dc) { var t = dimTarget(dc, d); if (t) Drawing.setDimProps(t, props); cleanDimProps(dc); });
  }
  function annotAt(p) {
    var t = pxToPaper(4), hit = null;
    (D.sheet && D.sheet.annotations || []).forEach(function (a) { var b = a.box; if (b && p[0] >= b.x0 - t && p[0] <= b.x1 + t && p[1] >= b.y0 - t && p[1] <= b.y1 + t) hit = a; });
    return hit;
  }
  // nearest visible edge or circle of any view (pictorial ones too) within 6 px, with the body it belongs to
  function edgeAt(p) {
    var tol = pxToPaper(6), best = null, bd = tol;
    D.sheet.views.forEach(function (w) {
      w.proj.lines.visible.forEach(function (l) {
        var a = w.toSheet([l[0], l[1]]), b = w.toSheet([l[2], l[3]]), d = segDist(p, a, b);
        if (d < bd) { bd = d; best = { view: w.view.id, w: w, body: l[4] || 0, at: w.fromSheet(p) }; }
      });
      w.proj.circles.visible.concat(w.proj.arcs ? w.proj.arcs.visible : []).forEach(function (c) {
        var cc = w.toSheet(c.c), d = Math.abs(Math.hypot(p[0] - cc[0], p[1] - cc[1]) - c.r * w.scale);
        if (d < bd) { bd = d; best = { view: w.view.id, w: w, body: c.body || 0, at: w.fromSheet(p) }; }
      });
      (w.proj.ellipses ? w.proj.ellipses.visible : []).forEach(function (el) {
        var n = 48, prev = null;
        for (var i = 0; i <= n; i++) {
          var t = el.t0 + (el.t1 - el.t0) * i / n, q = w.toSheet([el.c[0] + el.ax[0] * Math.cos(t) + el.ay[0] * Math.sin(t), el.c[1] + el.ax[1] * Math.cos(t) + el.ay[1] * Math.sin(t)]);
          if (prev) { var d = segDist(p, prev, q); if (d < bd) { bd = d; best = { view: w.view.id, w: w, body: el.body || 0, at: w.fromSheet(p) }; } }
          prev = q;
        }
      });
    });
    return best;
  }
  function entRef(ent) { return ent.circle ? { c: ent.mc.c.slice(), r: ent.mc.r } : ent.arc ? { c: ent.ma.c.slice(), r: ent.ma.r } : { a: ent.la.slice(), b: ent.lb.slice() }; }
  // the component (assembly) or body (part) under a clicked edge -> { key, component }
  function bodyItem(body) {
    if (isAsm()) { var c = App.model.components[body]; return c ? { component: c.id } : null; }
    return { key: 'part' };
  }
  function toolPM(spec, tool, pending) {
    var onClose = spec.onClose;
    spec.onClose = function () { if (D.tool === tool) { D.tool = null; D.pending = null; D.hover = null; UI.refreshRibbon(); } if (onClose) onClose(); };
    openDrawingPM(spec);
    D.tool = tool; D.pending = pending; D.hover = null;
    drawOverlay(); UI.refreshRibbon();
  }
  function endToolPM() { if (UI.hasPM && UI.hasPM()) UI.pmCancel(); else endTool(); }

  // Center Mark: Single (each circle clicked gets a mark), Linear or Circular (click the holes, then ✓)
  function cmdCenterMark() {
    if (D.tool === 'centermark') { endToolPM(); return; }
    var o = Drawing.docOptions(doc());
    toolPM({
      title: 'Center Mark', icon: 'centerMark', command: 'centerMark',
      message: 'Single: click a hole (circle) in a view to mark it. Linear / Circular: click the holes of the pattern, then ✓.',
      values: { style: 'single', ext: o.extLines, size: o.markSize },
      groups: [
        { title: 'Manual Insert Options', fields: [{ type: 'select', key: 'style', label: 'Style', options: [['single', 'Single Center Mark'], ['linear', 'Linear Center Mark'], ['circular', 'Circular Center Mark']] }] },
        { title: 'Display Attributes', fields: [{ type: 'check', key: 'ext', label: 'Extended lines' }, { type: 'number', key: 'size', label: 'Mark size', unit: 'mm', min: 0.5 }] }
      ],
      onChange: function (v) { if (D.pending) { D.pending.style = v.style; D.pending.ext = !!v.ext; D.pending.size = +v.size || o.markSize; } },
      onOK: function (v) {
        var P = D.pending;
        if (v.style !== 'single' && P && P.holes.length) {
          try { centerMarkFrom(P.view, v.style, P.holes, v); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return false; }
        }
      }
    }, 'centermark', { style: 'single', ext: o.extLines, size: o.markSize, view: null, holes: [] });
    UI.setStatus('Center Mark: click a hole in a view. Esc ends.');
  }
  function centerMarkFrom(viewId, style, holes, v) {
    var an;
    var probe = JSON.parse(JSON.stringify(doc()));
    Drawing.addCenterMark(probe, viewId, { style: style, holes: holes });   // refuses bad input before the undo step
    edit(function (dc) {
      var spec = { style: style, holes: holes };
      if (v && v.ext !== Drawing.docOptions(dc).extLines) spec.ext = !!v.ext;
      if (v && +v.size > 0 && +v.size !== Drawing.docOptions(dc).markSize) spec.size = +v.size;
      an = Drawing.addCenterMark(dc, viewId, spec);
    });
    UI.setStatus((style === 'single' ? 'Center mark' : style === 'linear' ? 'Linear center mark on ' + holes.length + ' holes' : 'Circular center mark on ' + holes.length + ' holes') + ' added.');
    return an;
  }
  function centerMarkClick(p) {
    var ent = entityAt(p), P = D.pending;
    if (!ent || !ent.circle) { UI.setStatus('Center Mark: click a circle (hole) of an orthographic view.'); return; }
    var h = { c: ent.mc.c.slice(), r: ent.mc.r };
    if (P.style === 'single') { centerMarkFrom(ent.view, 'single', [h], P); return; }
    if (P.view != null && P.view !== ent.view) { UI.setStatus('Center Mark: the holes of one mark must be in the same view.'); return; }
    P.view = ent.view;
    if (!P.holes.some(function (q) { return Math.hypot(q.c[0] - h.c[0], q.c[1] - h.c[1]) < 1e-9; })) P.holes.push(h);
    drawOverlay();
    UI.setStatus(P.holes.length + ' hole' + (P.holes.length === 1 ? '' : 's') + ' picked for the ' + P.style + ' center mark: pick more, then ✓.');
  }
  // Centerline: click near the axis of a cylinder seen from the side (or one of its silhouette edges), or two parallel
  // edges one after the other (the centreline runs midway between them)
  function cmdCenterline() {
    if (D.tool === 'centerline') { endTool(); return; }
    startTool('centerline', { first: null });
    UI.setStatus('Centerline: click a cylinder or hole seen from the side, or two parallel edges. Esc ends.');
  }
  function centerlineClick(p) {
    var w = viewAt(p);
    if (!w) { UI.setStatus('Centerline: click inside a view.'); return; }
    var m = w.section ? w.section.mesh : mesh(), best = null, bd = Infinity;
    if (w.ortho && m.faces.length) Drawing.cylAxes(m, w.frame).forEach(function (ax) {
      var a = w.toSheet(ax.a), b = w.toSheet(ax.b), d = segDist(p, a, b);
      if (d <= ax.r * w.scale + pxToPaper(6) && d < bd) { bd = d; best = ax; }
    });
    if (best) { addCenterlineUI(w.view.id, { a: best.a, b: best.b, r: best.r }); return; }
    var ent = entityAt(p);
    if (!ent || ent.circle || ent.arc) { UI.setStatus('Centerline: no cylinder axis there; click an edge to pair it with a parallel one.'); return; }
    var P = D.pending;
    if (!P.first || P.first.view !== ent.view) { P.first = ent; UI.setStatus('Centerline: now click the parallel edge.'); return; }
    var a = P.first.la, b = P.first.lb, c = ent.la, d2 = ent.lb, t = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(t[0], t[1]);
    t = [t[0] / L, t[1] / L];
    var u = [d2[0] - c[0], d2[1] - c[1]], Lu = Math.hypot(u[0], u[1]);
    if (Math.abs(t[0] * u[1] - t[1] * u[0]) > Lu * 1e-6) { P.first = ent; UI.setStatus('Centerline: the edges are not parallel; click the parallel edge.'); return; }
    var pc = function (q) { return (q[0] - a[0]) * t[0] + (q[1] - a[1]) * t[1]; }, off = t[0] * (c[1] - a[1]) - t[1] * (c[0] - a[0]);
    var s0 = Math.min(0, L, pc(c), pc(d2)), s1 = Math.max(0, L, pc(c), pc(d2)), n = [-t[1], t[0]];
    var mid = function (s) { return [a[0] + t[0] * s + n[0] * off / 2, a[1] + t[1] * s + n[1] * off / 2]; };
    P.first = null;
    addCenterlineUI(ent.view, { a: mid(s0), b: mid(s1) });
  }
  function addCenterlineUI(viewId, spec) {
    edit(function (dc) { Drawing.addCenterline(dc, viewId, spec); });
    UI.setStatus('Centerline added.');
  }
  // Hole Callout: click a hole; the callout reads the hole (diameter, THRU or depth, counterbore / countersink, 4X)
  function cmdHoleCallout() {
    if (D.tool === 'holecallout') { endTool(); return; }
    startTool('holecallout', {});
    UI.setStatus('Hole Callout: click the edge of a hole in a view. Esc ends.');
  }
  function holeCalloutClick(p) {
    var ent = entityAt(p);
    if (!ent || !ent.circle) { UI.setStatus('Hole Callout: click the edge of a hole (a circle) in an orthographic view.'); return; }
    var w = sheetView(ent.view);
    if (!Drawing.holeInfo(mesh(), w.frame, ent.mc.c, ent.mc.r)) { UI.setStatus('Hole Callout: that circle is not a hole.'); return; }
    var an;
    edit(function (dc) { an = Drawing.addHoleCallout(dc, ent.view, { c: ent.mc.c, r: ent.mc.r }); });
    var s = (D.sheet.annotations || []).filter(function (a) { return a.id === an.id; })[0];
    D.sel = { kind: 'annot', id: an.id }; drawOverlay();
    UI.setStatus('Hole Callout: ' + (s ? s.text : '') + ' — drag it to move it.');
  }
  // Ordinate / Baseline Dimension: pick the direction, click the base (an edge or a hole), then every feature to
  // dimension from it; ✓ ends. The first feature creates the dimension (one undo step), the next ones extend it.
  function cmdChainDim(kind) {
    var tool = kind === 'ordinate' ? 'ordinate' : 'baseline';
    if (D.tool === tool) { endToolPM(); return; }
    var name = kind === 'ordinate' ? 'Ordinate Dimension' : 'Baseline Dimension';
    toolPM({
      title: name, icon: kind === 'ordinate' ? 'ordinateDim' : 'baselineDim', command: tool,
      message: 'Click the base (an edge or hole) in an orthographic view, then each feature to dimension from it. ✓ ends.',
      values: { dir: 'h' },
      groups: [{ title: 'Direction', fields: [{ type: 'select', key: 'dir', label: 'Measure', options: [['h', 'Horizontal'], ['v', 'Vertical']] }] }],
      onChange: function (v) { if (D.pending && !D.pending.dim) D.pending.dir = v.dir === 'v' ? 'v' : 'h'; }
    }, tool, { kind: kind, dir: 'h', view: null, base: null, dim: null });
    UI.setStatus(name + ': click the base edge or hole. Esc ends.');
  }
  function chainDimClick(p) {
    var ent = entityAt(p), P = D.pending, name = P.kind === 'ordinate' ? 'Ordinate' : 'Baseline';
    if (!ent) { UI.setStatus(name + ': click an edge or hole of an orthographic view.'); return; }
    if (!P.base) { P.base = entRef(ent); P.view = ent.view; UI.setStatus(name + ': base picked; now click the features to dimension.'); return; }
    if (ent.view !== P.view) { UI.setStatus(name + ': stay in the view of the base.'); return; }
    var ref = entRef(ent);
    if (!P.dim) {
      var d;
      edit(function (dc) { d = (P.kind === 'ordinate' ? Drawing.addOrdinate : Drawing.addBaseline)(dc, P.view, { dir: P.dir, base: P.base, refs: [ref] }); });
      P.dim = { view: P.view, index: Drawing.findView(doc(), P.view).dims.length - 1 };
    } else {
      var v = Drawing.findView(doc(), P.dim.view), dd = v && v.dims[P.dim.index];
      if (dd) { dd.refs.push(Drawing.refFrom(ref)); UI.autosave(); render(); }
    }
    var sd = D.sheet.dims.filter(function (x) { return x.view === P.dim.view && x.index === P.dim.index; })[0];
    UI.setStatus(name + ' dimensions: ' + (sd ? sd.text : '') + ' — click more, ✓ ends.');
  }
  // Chamfer Dimension: click the chamfer edge, then the lead-in edge it makes the angle with ("1 X 45°")
  function cmdChamferDim() {
    if (D.tool === 'chamferdim') { endTool(); return; }
    startTool('chamferdim', { first: null });
    UI.setStatus('Chamfer Dimension: click the chamfer edge, then the lead-in edge. Esc ends.');
  }
  function chamferClick(p) {
    var ent = entityAt(p), P = D.pending;
    if (!ent || ent.circle || ent.arc) { UI.setStatus('Chamfer Dimension: click a straight edge of an orthographic view.'); return; }
    if (!P.first || P.first.view !== ent.view) { P.first = ent; UI.setStatus('Chamfer Dimension: now click the lead-in edge.'); return; }
    var spec = { a: P.first.la, b: P.first.lb, ref: { a: ent.la, b: ent.lb } }, viewId = ent.view, d;
    P.first = null;
    try { Drawing.addChamferDim(JSON.parse(JSON.stringify(doc())), viewId, spec); } catch (err) { UI.setStatus(err.message); UI.toast(err.message); return; }
    edit(function (dc) { d = Drawing.addChamferDim(dc, viewId, spec); });
    UI.setStatus('Chamfer dimension ' + Drawing.dimLabel(d, units()).text + ' added.');
  }
  // Balloon: click an edge of a component (or the part) in any view, then where the balloon goes. Stacked Balloon:
  // the same, then more edges add their items to the stack; ✓ ends.
  function cmdBalloon(stacked) {
    var tool = stacked ? 'stackballoon' : 'balloon';
    if (D.tool === tool) { endToolPM(); return; }
    var o = Drawing.docOptions(doc());
    toolPM({
      title: stacked ? 'Stacked Balloon' : 'Balloon', icon: stacked ? 'stackBalloon' : 'balloon', command: tool,
      message: stacked ? 'Click an edge of the first item, click where the stack goes, then click edges of the other items. ✓ ends.' : 'Click an edge of a ' + (isAsm() ? 'component' : 'part') + ' in a view, then click where the balloon goes.',
      values: { qty: o.balloonQty, qtyPos: 'right', stackDir: 'right' },
      groups: [
        { title: 'Quantity', fields: [{ type: 'check', key: 'qty', label: 'Show quantity (QTY)' }, { type: 'select', key: 'qtyPos', label: 'Placement', options: [['right', 'Right'], ['left', 'Left'], ['up', 'Top'], ['down', 'Bottom']] }] }
      ].concat(stacked ? [{ title: 'Stack', fields: [{ type: 'select', key: 'stackDir', label: 'Direction', options: [['right', 'Right'], ['left', 'Left'], ['up', 'Up'], ['down', 'Down']] }] }] : []),
      onChange: function (v) { if (D.pending) { D.pending.qty = !!v.qty; D.pending.qtyPos = v.qtyPos; D.pending.stackDir = v.stackDir; } }
    }, tool, { stacked: !!stacked, qty: o.balloonQty, qtyPos: 'right', stackDir: 'right', item: null, placed: null });
    UI.setStatus((stacked ? 'Stacked Balloon' : 'Balloon') + ': click an edge of a ' + (isAsm() ? 'component' : 'part') + '. Esc ends.');
  }
  function balloonClick(p) {
    var P = D.pending;
    if (P.placed) {
      // stacked: every further edge adds its item to the stack
      var e2 = edgeAt(p), it2 = e2 && bodyItem(e2.body);
      if (!it2) { UI.setStatus('Stacked Balloon: click an edge of another item, or ✓ to finish.'); return; }
      var v = Drawing.findView(doc(), P.placed.view), b = v && v.balloons[P.placed.index];
      if (!b) return;
      var key = it2.key || JSON.stringify((Assembly.findComponent(App.model, it2.component) || {}).source);
      if (key === b.key || (b.stack || []).some(function (s) { return s.key === key; })) { UI.setStatus('That item is already in the stack.'); return; }
      (b.stack || (b.stack = [])).push({ key: key, component: it2.component != null ? it2.component : null });
      UI.autosave(); render();
      UI.setStatus('Stacked Balloon: ' + (b.stack.length + 1) + ' items — click more, ✓ ends.');
      return;
    }
    if (!P.item) {
      var e = edgeAt(p), it = e && bodyItem(e.body);
      if (!it) { UI.setStatus('Balloon: click a visible edge of a ' + (isAsm() ? 'component' : 'part') + ' in a view.'); return; }
      P.item = it; P.view = e.view; P.attach = e.at; P.cp = p;
      UI.setStatus('Balloon: click where the balloon goes.');
      return;
    }
    var vw = Drawing.findView(doc(), P.view), spec = Object.assign({ attach: P.attach, pos: [p[0] - vw.x, p[1] - vw.y], qty: !!P.qty, qtyPos: P.qtyPos !== 'right' ? P.qtyPos : null }, P.item);
    if (P.stacked) spec.stackDir = P.stackDir;
    edit(function (dc) { Drawing.addBalloon(dc, App.model, P.view, spec); });
    var idx = Drawing.findView(doc(), P.view).balloons.length - 1, sb = (D.sheet.balloons || []).filter(function (x) { return x.view === P.view && x.index === idx; })[0];
    D.sel = { kind: 'balloon', view: P.view, index: idx, key: sb ? sb.key : null, component: sb ? sb.component : null };
    if (P.stacked) { P.placed = { view: P.view, index: idx }; UI.setStatus('Stacked Balloon placed: click edges of other items to stack them, ✓ ends.'); }
    else { P.item = null; P.placed = null; UI.setStatus('Balloon ' + (sb ? sb.item : '') + ' placed — click another edge for the next one, Esc ends.'); }
    drawOverlay();
  }
  // Balloon PropertyManager (double-click a balloon): quantity, its placement, stack direction
  function cmdBalloonProps(bl) {
    var v0 = Drawing.findView(doc(), bl.view), b0 = v0 && v0.balloons && v0.balloons[bl.index];
    if (!b0) return;
    openDrawingPM({
      title: 'Balloon', icon: 'balloon', command: 'balloonProps',
      message: 'Balloon ' + bl.item + (bl.stack && bl.stack.length ? ' (stacked with ' + bl.stack.map(function (s) { return s.item; }).join(', ') + ')' : '') + ': the number follows the Bill of Materials.',
      values: { qty: !!b0.qty, qtyPos: b0.qtyPos || 'right', stackDir: b0.stackDir || 'right' },
      groups: [
        { title: 'Quantity', fields: [{ type: 'check', key: 'qty', label: 'Show quantity (QTY)' }, { type: 'select', key: 'qtyPos', label: 'Placement', options: [['right', 'Right'], ['left', 'Left'], ['up', 'Top'], ['down', 'Bottom']] }] }
      ].concat(b0.stack && b0.stack.length ? [{ title: 'Stack', fields: [{ type: 'select', key: 'stackDir', label: 'Direction', options: [['right', 'Right'], ['left', 'Left'], ['up', 'Up'], ['down', 'Down']] }] }] : []),
      onOK: function (val) { setBalloonProps(bl.view, bl.index, val); }
    });
  }
  function setBalloonProps(viewId, index, props) {
    edit(function (dc) {
      var v = Drawing.findView(dc, viewId), b = v && v.balloons && v.balloons[index];
      if (!b) return;
      if ('qty' in props) { if (props.qty) b.qty = true; else delete b.qty; }
      if ('qtyPos' in props) { if (props.qtyPos && props.qtyPos !== 'right') b.qtyPos = props.qtyPos; else delete b.qtyPos; }
      if ('stackDir' in props) { if (props.stackDir && props.stackDir !== 'right') b.stackDir = props.stackDir; else delete b.stackDir; }
      if (props.pos) b.pos = [+props.pos[0], +props.pos[1]];
    });
  }
  // Dimension PropertyManager (double-click a dimension): Primary Value (a model item's value drives the part),
  // Tolerance/Precision (None, Bilateral, Limit, Symmetric; decimals), Dimension Text (<DIM> is the value), Leaders (flip)
  var PREC_OPTIONS = [['auto', 'Document default'], ['0', '1'], ['1', '.1'], ['2', '.12'], ['3', '.123'], ['4', '.1234']];
  function cmdDimensionPM(ref) {
    var d = sheetDim(ref);
    if (!d) return;
    var w = sheetView(d.view), src = d.auto && d.kind !== 'ordinate' && d.kind !== 'baseline' ? Drawing.dimSource(App.model, App.build, w, d) : null;
    var tol = d.tol || { type: 'none' }, u = units();
    var values = { value: d.value != null ? +d.value.toFixed(8) : 0, tolType: tol.type || 'none', plus: tol.plus != null ? tol.plus : 0, minus: tol.minus != null ? tol.minus : 0, prec: d.prec != null ? String(d.prec) : 'auto', label: d.label != null ? d.label : '<DIM>', flip: !!d.flip };
    var single = d.kind !== 'ordinate' && d.kind !== 'baseline';
    var primary = src ? [{ type: 'number', key: 'value', label: 'Value', unit: 'u' }, { type: 'static', label: 'Drives', value: src.featureName + ' (' + src.what + ')' + (src.expr ? ' — equation ' + src.expr : '') }]
      : [{ type: 'static', label: 'Value', value: single ? Drawing.numText(d.value, u) + ' ' + u + (d.auto ? ' (no model parameter found)' : ' (reference: driven by the model)') : d.text }];
    openDrawingPM({
      title: 'Dimension', icon: 'dim', command: 'dimension',
      message: src ? 'A model item: a new value changes ' + src.featureName + ' and rebuilds the part.' : d.auto ? 'A model item. Its text, tolerance and arrows can be edited here.' : 'A reference dimension: it follows the model; text, tolerance and arrows can be edited here.',
      values: values,
      groups: [
        { title: 'Primary Value', fields: primary },
        { title: 'Tolerance/Precision', fields: [
          { type: 'select', key: 'tolType', label: 'Tolerance', options: Drawing.TOL_TYPES, rerender: true },
          { type: 'number', key: 'plus', label: 'Maximum variation (+)', unit: 'u', show: function (v) { return v.tolType !== 'none'; } },
          { type: 'number', key: 'minus', label: 'Minimum variation (−)', unit: 'u', show: function (v) { return v.tolType === 'bilateral' || v.tolType === 'limit'; } },
          { type: 'select', key: 'prec', label: 'Unit precision', options: PREC_OPTIONS }
        ] },
        { title: 'Dimension Text', fields: [{ type: 'text', key: 'label', label: 'Text (<DIM> is the value)' }] },
        { title: 'Leaders', fields: [{ type: 'check', key: 'flip', label: 'Flip arrows (outside)' }] }
      ],
      onOK: function (v) { return applyDimensionPM(d, src, v); }
    });
  }
  function dimPropsFromPM(v) {
    var label = String(v.label == null ? '' : v.label);
    return { tol: v.tolType && v.tolType !== 'none' ? { type: v.tolType, plus: Math.abs(+v.plus || 0), minus: v.tolType === 'symmetric' ? Math.abs(+v.plus || 0) : Math.abs(+v.minus || 0) } : null,
      prec: v.prec === 'auto' || v.prec == null ? null : +v.prec, label: label.trim() === '' || label === '<DIM>' ? null : label, flip: !!v.flip };
  }
  function applyDimensionPM(d, src, v) {
    var props = dimPropsFromPM(v), val = +v.value;
    if (src && isFinite(val) && Math.abs(val - d.value) > 1e-9) {
      // drive the part: try it on a copy first, so a refused value leaves no undo step
      try { Drawing.driveDim(JSON.parse(JSON.stringify(App.model)), src, val); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return false; }
      UI.pushUndo();
      var t = dimTarget(doc(), d);
      if (t) Drawing.setDimProps(t, props);
      cleanDimProps(doc());
      Drawing.driveDim(App.model, src, val);
      UI.setStatus('Dimension ' + Drawing.numText(d.value, units()) + ' → ' + Drawing.numText(val, units()) + ': ' + src.featureName + ' ' + src.what + ' changed, rebuilding.');
      return UI.rebuild().then(function () { if (D.active) render(); });
    }
    setDimProps(d, props);
    var nd = sheetDim(dimRef(d));
    UI.setStatus('Dimension ' + (nd ? nd.text : '') + '.');
  }
  // Hole Callout PropertyManager (double-click a callout): the text (<HOLE> is the callout the hole reads) and precision
  function cmdCalloutProps(a) {
    var f = Drawing.findAnnotation(doc(), a.id);
    if (!f) return;
    openDrawingPM({
      title: 'Hole Callout', icon: 'holeCallout', command: 'holeCallout',
      message: 'Reads ' + a.text + '. Text: <HOLE> is the callout from the hole; a new line starts with \\n.',
      values: { text: f.annotation.text || '<HOLE>', prec: f.annotation.prec != null ? String(f.annotation.prec) : 'auto' },
      groups: [{ title: 'Dimension Text', fields: [{ type: 'text', key: 'text', label: 'Text' }, { type: 'select', key: 'prec', label: 'Unit precision', options: PREC_OPTIONS }] }],
      onOK: function (v) {
        edit(function (dc) {
          var g = Drawing.findAnnotation(dc, a.id);
          if (!g) return;
          var t = String(v.text || '').replace(/\\n/g, '\n');
          if (!t.trim() || t === '<HOLE>') delete g.annotation.text; else g.annotation.text = t;
          if (v.prec === 'auto') delete g.annotation.prec; else g.annotation.prec = +v.prec;
        });
      }
    });
  }
  // Tools ▸ Options ▸ Document Properties: Detailing (auto insert on view creation), centre marks, balloons
  function cmdDocProps() {
    var dc = doc(), o = Drawing.docOptions(dc);
    var cm = el('input', { type: 'checkbox' }), cl = el('input', { type: 'checkbox' }), ex = el('input', { type: 'checkbox' }), bq = el('input', { type: 'checkbox' });
    var sz = el('input', { type: 'number', step: '0.5', min: '0.5', value: String(o.markSize) });
    cm.checked = o.autoCenterMarks; cl.checked = o.autoCenterlines; ex.checked = o.extLines; bq.checked = o.balloonQty;
    cm.id = 'dw-opt-cm'; cl.id = 'dw-opt-cl'; ex.id = 'dw-opt-ext'; bq.id = 'dw-opt-qty'; sz.id = 'dw-opt-size';
    function chk(inp, text) { return el('label', { class: 'dw-opt' }, [inp, el('span', { text: text })]); }
    var body = el('div', { class: 'dw-props dw-docprops' }, [
      el('div', { class: 'dw-tb-head', text: 'Detailing ▸ Auto insert on view creation' }),
      chk(cm, 'Center marks-holes'), chk(cl, 'Centerlines'),
      el('div', { class: 'dw-tb-head', text: 'Centerlines/Center Marks' }),
      chk(ex, 'Extended lines'), el('label', { text: 'Mark size (mm)' }), sz,
      el('div', { class: 'dw-tb-head', text: 'Balloons' }),
      chk(bq, 'Show quantity (QTY) on new balloons')
    ]);
    UI.showModal({ title: 'Document Properties - Detailing', body: body, buttons: [
      { label: 'OK', primary: true, id: 'dw-opt-ok', action: function () { UI.closeModal(); setDocOptions({ autoCenterMarks: cm.checked, autoCenterlines: cl.checked, extLines: ex.checked, markSize: +sz.value, balloonQty: bq.checked }); } },
      { label: 'Cancel', action: UI.closeModal }
    ] });
  }
  function setDocOptions(props) {
    edit(function (dc) {
      var o = dc.options || (dc.options = {});
      Object.keys(props).forEach(function (k) { if (props[k] != null && !(k === 'markSize' && !(+props[k] > 0))) o[k] = props[k]; });
    });
    return Drawing.docOptions(doc());
  }
  // the Document Properties of a drawing made in the app (SolidWorks' drawing template: centre marks on holes and
  // centrelines are inserted with every new view)
  function defaultDocOptions() { return { autoCenterMarks: true, autoCenterlines: true }; }
  // Auto insert for views made by the tools (Standard 3 View inserts inside the engine)
  function autoInsertViews(dc, ids) { Drawing.autoInsert(dc, mesh(), ids); }
  // dragging: a dimension's line / text, a callout's leader, a balloon
  function startDimDrag(dm, p) { D.drag = { kind: 'dim', ref: dimRef(dm), d: dm, start: p, moved: false }; }
  // ---- r4/drawings4: SolidWorks-like dimension handling
  // the arrow tip of the selected dimension under the cursor (5 px): that dimension, whose arrows can flip
  var FLIP_KINDS = { h: 1, v: 1, aligned: 1, dia: 1 };
  function arrowAt(p) {
    if (!D.sel || D.sel.kind !== 'dim') return null;
    var d = sheetDim(D.sel), t = pxToPaper(5);
    if (!d || !FLIP_KINDS[d.kind] || !d.arrows) return null;
    return d.arrows.some(function (a) { return Math.hypot(a[0] - p[0], a[1] - p[1]) <= t; }) ? d : null;
  }
  function flipArrows(d) {
    setDimProps(d, { flip: !d.flip });
    var nd = sheetDim(dimRef(d));
    UI.setStatus('Dimension ' + (nd ? nd.text : d.text) + ': arrows ' + (d.flip ? 'inside' : 'flipped outside') + ' (click an arrowhead again to flip them back).');
  }
  // In-place editing (double-click a dimension, as SolidWorks' Modify box): a box over the dimension text. A model
  // item that drives the part edits its value (Enter rebuilds the part); any other dimension edits its text, <DIM>
  // standing for the value. Esc or a click elsewhere cancels; the box follows the sheet's pan and zoom.
  function openInlineEdit(d) {
    closeInlineEdit(false);
    if (!d || !d.tbox || d.kind === 'ordinate' || d.kind === 'baseline') return;
    var w = sheetView(d.view), src = d.auto ? Drawing.dimSource(App.model, App.build, w, d) : null;
    var inp = el('input', { type: 'text', spellcheck: 'false', 'aria-label': src ? 'Dimension value' : 'Dimension text (<DIM> is the value)' });
    var ok = el('button', { class: 'dw-edit-btn ok', title: 'OK (Enter)', text: '✓' }), no = el('button', { class: 'dw-edit-btn', title: 'Cancel (Esc)', text: '✗' });
    var box = el('div', { id: 'dw-edit', class: src ? 'drives' : 'text' }, [inp, ok, no]);
    inp.value = src ? String(+(+d.value).toFixed(6)) : d.label != null ? String(d.label) : '<DIM>';
    D.root.appendChild(box);
    D.inline = { box: box, inp: inp, ref: dimRef(d), src: src };
    positionInlineEdit();
    inp.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); closeInlineEdit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closeInlineEdit(false); }
    });
    inp.addEventListener('blur', function () { setTimeout(function () { if (D.inline && D.inline.inp === inp && !box.contains(document.activeElement)) closeInlineEdit(false); }, 0); });
    [ok, no].forEach(function (b) { b.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); }); });
    ok.addEventListener('click', function () { closeInlineEdit(true); });
    no.addEventListener('click', function () { closeInlineEdit(false); });
    box.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    try { inp.focus({ preventScroll: true }); inp.select(); } catch (err) { }
    UI.setStatus(src ? 'Modify: a new value changes ' + src.featureName + ' (' + src.what + ') and rebuilds the part; Enter applies, Esc cancels.' : 'Dimension text: <DIM> is the value; Enter applies, Esc cancels.');
  }
  // the box over the dimension's text, in client pixels (the sheet may have been panned or zoomed since)
  function positionInlineEdit() {
    var I = D.inline, s = svgEl(), m = s && s.getScreenCTM();
    if (!I || !m || !D.sheet) return;
    var d = I.field ? null : sheetDim(I.ref), tb = I.field ? I.field.rect : d && d.tbox;
    if (!tb) { closeInlineEdit(false); return; }
    var H = D.sheet.size[1], pt = s.createSVGPoint(), r = D.root.getBoundingClientRect();
    pt.x = (tb.x0 + tb.x1) / 2; pt.y = H - (tb.y0 + tb.y1) / 2;
    var q = pt.matrixTransform(m);
    I.box.style.left = (q.x - r.left) + 'px'; I.box.style.top = (q.y - r.top) + 'px';
  }
  // Double-click a title block field: its text is edited in place (SolidWorks title block fields). The box shows the
  // field's own text when it has one, else what its property link gives; an empty box puts the link back
  // (r5/drawings5)
  function openTitleEdit(tf) {
    closeInlineEdit(false);
    var dc = doc(), own = dc.titleBlock && dc.titleBlock[tf.field.key];
    var shown = own != null ? String(own) : Drawing.titleBlock(dc, App.model, { build: App.build || null, mesh: mesh() })[tf.field.key] || '';
    var inp = el('input', { type: 'text', spellcheck: 'false', 'aria-label': tf.field.label });
    var ok = el('button', { class: 'dw-edit-btn ok', title: 'OK (Enter)', text: '✓' }), no = el('button', { class: 'dw-edit-btn', title: 'Cancel (Esc)', text: '✗' });
    var box = el('div', { id: 'dw-edit', class: 'text tb' }, [inp, ok, no]);
    inp.value = shown;
    D.root.appendChild(box);
    D.inline = { box: box, inp: inp, field: { key: tf.field.key, rect: tf.rect, shown: shown } };
    positionInlineEdit();
    inp.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); closeInlineEdit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closeInlineEdit(false); }
    });
    inp.addEventListener('blur', function () { setTimeout(function () { if (D.inline && D.inline.inp === inp && !box.contains(document.activeElement)) closeInlineEdit(false); }, 0); });
    [ok, no].forEach(function (b) { b.addEventListener('mousedown', function (ev) { ev.preventDefault(); ev.stopPropagation(); }); });
    ok.addEventListener('click', function () { closeInlineEdit(true); });
    no.addEventListener('click', function () { closeInlineEdit(false); });
    box.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
    try { inp.focus({ preventScroll: true }); inp.select(); } catch (err) { }
    UI.setStatus(tf.field.label + ': type the text ($PRP:"…" / $PRPSHEET:"…" link properties; empty restores the default); Enter applies, Esc cancels.');
  }
  function closeInlineEdit(commit) {
    var I = D.inline;
    if (!I) return;
    D.inline = null;
    if (I.box.parentNode) I.box.parentNode.removeChild(I.box);
    if (!commit) return;
    if (I.field) {
      var tv = I.inp.value.trim(), fm = {};
      if (tv === I.field.shown.trim()) return;
      fm[I.field.key] = tv === '' ? null : tv;
      setTitleBlock(fm);
      UI.setStatus('Title block ' + I.field.key + ': ' + (tv === '' ? 'default' : tv) + '.');
      return;
    }
    var d = sheetDim(I.ref), txt = I.inp.value.trim();
    if (!d) return;
    if (I.src) {
      var v = UI.evalInput ? UI.evalInput(txt) : parseFloat(txt);
      if (v && typeof v === 'object') v = v.value;
      v = +v;
      if (!isFinite(v)) { UI.toast('Not a number: ' + txt); return; }
      if (Math.abs(v - d.value) < 1e-9) return;
      if (UI.hasPM && UI.hasPM()) UI.pmCancel();
      var tol = d.tol || { type: 'none' };
      applyDimensionPM(d, I.src, { value: v, tolType: tol.type || 'none', plus: tol.plus || 0, minus: tol.minus || 0, prec: d.prec != null ? String(d.prec) : 'auto', label: d.label != null ? d.label : '<DIM>', flip: !!d.flip });
      return;
    }
    var label = txt === '' || txt === '<DIM>' ? null : txt;
    if ((d.label == null ? null : String(d.label)) === label) return;
    if (UI.hasPM && UI.hasPM()) UI.pmCancel();
    setDimProps(d, { label: label });
    var nd = sheetDim(I.ref);
    UI.setStatus('Dimension text: ' + (nd ? nd.text : '') + '.');
  }
  // Dragging a dimension snaps it in line with the others (SolidWorks' alignment inference): a linear dimension's line
  // onto another's of the same direction, a radius / diameter shelf onto the height of another's, within 6 px; a dotted
  // guide shows the line it lines up with. -> the snapped props (D.snapGuide set, or null)
  function snapDim(d, w, props) {
    D.snapGuide = null;
    var tol = pxToPaper(6), best = null, bd = tol, me = dimRef(d);
    if ((d.kind === 'h' || d.kind === 'v') && props.at != null) {
      var ax = d.kind === 'h' ? 1 : 0, cur = w.toSheet(ax ? [0, props.at] : [props.at, 0])[ax];
      D.sheet.dims.forEach(function (o) {
        if (o.kind !== d.kind || o.lineAt == null || dimMatches(me, o) || !o.box) return;
        var ow = sheetView(o.view), oc = ow && ow.toSheet(ax ? [0, o.lineAt] : [o.lineAt, 0])[ax];
        if (oc != null && Math.abs(oc - cur) < bd) { bd = Math.abs(oc - cur); best = { o: o, at: oc }; }
      });
      if (!best) return props;
      props.at = w.fromSheet(ax ? [0, best.at] : [best.at, 0])[ax];
      var bx = d.box, ob = best.o.box, lo = Math.min(ax ? bx.x0 : bx.y0, ax ? ob.x0 : ob.y0), hi = Math.max(ax ? bx.x1 : bx.y1, ax ? ob.x1 : ob.y1);
      D.snapGuide = ax ? { a: [lo, best.at], b: [hi, best.at] } : { a: [best.at, lo], b: [best.at, hi] };
    } else if ((d.kind === 'dia' || d.kind === 'rad') && props.lead) {
      var c = w.toSheet(d.c), y = c[1] + props.lead[1];
      D.sheet.dims.forEach(function (o) {
        if ((o.kind !== 'dia' && o.kind !== 'rad') || !o.leadNow || dimMatches(me, o)) return;
        var ow = sheetView(o.view), oy = ow && ow.toSheet(o.c)[1] + o.leadNow[1];
        if (oy != null && Math.abs(oy - y) < bd) { bd = Math.abs(oy - y); best = { o: o, y: oy, x: ow.toSheet(o.c)[0] + o.leadNow[0] }; }
      });
      if (!best) return props;
      props.lead = [props.lead[0], best.y - c[1]];
      D.snapGuide = { a: [Math.min(c[0] + props.lead[0], best.x), best.y], b: [Math.max(c[0] + props.lead[0], best.x), best.y] };
    }
    return props;
  }
  function dragDim(p) {
    var dg = D.drag, d = dg.d, w = sheetView(d.view), dx = p[0] - dg.start[0], dy = p[1] - dg.start[1], props = {};
    if (!w) return;
    if (d.kind === 'h') { props.at = d.lineAt + dy / w.scale; props.tx = (d.tx || 0) + dx; }
    else if (d.kind === 'v') { props.at = d.lineAt + dx / w.scale; props.tx = (d.tx || 0) + dy; }
    else if (d.kind === 'aligned') {
      var a = w.toSheet(d.a), b = w.toSheet(d.b), t = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(t[0], t[1]) || 1; t = [t[0] / L, t[1] / L];
      var n0 = [-t[1], t[0]], ang = Math.atan2(t[1], t[0]) * 180 / Math.PI, tt = t;
      if (ang > 90 || ang <= -90) tt = [-t[0], -t[1]];
      props.off = (d.offNow || 0) + dx * n0[0] + dy * n0[1]; props.tx = (d.tx || 0) + dx * tt[0] + dy * tt[1];
    } else if (d.kind === 'dia' || d.kind === 'rad' || d.kind === 'chamfer') props.lead = [d.leadNow[0] + dx, d.leadNow[1] + dy];
    else if (d.kind === 'ordinate' || d.kind === 'baseline') props.at = d.lineAt + (d.dir === 'v' ? dx : dy) / w.scale;
    if (Math.abs(props.tx || 0) < pxToPaper(4)) { if ('tx' in props) props.tx = null; }
    var hadGuide = !!D.snapGuide;
    if (!dg.noSnap) snapDim(d, w, props); else D.snapGuide = null;
    if (hadGuide || D.snapGuide) drawOverlay();
    var t2 = dimTarget(doc(), d);
    if (t2) Drawing.setDimProps(t2, props);
    queueRender(true);
  }
  // a balloon from the sheet list: its entry in the view's balloons (by position in the list)
  function balloonRef(b) { return { kind: 'balloon', view: b.view, index: b.index, key: b.key, component: b.component }; }

  // ------------------------------------------------------------------ drawing FeatureManager
  function row(opts) {
    var r = el('div', { class: 'ti' + (opts.sel ? ' selected' : '') + (opts.cls ? ' ' + opts.cls : '') });
    r.style.paddingLeft = (6 + (opts.depth || 0) * 14) + 'px';
    r.appendChild(el('span', { class: 'tw' + (opts.twisty ? '' : ' leaf'), text: '\u25be' }));
    r.appendChild(el('span', { html: Icons(opts.icon, 16) }));
    r.appendChild(el('span', { class: 'nm', text: opts.name, title: opts.title || opts.name }));
    if (opts.badge) r.appendChild(el('span', { class: 'badge', text: opts.badge }));
    Object.keys(opts.data || {}).forEach(function (k) { r.dataset[k] = opts.data[k]; });
    if (opts.click) r.addEventListener('click', opts.click);
    if (opts.dbl) r.addEventListener('dblclick', opts.dbl);
    if (opts.menu) r.addEventListener('contextmenu', function (e) { e.preventDefault(); UI.showMenu(e.clientX, e.clientY, opts.menu()); });
    return r;
  }
  function renderTree() {
    var t = D.tree, dc = doc();
    if (!t || !dc) return;
    t.innerHTML = '';
    t.appendChild(row({ icon: 'drawing', name: dc.name, cls: 'dw-root', twisty: true, title: 'Drawing of ' + App.model.name }));
    t.appendChild(row({ icon: 'annotations', name: 'Annotations', depth: 1, badge: dc.autoDims ? 'model items' : '' }));
    t.appendChild(row({ icon: 'sheet', name: dc.sheet.name, depth: 1, twisty: true, cls: 'dw-sheet', data: { sheet: '1' }, sel: D.sel && D.sel.kind === 'sheet', badge: dc.sheet.format + '  ' + Drawing.scaleText(dc.sheet.scale), title: 'Double-click for Sheet Properties', click: function () { D.sel = { kind: 'sheet' }; drawOverlay(); renderTree(); }, dbl: cmdSheetProperties, menu: sheetMenu }));
    t.appendChild(row({ icon: 'sheetFormat', name: 'Sheet Format1', depth: 2, title: 'Border and title block' }));
    if (dc.bom && dc.bom.show !== false) {
      var nr = D.sheet && D.sheet.bom ? D.sheet.bom.rows.length : 0;
      t.appendChild(row({ icon: 'bom', name: 'Bill of Materials1', depth: 2, cls: 'dw-bom', sel: D.sel && D.sel.kind === 'bom', badge: nr + (nr === 1 ? ' item' : ' items'),
        title: 'Bill of Materials of ' + App.model.name + ' (' + (dc.bom.x != null ? 'moved' : 'anchored ' + (dc.bom.anchor || 'top-right')) + '). Double-click for properties.',
        click: function () { D.sel = { kind: 'bom' }; drawOverlay(); renderTree(); }, dbl: cmdBOM, menu: bomMenu }));
    }
    dc.views.forEach(function (v) {
      var sel = D.sel && D.sel.kind === 'view' && D.sel.id === v.id;
      var w = D.sheet && D.sheet.views.filter(function (x) { return x.view.id === v.id; })[0];
      var st = w ? w.proj.stats : null;
      var badge = v.kind === 'section' ? v.label + '-' + v.label : v.kind === 'detail' ? v.label + ' ' + Drawing.scaleText(v.scale || dc.sheet.scale) : v.orient;
      t.appendChild(row({ icon: v.kind === 'section' ? 'sectionView' : v.kind === 'detail' ? 'detailView' : v.kind === 'projected' ? 'projView' : 'drawingView', name: v.name, depth: 2, twisty: true, cls: 'dw-view' + (v.kind ? ' dw-' + v.kind : ''), data: { view: String(v.id) }, sel: sel, badge: badge,
        title: v.name + ' \u2014 ' + v.orient + (v.scale ? ', scale ' + Drawing.scaleText(v.scale) : '') + (st ? ' \u2014 ' + st.visibleLines + ' visible / ' + st.hiddenLines + ' hidden lines, ' + st.visibleCircles + ' circles' : '') + '. Double-click for properties.',
        click: function () { D.sel = { kind: 'view', id: v.id }; drawOverlay(); renderTree(); },
        dbl: function () { cmdViewProperties(v.id); }, menu: function () { return viewMenu(v); } }));
      t.appendChild(row({ icon: isAsm() ? 'assembly' : 'part', name: App.model.name, depth: 3, cls: 'dw-ref' }));
      var an = w && D.sheet.annotations ? D.sheet.annotations.filter(function (a) { return a.view === v.id; }) : [];
      [['centerMark', 'Center Marks'], ['centerline', 'Centerlines'], ['holeCallout', 'Hole Callouts']].forEach(function (tp) {
        var list = an.filter(function (a) { return a.type === tp[0]; }), dang = list.filter(function (a) { return a.dangling; }).length;
        if (!list.length) return;
        t.appendChild(row({ icon: tp[0], name: tp[1], depth: 3, cls: 'dw-annots dw-' + tp[0], badge: String(list.length), data: { annots: tp[0] }, title: list.map(function (a) { return a.text; }).join(', ') + (dang ? ' (' + dang + ' dangling)' : ''),
          click: function () { D.sel = { kind: 'annot', id: list[0].id, view: v.id }; drawOverlay(); renderTree(); },
          menu: function () { return [{ label: 'Delete ' + tp[1], action: function () { edit(function (dc2) { var vv = Drawing.findView(dc2, v.id); if (vv) vv.annotations = (vv.annotations || []).filter(function (a) { return a.type !== tp[0]; }); }); } }]; } }));
      });
      var nb = w && D.sheet.balloons ? D.sheet.balloons.filter(function (b) { return b.view === v.id; }).length : 0;
      if (nb) t.appendChild(row({ icon: 'autoBalloon', name: 'Balloons', depth: 3, cls: 'dw-balloons', badge: String(nb), title: nb + ' balloons linked to the Bill of Materials item numbers',
        menu: function () { return [{ label: 'Delete Balloons', action: function () { edit(function (dc2) { Drawing.deleteBalloons(dc2, v.id); }); } }]; } }));
    });
  }

  // ------------------------------------------------------------------ ribbon, menus, keys
  UI.RIBBON.Drawing = [
    { id: 'std3view', label: 'Standard\n3 View', run: cmdStandard3View },
    { id: 'modelView', label: 'Model\nView', run: cmdModelView, active: function () { return D.tool === 'place'; } },
    { id: 'projView', label: 'Projected\nView', run: cmdProjectedView, active: function () { return D.tool === 'project'; } },
    { id: 'sectionView', label: 'Section\nView', run: cmdSectionView, active: function () { return D.tool === 'section'; } },
    { id: 'detailView', label: 'Detail\nView', run: cmdDetailView, active: function () { return D.tool === 'detail'; } },
    { sep: true },
    { id: 'dim', label: 'Smart\nDimension', run: cmdSmartDimension, active: function () { return D.tool === 'dim'; } },
    { id: 'modelItems', label: 'Model\nItems', run: cmdModelItems, active: function () { return !!(doc() && doc().autoDims); } },
    { id: 'autoBalloon', label: 'Auto\nBalloon', run: function () { cmdAutoBalloon(); } },
    { id: 'bom', label: 'Bill of\nMaterials', run: function () { cmdBOM(); }, active: function () { return !!(doc() && doc().bom && doc().bom.show !== false); } },
    { sep: true },
    { id: 'sheetProps', label: 'Sheet\nProperties', run: cmdSheetProperties },
    { sep: true },
    { id: 'svgExport', label: 'Save as\nSVG', run: function () { exportAs('svg'); } },
    { id: 'dxfExport', label: 'Save as\nDXF', run: function () { exportAs('dxf'); } },
    { id: 'pdfExport', label: 'Save as\nPDF', run: function () { exportAs('pdf'); } },
    { sep: true },
    { id: 'closeDoc', label: 'Close\nDrawing', run: function () { closeDrawing(); } }
  ];
  // Annotation tab (SolidWorks: Smart Dimension with its Ordinate / Baseline / Chamfer flyout, Model Items, Balloon,
  // Auto Balloon, Stacked Balloon, Hole Callout, Center Mark, Centerline)
  UI.RIBBON.Annotation = [
    { id: 'dim', label: 'Smart\nDimension', run: cmdSmartDimension, active: function () { return D.tool === 'dim'; } },
    { stack: [
      { id: 'ordinateDim', label: 'Ordinate Dimension', run: function () { cmdChainDim('ordinate'); }, active: function () { return D.tool === 'ordinate'; } },
      { id: 'baselineDim', label: 'Baseline Dimension', run: function () { cmdChainDim('baseline'); }, active: function () { return D.tool === 'baseline'; } },
      { id: 'chamferDim', label: 'Chamfer Dimension', run: cmdChamferDim, active: function () { return D.tool === 'chamferdim'; } }
    ] },
    { id: 'modelItems', label: 'Model\nItems', run: cmdModelItems, active: function () { return !!(doc() && doc().autoDims); } },
    { sep: true },
    { id: 'balloon', label: 'Balloon', run: function () { cmdBalloon(false); }, active: function () { return D.tool === 'balloon'; } },
    { id: 'autoBalloon', label: 'Auto\nBalloon', run: function () { cmdAutoBalloon(); } },
    { id: 'stackBalloon', label: 'Stacked\nBalloon', run: function () { cmdBalloon(true); }, active: function () { return D.tool === 'stackballoon'; } },
    { id: 'holeCallout', label: 'Hole\nCallout', run: cmdHoleCallout, active: function () { return D.tool === 'holecallout'; } },
    { sep: true },
    { id: 'centerMark', label: 'Center\nMark', run: cmdCenterMark, active: function () { return D.tool === 'centermark'; } },
    { id: 'centerline', label: 'Centerline', run: cmdCenterline, active: function () { return D.tool === 'centerline'; } },
    { sep: true },
    { id: 'docProps', label: 'Document\nProperties', run: cmdDocProps }
  ];
  if (UI.ASM_RIBBON) { UI.ASM_RIBBON.Drawing = UI.RIBBON.Drawing; UI.ASM_RIBBON.Annotation = UI.RIBBON.Annotation; }
  // the Drawing and Annotation tabs exist only in a drawing document; part tabs are hidden while one is open
  UI.ribbonTabsFor = function (names, extra) {
    if (D.active) return [['Drawing', 'Annotation'], ['Sketch', 'Markup', 'Sheet Format']];
    return [names.filter(function (n) { return n !== 'Drawing' && n !== 'Annotation'; }), extra];
  };
  UI.menuHook = function (menus) {
    var file = menus.filter(function (m) { return m.label === 'File'; })[0];
    if (!D.active) {
      var asm = isAsm();
      if (file) {
        // after the New / Open / Save group (the first separator); matched by position, not by label text
        var at = 0;
        while (at < file.items.length && !file.items[at].sep) at++;
        file.items.splice(at, 0, { sep: true }, { label: asm ? 'Make Drawing from Assembly' : 'Make Drawing from Part', action: function () { makeDrawing(); } });
      }
      // Window: the open document (part or assembly), then the part's drawings
      var win = menus.filter(function (m) { return m.label === 'Window'; })[0];
      if (win) {
        win.items.push({ sep: true });
        win.items.push({ label: (App.model.name || (asm ? 'Assem1' : 'Part1')) + (asm ? ' (assembly)' : ' (part)'), checked: true, action: function () { } });
        (App.model.drawings || []).forEach(function (dc, i) { win.items.push({ label: dc.name + ' - ' + dc.sheet.name, action: function () { makeDrawing({ index: i }); } }); });
      }
      return menus;
    }
    // a drawing document: SolidWorks-style drawing menus
    // the part File menu's New / Open / Save group: everything before its first separator
    var docItems = [];
    (file && file.items || []).some(function (it) { if (it.sep) return true; docItems.push(it); return false; });
    var editMenu = menus.filter(function (m) { return m.label === 'Edit'; })[0], help = menus.filter(function (m) { return m.label === 'Help'; })[0];
    var dc = doc();
    return [
      { label: 'File', items: docItems.concat([
        { sep: true },
        { label: 'Save Drawing as SVG\u2026', action: function () { exportAs('svg'); } },
        { label: 'Save Drawing as DXF\u2026', action: function () { exportAs('dxf'); } },
        { label: 'Save Drawing as PDF\u2026', action: function () { exportAs('pdf'); } },
        { sep: true },
        { label: 'Close Drawing', action: closeDrawing }
      ]) },
      { label: 'Edit', items: (editMenu ? editMenu.items.slice(0, 2) : []).concat([{ label: 'Delete', key: 'Del', disabled: !D.sel || D.sel.kind === 'sheet', action: deleteSelection }]) },
      { label: 'View', items: [{ label: 'Zoom to Fit', key: 'F', action: fitSheet }] },
      { label: 'Insert', items: [
        { label: 'Drawing View \u25b8 Standard 3 View', action: cmdStandard3View },
        { label: 'Drawing View \u25b8 Model\u2026', action: cmdModelView },
        { label: 'Drawing View \u25b8 Projected', action: cmdProjectedView },
        { label: 'Drawing View \u25b8 Section\u2026', action: cmdSectionView },
        { label: 'Drawing View \u25b8 Detail', action: cmdDetailView },
        { label: 'Annotations \u25b8 Smart Dimension', key: 'D', action: cmdSmartDimension },
        { label: 'Annotations \u25b8 Model Items', checked: !!(dc && dc.autoDims), action: cmdModelItems },
        { label: 'Annotations \u25b8 Auto Balloon', disabled: !isAsm(), action: cmdAutoBalloon },
        { label: 'Annotations \u25b8 Balloon', action: function () { cmdBalloon(false); } },
        { label: 'Annotations \u25b8 Stacked Balloon', action: function () { cmdBalloon(true); } },
        { label: 'Annotations \u25b8 Hole Callout', action: cmdHoleCallout },
        { label: 'Annotations \u25b8 Center Mark', action: cmdCenterMark },
        { label: 'Annotations \u25b8 Centerline', action: cmdCenterline },
        { label: 'Dimensions \u25b8 Ordinate', action: function () { cmdChainDim('ordinate'); } },
        { label: 'Dimensions \u25b8 Baseline', action: function () { cmdChainDim('baseline'); } },
        { label: 'Dimensions \u25b8 Chamfer', action: cmdChamferDim },
        { label: 'Tables \u25b8 Bill of Materials\u2026', action: cmdBOM }
      ] },
      { label: 'Tools', items: [{ label: 'Sheet Properties\u2026', action: cmdSheetProperties }, { label: 'Options \u25b8 Document Properties\u2026', action: cmdDocProps }] },
      { label: 'Window', items: [
        { label: App.model.name + ' (' + docKind() + ')', action: closeDrawing },
        { label: (dc ? dc.name + ' - ' + dc.sheet.name : 'Drawing'), checked: true, action: function () { } }
      ] },
      help || { label: 'Help', items: [] }
    ];
  };
  // keys in a drawing: Esc ends a tool, Delete removes the selection, F fits the sheet, D toggles Smart Dimension;
  // other part shortcuts are swallowed (Ctrl+Z / Y / S / O / N still reach the app).
  window.addEventListener('keydown', function (e) {
    if (!D.active) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || !$('modal').hidden) return;
    var k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && /^[zZyYsSoOnN]$/.test(k)) return;
    if (k === 'Enter' && UI.hasPM && UI.hasPM()) return;
    if (k === 'Escape') {
      if (UI.hasPM && UI.hasPM()) return;
      e.stopImmediatePropagation(); e.preventDefault();
      UI.closeMenus();
      if (D.tool) { D.tool = null; D.pending = null; D.hover = null; UI.refreshRibbon(); UI.setStatus('Ready'); } else D.sel = null;
      drawOverlay(); renderTree();
      return;
    }
    e.stopImmediatePropagation();
    if (ctrl) return;
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    if (k === 'f' || k === 'F') { if (D.sheet) glideTo(fitBox(), e.isTrusted); else fitSheet(); drawOverlay(); return; }
    if (k === 'd' || k === 'D') { cmdSmartDimension(); return; }
  }, true);
  // follow the part: every applied rebuild (and undo / redo / load) re-renders the open drawing
  var baseRefreshTree = UI.refreshTree;
  UI.refreshTree = function () {
    var r = baseRefreshTree.apply(this, arguments);
    if (D.active) queueRender();
    return r;
  };

  // ------------------------------------------------------------------ automation: anvil.drawing
  function summary() {
    var dc = doc();
    if (!dc) return null;
    if (D.active && D.renderQueued) render();   // a script reads the sheet as it is now, not a held / queued one
    if (!D.sheet || !D.active) { syncBom(dc); if (dc.layout === 'auto') Drawing.layout(dc, mesh(), units()); D.sheet = Drawing.compute(dc, mesh(), App.model, cctx()); }
    return {
      name: dc.name, open: D.active, sheet: { name: dc.sheet.name, format: dc.sheet.format, size: D.sheet.size, scale: Drawing.scaleText(dc.sheet.scale), autoScale: !!dc.sheet.autoScale, projection: dc.sheet.projection },
      views: D.sheet.views.map(function (w) {
        var b = w.proj.bounds;
        return { id: w.view.id, name: w.view.name, orient: w.view.orient, role: w.view.role, kind: w.view.kind || 'model', label: w.view.label || null, parent: w.view.parent,
          display: w.view.display, tangent: w.view.tangent || 'removed', x: +w.view.x.toFixed(3), y: +w.view.y.toFixed(3), scale: w.view.scale ? Drawing.scaleText(w.view.scale) : null,
          extents: [+(b.umax - b.umin).toFixed(4), +(b.vmax - b.vmin).toFixed(4)], box: [w.box.x0, w.box.y0, w.box.x1, w.box.y1].map(function (x) { return +x.toFixed(3); }), stats: w.proj.stats, dims: (w.view.dims || []).length,
          hatch: w.hatch, sectionArea: w.section ? +w.section.area.toFixed(6) : null,
          hatches: (w.hatches || []).map(function (h) { return { body: h.body, component: isAsm() && App.model.components[h.body] ? App.model.components[h.body].name : null, angle: h.angle, lines: h.lines, pattern: h.pattern }; }),
          balloons: (D.sheet.balloons || []).filter(function (b) { return b.view === w.view.id; }).map(function (b) { return b.item; }) };
      }),
      bom: D.sheet.bom ? { anchor: dc.bom.x != null ? 'moved' : dc.bom.anchor, box: ['x0', 'y0', 'x1', 'y1'].map(function (q) { return +D.sheet.bom.box[q].toFixed(3); }),
        type: D.sheet.bom.type, columns: D.sheet.bom.columns.map(function (c) { return c.title; }), cells: D.sheet.bom.cells.map(function (r) { return r.map(function (x) { return String(x); }); }),
        rows: D.sheet.bom.rows.map(function (r, i) { var o = { item: r.item, partNumber: r.partNumber, description: r.description, qty: r.qty, components: r.components.map(function (id) { var c = Assembly.findComponent(App.model, id); return c ? c.name : id; }) }; D.sheet.bom.columns.forEach(function (c, j) { if (c.type === 'property') o[c.prop] = String(D.sheet.bom.cells[i][j]); }); return o; }) } : null,
      titleBlock: Drawing.titleBlock(dc, App.model, cctx()),
      balloons: (D.sheet.balloons || []).map(function (b) { return { view: b.view, index: b.index, item: b.item, component: isAsm() ? (Assembly.findComponent(App.model, b.component) || {}).name || null : null, c: [+b.c[0].toFixed(3), +b.c[1].toFixed(3)], attach: [+b.attach[0].toFixed(3), +b.attach[1].toFixed(3)], stack: (b.stack || []).map(function (x) { return x.item; }), qty: b.qty ? b.qtyText : null, manual: !!b.manual }; }),
      dims: D.sheet.dims.map(function (d) { return d.text; }), dangling: D.sheet.dims.filter(function (d) { return d.dangling; }).length, autoDims: !!dc.autoDims,
      dimDetails: D.sheet.dims.map(function (d) { return { view: d.view, kind: d.kind, text: d.text, value: d.value != null ? +(+d.value).toFixed(6) : null, values: d.values ? d.values.map(function (x) { return +x.toFixed(6); }) : undefined, auto: !!d.auto, style: d.style || null, index: d.index != null ? d.index : null, tol: d.tol || null, prec: d.prec != null ? d.prec : null, flip: !!d.flip, dangling: !!d.dangling, box: d.box ? [d.box.x0, d.box.y0, d.box.x1, d.box.y1].map(function (x) { return +x.toFixed(3); }) : null }; }),
      annotations: (D.sheet.annotations || []).map(function (a) { return { id: a.id, view: a.view, type: a.type, style: a.style, text: a.text, auto: a.auto, dangling: a.dangling, box: [a.box.x0, a.box.y0, a.box.x1, a.box.y1].map(function (x) { return +x.toFixed(3); }), centers: a.info && a.info.centers ? a.info.centers.map(function (c) { return [+c[0].toFixed(3), +c[1].toFixed(3)]; }) : undefined }; }),
      options: Drawing.docOptions(dc)
    };
  }
  // runs an engine call on a scratch copy first, so a refused view (missing parent, detail of a detail…) leaves no undo step
  function viewApi(fn) {
    if (!doc()) return null;
    try { fn(JSON.parse(JSON.stringify(doc()))); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
    var v, off = false;
    edit(function (dc) { v = fn(dc); if (v.offSheet) { off = true; delete v.offSheet; } autoInsertViews(dc, [v.id]); });
    if (off) { var msg = v.name + ': no room on the sheet, placed beside it. Move it, or use a larger sheet or a smaller scale.'; UI.toast(msg); UI.setStatus(msg); }
    D.sel = { kind: 'view', id: v.id };
    return summary();
  }
  function annotApi(fn) {
    if (!doc()) return null;
    try { fn(JSON.parse(JSON.stringify(doc()))); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
    edit(function (dc) { fn(dc); });
    return summary();
  }
  function current() { if (!doc()) return null; if (D.active && D.renderQueued) render(); if (!D.active) { syncBom(); if (doc().layout === 'auto') Drawing.layout(doc(), mesh(), units()); D.sheet = Drawing.compute(doc(), mesh(), App.model, cctx()); } return D.sheet; }
  if (window.anvil) {
    window.anvil.drawing = {
      make: function (opts) { return makeDrawing(opts) ? summary() : null; },
      open: function (i) { return makeDrawing({ index: i || 0 }) ? summary() : null; },
      close: function () { closeDrawing(); },
      isOpen: function () { return D.active; },
      summary: summary,
      standard3View: function () { cmdStandard3View(); return summary(); },
      // Projected / Section / Detail View without the mouse; each is one undo step and returns the summary
      projectedView: function (parentId, dir, opts) { return viewApi(function (dc) { return Drawing.addProjectedView(dc, mesh(), parentId, dir, Object.assign({ fit: true }, opts || {})); }); },
      sectionView: function (parentId, opts) { return viewApi(function (dc) { return Drawing.addSectionView(dc, mesh(), parentId, Object.assign({ fit: true }, opts || {})); }); },
      detailView: function (parentId, opts) { return viewApi(function (dc) { return Drawing.addDetailView(dc, mesh(), parentId, Object.assign({ c: [0, 0], fit: true }, opts || {})); }); },
      deleteView: function (id) { deleteView(id); return summary(); },
      tangent: function (id, mode) { setViewTangent(id, mode); return summary(); },
      // assembly drawings: Auto Balloon on a view (default: the selected view, else the isometric), the Bill of
      // Materials (anchor 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left', or { x, y } for its top-left corner),
      // bom(null) removes it
      autoBalloon: function (viewId, opts) { if (!doc() || !isAsm()) return null; var v = viewId != null ? Drawing.findView(doc(), viewId) : defaultBalloonView(); if (!v) return null; autoBalloonView(v.id, opts); return summary(); },
      deleteBalloons: function (viewId) { if (!doc()) return null; edit(function (dc) { Drawing.deleteBalloons(dc, viewId); }); return summary(); },
      bom: function (props) { if (!doc()) return null; if (props !== undefined) setBom(props === null ? null : typeof props === 'string' ? { anchor: props } : props); return summary().bom; },
      // BOM columns: bomColumns() -> the column specs; bomColumns([{ type, prop, title, width, hidden } | 'Material', …])
      // replaces them (a string is a property column); bomType('top' | 'indented' | 'parts'); each one undo step, returns summary().bom
      bomColumns: function (cols) { if (!doc()) return null; if (!arguments.length) return Drawing.bomColumnSpecs(doc().bom); setBom({ columns: cols }); return summary().bom; },
      bomType: function (t) { if (!doc()) return null; if (!arguments.length) return (doc().bom && doc().bom.type) || 'top'; setBom({ type: t }); return summary().bom; },
      // title block: titleBlock() -> { key: text shown }; titleBlock({ key: text | null }) sets (null: back to the default link)
      titleBlock: function (map) { if (!doc()) return null; if (map) setTitleBlock(map); return Drawing.titleBlock(doc(), App.model, cctx()); },
      addView: function (orient, opts) { opts = opts || {}; startPlacing({ orient: orient, display: opts.display, scale: opts.scale ? Drawing.parseScale(opts.scale) : null }); placePending([opts.x != null ? opts.x : 60 * paperK(), opts.y != null ? opts.y : 100 * paperK()]); return summary(); },
      setSheet: function (props) { setSheet(props || {}); return summary(); },
      modelItems: function (on) { if (!!doc().autoDims !== !!on) cmdModelItems(); return summary(); },
      svg: function () { return Drawing.toSVG(current()); },
      dxf: function () { return Drawing.toDXF(current()); },
      pdf: function () { return Drawing.toPDF(current()); },
      doc: function () { return JSON.parse(JSON.stringify(doc())); },
      // annotations: each is one undo step and returns the summary (null and a status message when refused)
      options: function (props) { if (!doc()) return null; if (props) setDocOptions(props); return Drawing.docOptions(doc()); },
      centerMark: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addCenterMark(dc, viewId, spec || {}); }); },
      autoCenterMarks: function (viewId) { return annotApi(function (dc) { var n = 0; dc.views.forEach(function (v) { if (viewId == null || v.id === viewId) n += Drawing.autoCenterMarks(dc, mesh(), v.id); }); return n; }); },
      centerline: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addCenterline(dc, viewId, spec || {}); }); },
      autoCenterlines: function (viewId) { return annotApi(function (dc) { var n = 0; dc.views.forEach(function (v) { if (viewId == null || v.id === viewId) n += Drawing.autoCenterlines(dc, mesh(), v.id); }); return n; }); },
      holeCallout: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addHoleCallout(dc, viewId, spec || {}); }); },
      deleteAnnotation: function (id) { return annotApi(function (dc) { if (!Drawing.deleteAnnotation(dc, id)) throw new Error('No annotation ' + id); return true; }); },
      ordinate: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addOrdinate(dc, viewId, spec || {}); }); },
      baseline: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addBaseline(dc, viewId, spec || {}); }); },
      chamferDim: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addChamferDim(dc, viewId, spec || {}); }); },
      // dimension i of summary().dims: dimProps(i) -> its properties; dimProps(i, { tol, prec, label, flip, at, tx, lead, off })
      dimProps: function (i, props) {
        var d = current() && current().dims[i];
        if (!d) return null;
        if (props) { setDimProps(d, props); d = current().dims.filter(function (x) { return dimMatches(dimRef(d), x); })[0] || d; }
        var o = {}; Drawing.DIM_PROPS.forEach(function (k) { if (d[k] != null) o[k] = JSON.parse(JSON.stringify(d[k])); }); o.text = d.text;
        return o;
      },
      dimSource: function (i) { var d = current() && current().dims[i]; if (!d) return null; var w = current().views.filter(function (x) { return x.view.id === d.view; })[0]; return Drawing.dimSource(App.model, App.build, w, d); },
      // driveDim(i, value) -> Promise of the summary: a model item's new value changes the part and rebuilds it
      driveDim: function (i, value) {
        var d = current() && current().dims[i], w = d && current().views.filter(function (x) { return x.view.id === d.view; })[0], src = d && d.auto ? Drawing.dimSource(App.model, App.build, w, d) : null;
        if (!src) { UI.setStatus('That dimension drives no model parameter.'); return Promise.resolve(null); }
        var r = applyDimensionPM(d, src, { value: value, tolType: d.tol ? d.tol.type : 'none', plus: d.tol ? d.tol.plus : 0, minus: d.tol ? d.tol.minus : 0, prec: d.prec != null ? String(d.prec) : 'auto', label: d.label, flip: d.flip });
        return r && r.then ? r.then(function () { return summary(); }) : Promise.resolve(r === false ? null : summary());
      },
      balloon: function (viewId, spec) { return annotApi(function (dc) { return Drawing.addBalloon(dc, App.model, viewId, spec || {}); }); },
      balloonProps: function (viewId, index, props) { if (!doc()) return null; setBalloonProps(viewId, index, props || {}); return summary(); }
    };
  }
  UI.makeDrawing = makeDrawing; UI.openDrawing = openDrawing; UI.closeDrawing = closeDrawing; UI.drawingActive = function () { return D.active; };
  UI.drawing = { state: D, render: render, centerMark: cmdCenterMark, centerline: cmdCenterline, holeCallout: cmdHoleCallout, ordinate: function () { cmdChainDim('ordinate'); }, baseline: function () { cmdChainDim('baseline'); },
    chamferDim: cmdChamferDim, balloon: function () { cmdBalloon(false); }, stackedBalloon: function () { cmdBalloon(true); }, docProps: cmdDocProps, dimensionPM: cmdDimensionPM, annotAt: annotAt, dimAt: dimAt, edgeAt: edgeAt, autoBalloon: cmdAutoBalloon, bom: cmdBOM, balloonAt: balloonAt, bomAt: bomAt, fit: fitSheet, standard3View: cmdStandard3View, projectedView: cmdProjectedView, sectionView: cmdSectionView, detailView: cmdDetailView, modelView: cmdModelView, smartDimension: cmdSmartDimension, modelItems: cmdModelItems, sheetProperties: cmdSheetProperties, viewProperties: cmdViewProperties, deleteSelection: deleteSelection, addDimension: addDimension, entityAt: entityAt, exportAs: exportAs, toPaper: toPaper };
  // the File menu gets its drawing entry through UI.menuHook; redraw the menu bar now that the hook exists
  if (UI.renderMenuBar && $('menus').children.length) UI.renderMenuBar();
  if (UI.refreshRibbon && $('ribbon-buttons').children.length) UI.refreshRibbon();
})();
