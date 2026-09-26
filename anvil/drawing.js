// drawing.js — 2D drawings of the active part or assembly (SolidWorks: File ▸ Make Drawing from Part / Assembly).
// An assembly is drawn from its solved mesh (one body per component, so hidden lines run across components and
// section views hatch each component at its own angle) and gets a Bill of Materials table and Auto Balloons.
// Two halves in one file:
//   * `Drawing` (no UI needed, loaded by tests/kernel-tests.html): orthographic and isometric projection of a mesh with
//     exact hidden-line removal (every candidate edge is clipped against the front-facing triangles, not a screenshot),
//     silhouette edges of faceted curved faces, a sheet with border and title block, view scale, automatic model
//     dimensions (overall sizes, hole / boss diameters), and writers for SVG, DXF (one layer per view) and PDF.
//   * the drawing document UI (only when `UI` exists): File ▸ Make Drawing from Part, a Drawing ribbon tab
//     (Standard 3 View, Model View, Smart Dimension, Model Items, Sheet Properties, exports), a drawing FeatureManager
//     with Sheet and Drawing View rows, the sheet itself with pan/zoom, view dragging with projected-view alignment.
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
    mesh._drawingEdges = out;
    return out;
  }

  // ------------------------------------------------------------------ hidden-line removal
  // projectView(mesh, orientName, opts) -> { orient, lines: { visible, hidden }, circles: { visible, hidden }, bounds, stats }
  // lines are [u1, v1, u2, v2] in model units. Candidate edges: sharp edges (faces meeting at more than 22°, open or
  // non-manifold edges) and silhouettes (a smooth edge between a face turned toward the viewer and one that is not).
  // Each candidate is clipped against every front-facing triangle: along the edge both "inside the triangle's
  // projection" and "behind the triangle's plane" are linear conditions, so each triangle hides one exact parameter
  // interval; what no triangle hides is visible. Collinear pieces are merged, hidden pieces lying under visible ones
  // are dropped, and closed chains that are regular circles come back as circles.
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
    mesh.faces.forEach(function (f) {
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
        tris.push({ q: q2, hs: hs, n: f.normal, c: V.dot(f.normal, [P[o], P[o + 1], P[o + 2]]), ne: ne, wmax: wmax,
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
    // hidden intervals of one 3D segment
    function hiddenIntervals(A, B, a2, b2) {
      var wa = V.dot(A, e), wb = V.dot(B, e), wmin = Math.min(wa, wb), AB = V.sub(B, A);
      var ivs = [];
      var cand = candidates(a2, b2);
      for (var ci = 0; ci < cand.length; ci++) {
        var t = tris[cand[ci]];
        if (t.wmax <= wmin + epsZ) continue;               // the triangle is nowhere in front of the segment
        var lo = 0, hi = 1;
        // in front: s(t) = (c - n·X(t)) / (n·e) > epsZ
        var s0 = (t.c - V.dot(t.n, A)) / t.ne, s1 = (t.c - V.dot(t.n, B)) / t.ne;
        var r = clipLinear(s0 - epsZ, s1 - epsZ, lo, hi, true); if (!r) continue; lo = r[0]; hi = r[1];
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

    var vis = [], hid = [];
    meshEdges(mesh).forEach(function (ed) {
      if (ed.smooth) {
        var s0 = V.dot(ed.normals[0], e) > 1e-9, s1 = V.dot(ed.normals[1], e) > 1e-9;
        if (s0 === s1) return;                              // tangent edge, not on the outline: never drawn
      }
      var a2 = [V.dot(ed.a, U), V.dot(ed.a, Vv)], b2 = [V.dot(ed.b, U), V.dot(ed.b, Vv)];
      var L2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
      if (L2 < tol2 * 10) return;                           // seen end-on
      var hidden = hiddenIntervals(ed.a, ed.b, a2, b2), t = 0;
      var body = mesh.faces[ed.faces[0]].body || 0;   // the component (assembly) or solid body the edge belongs to
      function seg(t0, t1, list) {
        if ((t1 - t0) * L2 < tol2 * 10) return;
        list.push([a2[0] + (b2[0] - a2[0]) * t0, a2[1] + (b2[1] - a2[1]) * t0, a2[0] + (b2[0] - a2[0]) * t1, a2[1] + (b2[1] - a2[1]) * t1, body]);
      }
      hidden.forEach(function (iv) { seg(t, iv[0], vis); seg(iv[0], iv[1], hid); t = iv[1]; });
      seg(t, 1, vis);
    });
    var merged = mergeCollinear(vis, hid, diag);
    var vc = extractCircles(merged.visible, diag), hc = extractCircles(merged.hidden, diag);
    // every edge whole, visible or not: what user dimensions reattach to after a part change
    var ac = extractCircles(mergeCollinear(vis.concat(hid), [], diag).visible, diag);
    var res = {
      orient: O.name, u: U, v: Vv, e: e, bounds: bounds, all: ac.lines, circlesAll: ac.circles,
      lines: { visible: vc.lines, hidden: opts.display === 'hlr' ? [] : hc.lines },
      circles: { visible: vc.circles, hidden: opts.display === 'hlr' ? [] : hc.circles }
    };
    res.stats = { visibleLines: res.lines.visible.length, hiddenLines: res.lines.hidden.length, visibleCircles: res.circles.visible.length, hiddenCircles: res.circles.hidden.length, occluders: tris.length };
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
  function hatchLines(loops, sp, ang) {
    var a = ang * Math.PI / 180, d = [Math.cos(a), Math.sin(a)], n = [-Math.sin(a), Math.cos(a)];
    var tmin = Infinity, tmax = -Infinity, out = [];
    loops.forEach(function (l) { l.forEach(function (p) { var t = n[0] * p[0] + n[1] * p[1]; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }); });
    for (var k = Math.ceil(tmin / sp); k * sp <= tmax; k++) {
      var t = k * sp, xs = [];
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
    var out = { orient: pr.orient, u: pr.u, v: pr.v, e: pr.e, lines: { visible: [], hidden: [] }, circles: { visible: [], hidden: [] }, arcs: { visible: [], hidden: [] }, all: [], circlesAll: [],
      bounds: { umin: C[0] - R, umax: C[0] + R, vmin: C[1] - R, vmax: C[1] + R } };
    ['visible', 'hidden'].forEach(function (k) {
      pr.lines[k].forEach(function (l) { var q = clipSeg(l, C, R); if (q) out.lines[k].push(q); });
      pr.circles[k].forEach(function (c) {
        var q = clipCircle(c.c, c.r, C, R);
        if (q === 'full') out.circles[k].push(c); else if (q) out.arcs[k].push({ c: c.c, r: c.r, a0: q.a0, a1: q.a1, body: c.body || 0 });
      });
    });
    (pr.all || []).forEach(function (l) { var q = clipSeg(l, C, R); if (q) out.all.push(q); });
    (pr.circlesAll || []).forEach(function (c) { if (clipCircle(c.c, c.r, C, R) === 'full') out.circlesAll.push(c); });
    out.stats = { visibleLines: out.lines.visible.length, hiddenLines: out.lines.hidden.length, visibleCircles: out.circles.visible.length, hiddenCircles: out.circles.hidden.length,
      visibleArcs: out.arcs.visible.length, hiddenArcs: out.arcs.hidden.length };
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
    var a = d.a, bb = d.b, L = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
    if (L < 1e-12) { d.dangling = true; return false; }
    var t = [(bb[0] - a[0]) / L, (bb[1] - a[1]) / L], hit = null;
    (pr.all || []).forEach(function (m) {
      var mx = m[2] - m[0], my = m[3] - m[1], ml = Math.hypot(mx, my);
      if (ml < 1e-12 || Math.abs(t[0] * my - t[1] * mx) > ml * 1e-6) return;          // not parallel
      var p0 = (m[0] - a[0]) * t[0] + (m[1] - a[1]) * t[1], p1 = (m[2] - a[0]) * t[0] + (m[3] - a[1]) * t[1];
      var lo = Math.min(p0, p1), hi = Math.max(p0, p1), off = Math.abs(t[0] * (m[1] - a[1]) - t[1] * (m[0] - a[0]));
      // score: 1 - overlap / union along the line, plus the offset in quarter-view sizes, less a little for a kept end
      var ov = Math.min(hi, L) - Math.max(lo, 0), jac = ov / (Math.max(hi, L) - Math.min(lo, 0)), s = Infinity;
      var sc = (1 - jac) + off / reach - (Math.abs(lo) <= tol || Math.abs(hi - L) <= tol ? 0.1 : 0);
      if (off <= tol && Math.abs(lo) <= tol && Math.abs(hi - L) <= tol) s = -1;
      else if (off <= tol && ov > tol) s = sc;                      // collinear: any overlap
      else if (off <= reach && jac >= 0.5) s = sc;                  // parallel: most of it
      if (s < bs) { bs = s; hit = { m: m, lo: lo, hi: hi, forward: p1 >= p0 }; }
    });
    if (!hit) { d.dangling = true; return false; }
    var m0 = [hit.m[0], hit.m[1]], m1 = [hit.m[2], hit.m[3]];
    d.a = hit.forward ? m0 : m1; d.b = hit.forward ? m1 : m0;
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
      units: model.units === 'in' ? 'in' : 'mm', views: [], date: opts.date || todayISO(), autoDims: asm ? opts.autoDims === true : opts.autoDims !== false, suppressed: [], nextView: 1, layout: 'auto'
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
  function cachedProjection(mesh, orient, display) {
    var F = frameOf(orient), c = mesh._drawingProj || (mesh._drawingProj = {}), key = frameKey(F) + '|' + display;
    return c[key] || (c[key] = projectView(mesh, F, { display: display }));
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
  // addProjectedView(doc, mesh, parentId, dir, { x, y }): a view projected up / down / left / right from a parent,
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
    doc.layout = 'manual';
    return v;
  }
  // where a view in frame F goes when it is placed `dir` of its parent: the parent's centre line, one gap out
  function besidePos(doc, mesh, par, F, dir) {
    var s = viewScale(doc, par), g = GAP * paperK(doc.units), pe = viewExtents(doc, mesh, par), ce = extentsOf(mesh, F), d = DIRS[dir];
    if (!d[0]) return [par.x, par.y + d[1] * ((pe.h + ce.h) * s / 2 + g)];
    return [par.x + d[0] * ((pe.w + ce.w) * s / 2 + g), par.y];
  }
  // addSectionView(doc, mesh, parentId, { axis: 'h' | 'v', at, sign, x, y, label }): a full section on a cutting
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
    doc.layout = 'manual';
    return v;
  }
  // detail scale: twice the parent's, as a standard scale when there is one
  function detailScale(ps) {
    var want = 2 * scaleValue(ps);
    for (var i = 0; i < SCALES.length; i++) if (Math.abs(scaleValue(SCALES[i]) - want) < 1e-9) return SCALES[i].slice();
    return want >= 1 ? [Math.round(want * 1000) / 1000, 1] : [1, Math.round(1000 / want) / 1000];
  }
  // addDetailView(doc, mesh, parentId, { c: [u, v], r, scale, x, y, label }): the parent inside the circle (c, r)
  // (model units in the parent's frame), enlarged to its own scale (default twice the parent's) and labelled
  // DETAIL B / SCALE 4:1; the circle and the letter are drawn on the parent. Not aligned: it goes anywhere.
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
  // titleBlock(doc, model, ctx?) -> { key: evaluated text } for every TB_FIELDS entry
  function titleBlock(doc, model, ctx) {
    ctx = ctx || {};
    var out = {}, own = doc.titleBlock || {};
    if (typeof Materials !== 'undefined' && model && !ctx.props) {
      var asm = model.type === 'assembly', b = ctx.build && !!ctx.build.assembly === asm ? ctx.build : null;
      ctx = { build: b, mesh: ctx.mesh, props: Materials.context(model, { build: b, mesh: asm ? null : ctx.mesh }) };
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
      var S = sectionOf(mesh, F.e, sc.sign * sc.at), pr = cachedProjection(S.mesh, F, v.display), full = extentsOf(mesh, F);
      if (!S.mesh.faces.length) pr = emptyProjection(F, full);
      return { frame: F, proj: pr, center: [full.cu, full.cv], caps: capLoops(S, F), section: S, scale: s };
    }
    if (v.kind === 'detail' && par && parentContent) {
      var pc = parentContent(par), dt = v.detail;
      return { frame: pc.frame, proj: clipProjection(pc.proj, dt.c, dt.r), center: dt.c.slice(), caps: pc.caps, clip: { c: dt.c.slice(), r: dt.r }, scale: s };
    }
    var F2 = viewFrame(doc, v), pr2 = cachedProjection(mesh, F2, v.display), b = pr2.bounds;
    return { frame: F2, proj: pr2, center: [(b.umin + b.umax) / 2, (b.vmin + b.vmax) / 2], caps: [], scale: s };
  }
  function emptyProjection(F, ext) {
    return { orient: F.name, u: F.u, v: F.v, e: F.e, lines: { visible: [], hidden: [] }, circles: { visible: [], hidden: [] }, all: [], circlesAll: [],
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
        if (done[key]) return;
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
    dims.forEach(function (d) { d.text = dimText(d, units); });
    return dims;
  }
  function autoDimKey(d) { return d.view + ':' + d.kind + ':' + (d.kind === 'dia' ? d.value.toFixed(4) : d.a.concat(d.b).map(function (x) { return x.toFixed(4); }).join(',')); }
  function dimText(d, units) {
    if (d.kind === 'dia') return (d.count > 1 ? d.count + 'X ' : '') + '\u00d8' + fmtDim(d.value, units);
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
  var BOM_TYPES = [['top', 'Top-level only'], ['parts', 'Parts only']];
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
    var groups = [], bySrc = {};
    model.components.forEach(function (c, i) {
      var key = JSON.stringify(c.source), g = bySrc[key];
      if (!g) { g = bySrc[key] = { key: key, source: c.source, first: i, components: [], indices: [], transform: c.transform }; groups.push(g); }
      g.components.push(c.id); g.indices.push(i);
    });
    groups.forEach(function (g) {
      var info = partInfo(g.source, opts.build), pb = null;
      function pbuild() { return pb || (pb = info.build()); }
      var prop = partProps(info.model, null, null), full = null;
      // mass needs the part's build: a property column evaluates through a context that has it, built on first use
      var propFn = function (name) {
        if (!full) full = info.model ? partProps(info.model, pbuild(), null) : prop;
        return full(name);
      };
      var pn = nonEmpty(prop('Part Number')) || info.name;
      var brs = parts && info.model ? bodyRows(info.model, pbuild(), info.model.units === 'in' ? 'in' : 'mm') : null;
      if (brs) {
        brs.forEach(function (b) { push({ key: g.key + '#' + b.key, srcKey: g.key, partNumber: pn + ' - ' + b.name, description: b.size, qty: b.count * g.components.length, components: g.components.slice(), indices: g.indices.slice(), prop: b.prop, body: true }); });
        return;
      }
      var desc = nonEmpty(prop('Description')) || info.description;
      if (!desc && mesh) desc = envelopeText(mesh, g.first, g.transform, model.units);
      push({ key: g.key, srcKey: g.key, partNumber: pn, description: desc, qty: g.components.length, components: g.components.slice(), indices: g.indices.slice(), prop: propFn });
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
      if (!idx.length) return;
      function consider(p, bodyIndex, hidden) {
        if (idx.indexOf(bodyIndex) < 0) return;
        var q = w.toSheet(p), d = Math.hypot(q[0] - cx, q[1] - cy) - (hidden ? 1e6 : 0);
        if (d > bd) { bd = d; best = q; }
      }
      pr.lines.visible.forEach(function (l) { consider([(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], l[4] || 0, false); });
      pr.circles.visible.forEach(function (c) { consider([c.c[0] + c.r, c.c[1]], c.body || 0, false); });
      (pr.arcs ? pr.arcs.visible : []).forEach(function (a) { var e = arcEnds(a); consider([(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2], a.body || 0, false); });
      if (!best) { pr.lines.hidden.forEach(function (l) { consider([(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], l[4] || 0, true); }); pr.circles.hidden.forEach(function (c) { consider([c.c[0] + c.r, c.c[1]], c.body || 0, true); }); }
      if (!best) return;
      out.push({ item: rw.item, key: rw.key, component: b.component, attach: best, r: r, ok: true });
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
    var gap = 2.4 * r, sorted = out.slice().sort(function (a, b) { return a.t - b.t; });
    for (var pass = 0; pass < 8 && sorted.length > 1; pass++) {
      for (var i = 1; i < sorted.length; i++) if (sorted[i].t - sorted[i - 1].t < gap) { var m = (sorted[i].t + sorted[i - 1].t) / 2; sorted[i - 1].t = m - gap / 2; sorted[i].t = m + gap / 2; }
      if (sorted[sorted.length - 1].t - sorted[0].t > per - gap) { var m2 = (sorted[sorted.length - 1].t - per + sorted[0].t) / 2; sorted[0].t = m2 + gap / 2; sorted[sorted.length - 1].t = per + m2 - gap / 2; }
    }
    out.forEach(function (b) { b.c = pOf(b.t); });
    return out;
  }
  // ------------------------------------------------------------------ sheet primitives
  // compute(doc, mesh, model, ctx?) -> { size: [W, H], units, prims: [...], views: [{ view, proj, box }], dims }
  // prims: { k: 'line', a, b, layer, style } | { k: 'circle', c, r, layer, style } | { k: 'text', p, h, text, anchor,
  // layer, rot } | { k: 'fill', pts, layer }; styles: 'visible', 'hidden', 'thin', 'thick'. Paper coordinates, y up.
  function compute(doc, mesh, model, ctx) {
    ctx = ctx || {};
    var units = model.units === 'in' ? 'in' : 'mm', k = paperK(units);
    var S = sheetSize(doc, units), prims = [];
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
        var loops = cap.loops.map(function (l) { return l.map(toSheet); }), hst = hatchStyle(cap.body), n0 = hatch;
        hatchLines(loops, hs * hst.spacing, hst.angle).forEach(function (h) {
          var q = clip ? clipSeg(h, clip.c, clip.r) : h;
          if (q) { prims.push({ k: 'line', a: [q[0], q[1]], b: [q[2], q[3]], layer: layer, style: 'hatch', body: cap.body }); hatch++; }
        });
        hatches.push({ body: cap.body, angle: hst.angle, spacing: hs * hst.spacing, lines: hatch - n0 });
      });
      pr.lines.visible.forEach(function (l) { line(toSheet([l[0], l[1]]), toSheet([l[2], l[3]]), layer, 'visible'); });
      pr.circles.visible.forEach(function (c) { prims.push({ k: 'circle', c: toSheet(c.c), r: c.r * s, layer: layer, style: 'visible' }); });
      (pr.arcs ? pr.arcs.visible : []).forEach(function (a) { prims.push({ k: 'arc', c: toSheet(a.c), r: a.r * s, a0: a.a0, a1: a.a1, layer: layer, style: 'visible' }); });
      pr.lines.hidden.forEach(function (l) { line(toSheet([l[0], l[1]]), toSheet([l[2], l[3]]), layer, 'hidden'); });
      pr.circles.hidden.forEach(function (c) { prims.push({ k: 'circle', c: toSheet(c.c), r: c.r * s, layer: layer, style: 'hidden' }); });
      (pr.arcs ? pr.arcs.hidden : []).forEach(function (a) { prims.push({ k: 'arc', c: toSheet(a.c), r: a.r * s, a0: a.a0, a1: a.a1, layer: layer, style: 'hidden' }); });
      var p0 = toSheet([bd.umin, bd.vmin]), p1 = toSheet([bd.umax, bd.vmax]);
      var box = { x0: p0[0], x1: p1[0], y0: p0[1], y1: p1[1] };
      if (v.kind === 'section') {
        text([v.x, box.y0 - 7 * k], 3.5 * k, 'SECTION ' + v.label + '-' + v.label, 'middle', layer);
        if (v.scale && scaleValue(v.scale) !== scaleValue(scale)) text([v.x, box.y0 - 12 * k], 3 * k, 'SCALE ' + scaleText(v.scale), 'middle', layer);
      } else if (v.kind === 'detail') {
        text([(box.x0 + box.x1) / 2, box.y0 - 7 * k], 3.5 * k, 'DETAIL ' + v.label, 'middle', layer);
        text([(box.x0 + box.x1) / 2, box.y0 - 12 * k], 3 * k, 'SCALE ' + scaleText(v.scale || scale), 'middle', layer);
      } else if (v.scale && scaleValue(v.scale) !== scaleValue(scale)) text([v.x, box.y0 - 6 * k], 3 * k, String(v.orient).toUpperCase() + '  SCALE ' + scaleText(v.scale), 'middle', layer);
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
      bom = { rows: rows, box: bb, layer: BL, columns: bb.columns, cells: cells, type: doc.bom.type === 'parts' ? 'parts' : 'top' };
    }
    views.forEach(function (w) {
      if (!(w.view.balloons || []).length || !rows.length) return;
      balloonSpots(w, rows, k).forEach(function (b) {
        var L = 'BALLOONS', d = [b.attach[0] - b.c[0], b.attach[1] - b.c[1]], Ln = Math.hypot(d[0], d[1]) || 1, u = [d[0] / Ln, d[1] / Ln];
        var start = [b.c[0] + u[0] * b.r, b.c[1] + u[1] * b.r];
        line(start, b.attach, L, 'thin');
        prims.push({ k: 'fill', pts: [b.attach, [b.attach[0] - u[0] * 3 * k + u[1] * 0.9 * k, b.attach[1] - u[1] * 3 * k - u[0] * 0.9 * k], [b.attach[0] - u[0] * 3 * k - u[1] * 0.9 * k, b.attach[1] - u[1] * 3 * k + u[0] * 0.9 * k]], layer: L });
        prims.push({ k: 'circle', c: b.c, r: b.r, layer: L, style: 'thin' });
        text([b.c[0], b.c[1] - 1.25 * k], 3.5 * k, String(b.item), 'middle', L);
        b.view = w.view.id;
        balloons.push(b);
      });
    });
    // dimensions
    var suppressed = doc.suppressed || [];
    var dims = doc.autoDims ? autoDims(doc, projections, units).filter(function (d) { d.key = autoDimKey(d); return suppressed.indexOf(d.key) < 0; }) : [];
    doc.views.forEach(function (v) {
      (v.dims || []).forEach(function (d, i) {
        if (projections[v.id]) reattachDim(d, projections[v.id]);
        var c = JSON.parse(JSON.stringify(d)); c.view = v.id; c.index = i; c.text = dimText(c, units); dims.push(c);
      });
    });
    var placed = [], shown = [];
    dims.forEach(function (d) {
      var vw = views.filter(function (w) { return w.view.id === d.view; })[0];
      if (!vw) return;
      var p = dimPrims(d, vw, k, placed);
      if (d.dangling) p.forEach(function (x) { x.color = 'dangling'; });
      var bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      function grow(q) { bx.x0 = Math.min(bx.x0, q[0]); bx.x1 = Math.max(bx.x1, q[0]); bx.y0 = Math.min(bx.y0, q[1]); bx.y1 = Math.max(bx.y1, q[1]); }
      p.forEach(function (x) {
        prims.push(x);
        if (x.a) { grow(x.a); grow(x.b); }
        if (x.k === 'text') { var w = textWidth(x.text, x.h), vert = Math.abs(x.rot) > 45; grow(x.p); grow(vert ? [x.p[0] - x.h, x.p[1] + w / 2] : [x.p[0] + w, x.p[1] + x.h]); if (vert) grow([x.p[0], x.p[1] - w / 2]); else if (x.anchor === 'middle') grow([x.p[0] - w / 2, x.p[1]]); }
      });
      d.box = bx;
      placed.push(d); shown.push(d);
    });
    dims = shown;
    return { size: S, units: units, prims: prims, views: views, dims: dims, projections: projections, scale: scale, bom: bom, balloons: balloons };
  }
  function layerName(v, used) {
    var base = v.kind === 'section' ? 'SECTION_' + v.label : v.kind === 'detail' ? 'DETAIL_' + v.label : String(v.orient).toUpperCase(), name = base, n = 2;
    while (used[name]) name = base + '_' + n++;
    used[name] = true;
    return name;
  }
  // Paper-space primitives of one dimension. Linear dimensions stack outward from the view box (10 mm, then 8 mm
  // steps) so two on the same side do not overlap; diameters get a 45° leader with the arrow on the circle.
  function dimPrims(d, vw, k, placed) {
    var out = [], L = 'DIMENSIONS', th = 3.5 * k, ar = 3 * k, aw = 0.9 * k;
    function line(a, b) { out.push({ k: 'line', a: a, b: b, layer: L, style: 'thin' }); }
    function arrow(tip, dir) {
      var n = [-dir[1], dir[0]];
      out.push({ k: 'fill', pts: [tip, [tip[0] - dir[0] * ar + n[0] * aw, tip[1] - dir[1] * ar + n[1] * aw], [tip[0] - dir[0] * ar - n[0] * aw, tip[1] - dir[1] * ar - n[1] * aw]], layer: L });
    }
    var box = vw.box;
    if (d.kind === 'dia') {
      // leaders of one view fan out (45°, 135°, -45°, -135°, …) and run past the view outline so concentric callouts
      // do not cross each other; the shelf points away from the view
      var nth = placed.filter(function (p) { return p.view === d.view && p.kind === 'dia'; }).length;
      var c = vw.toSheet(d.c), r = d.r * vw.scale, mid = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
      var off = [c[0] - mid[0], c[1] - mid[1]], offL = Math.hypot(off[0], off[1]), u;
      if (offL > r * 0.5) u = [off[0] / offL, off[1] / offL];   // an off-centre circle: straight out from the view
      else { var ang = [45, 135, -45, -135, 70, 110, -70, -110][nth % 8] * Math.PI / 180; u = [Math.cos(ang), Math.sin(ang)]; }
      var tip = [c[0] + u[0] * r, c[1] + u[1] * r];
      // run from the tip past the view outline (6 mm), and past the overall-dimension lanes on the left and below
      var tx = Math.abs(u[0]) < 1e-9 ? Infinity : u[0] > 0 ? (box.x1 - tip[0]) / u[0] : (box.x0 - tip[0]) / u[0];
      var ty = Math.abs(u[1]) < 1e-9 ? Infinity : u[1] > 0 ? (box.y1 - tip[1]) / u[1] : (box.y0 - tip[1]) / u[1];
      var run = Math.max(0, Math.min(tx, ty)) + (6 + 4 * Math.floor(nth / 4)) * k;
      if (u[0] < -0.2) run = Math.max(run, (box.x0 - 24 * k - tip[0]) / u[0]);
      if (u[1] < -0.2) run = Math.max(run, (box.y0 - 24 * k - tip[1]) / u[1]);
      var elbow = [tip[0] + u[0] * run, tip[1] + u[1] * run], sgn = u[0] >= 0 ? 1 : -1;
      var tw = textWidth(d.text, th), end = [elbow[0] + sgn * (tw + 2 * k), elbow[1]];
      line(tip, elbow); line(elbow, end); arrow(tip, [-u[0], -u[1]]);
      out.push({ k: 'text', p: [elbow[0] + sgn * 1 * k, elbow[1] + 1 * k], h: th, text: d.text, anchor: sgn > 0 ? 'start' : 'end', layer: L, rot: 0 });
      return out;
    }
    var a = vw.toSheet(d.a), b = vw.toSheet(d.b);
    var same = placed.filter(function (p) { return p.view === d.view && p.kind === d.kind && p.side === d.side; }).length;
    var off = (10 + 8 * same) * k, gapE = 1.5 * k, ext = 2 * k;
    if (d.kind === 'h') {
      var y = d.side < 0 ? box.y0 - off : box.y1 + off, sg = d.side < 0 ? -1 : 1;
      if (d.at != null) { y = vw.toSheet([0, d.at])[1]; sg = y < a[1] ? -1 : 1; }
      line([a[0], a[1] + sg * gapE], [a[0], y + sg * ext]); line([b[0], b[1] + sg * gapE], [b[0], y + sg * ext]);
      line([a[0], y], [b[0], y]);
      var dir = b[0] >= a[0] ? 1 : -1;
      arrow([a[0], y], [-dir, 0]); arrow([b[0], y], [dir, 0]);
      out.push({ k: 'text', p: [(a[0] + b[0]) / 2, y + 1 * k], h: th, text: d.text, anchor: 'middle', layer: L, rot: 0 });
    } else if (d.kind === 'v') {
      var x = d.side < 0 ? box.x0 - off : box.x1 + off, sx = d.side < 0 ? -1 : 1;
      if (d.at != null) { x = vw.toSheet([d.at, 0])[0]; sx = x < a[0] ? -1 : 1; }
      line([a[0] + sx * gapE, a[1]], [x + sx * ext, a[1]]); line([b[0] + sx * gapE, b[1]], [x + sx * ext, b[1]]);
      line([x, a[1]], [x, b[1]]);
      var dv = b[1] >= a[1] ? 1 : -1;
      arrow([x, a[1]], [0, -dv]); arrow([x, b[1]], [0, dv]);
      out.push({ k: 'text', p: [x - 1 * k, (a[1] + b[1]) / 2], h: th, text: d.text, anchor: 'middle', layer: L, rot: 90 });
    } else if (d.kind === 'aligned') {
      var dx = b[0] - a[0], dy = b[1] - a[1], Ln = Math.hypot(dx, dy) || 1, t = [dx / Ln, dy / Ln], n = [-t[1], t[0]];
      // offset away from the view centre
      var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cc = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
      if ((mid[0] - cc[0]) * n[0] + (mid[1] - cc[1]) * n[1] < 0) n = [-n[0], -n[1]];
      var o = 8 * k, pa = [a[0] + n[0] * o, a[1] + n[1] * o], pb = [b[0] + n[0] * o, b[1] + n[1] * o];
      line([a[0] + n[0] * gapE, a[1] + n[1] * gapE], [pa[0] + n[0] * ext, pa[1] + n[1] * ext]);
      line([b[0] + n[0] * gapE, b[1] + n[1] * gapE], [pb[0] + n[0] * ext, pb[1] + n[1] * ext]);
      line(pa, pb); arrow(pa, [-t[0], -t[1]]); arrow(pb, t);
      var ang = Math.atan2(t[1], t[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
      out.push({ k: 'text', p: [(pa[0] + pb[0]) / 2 + n[0] * 1 * k, (pa[1] + pb[1]) / 2 + n[1] * 1 * k], h: th, text: d.text, anchor: 'middle', layer: L, rot: ang });
    }
    return out;
  }
  function textWidth(t, h) { return String(t).length * h * 0.6; }

  // ------------------------------------------------------------------ writers
  function num(x) { return String(Math.round(x * 1e4) / 1e4); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  // widths in paper mm
  var STROKE = { visible: 0.5, hidden: 0.35, thin: 0.25, thick: 0.7, hatch: 0.18, chain: 0.7 };
  // SolidWorks draws dangling annotations (their model reference is gone) in olive brown
  var COLORS = { dangling: '#a07c00' }, DXF_COLORS = { dangling: 42 }, PDF_COLORS = { dangling: '0.627 0.486 0' };
  // a CCW arc (degrees) as start / end points
  function arcEnds(p) {
    var a0 = p.a0 * Math.PI / 180, a1 = p.a1 * Math.PI / 180;
    return [[p.c[0] + p.r * Math.cos(a0), p.c[1] + p.r * Math.sin(a0)], [p.c[0] + p.r * Math.cos(a1), p.c[1] + p.r * Math.sin(a1)]];
  }
  function toSVG(sheet, opts) {
    opts = opts || {};
    var S = sheet.size, k = sheet.units === 'in' ? 1 / MM : 1, H = S[1];
    function X(p) { return num(p[0]); } function Y(p) { return num(H - p[1]); }
    var dash = num(3 * k) + ' ' + num(1.5 * k), chain = [8, 1.5, 1.5, 1.5].map(function (x) { return num(x * k); }).join(' ');
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + num(S[0]) + sheet.units + '" height="' + num(S[1]) + sheet.units + '" viewBox="0 0 ' + num(S[0]) + ' ' + num(S[1]) + '" font-family="Arial, Helvetica, sans-serif">'];
    out.push('<rect class="sheet-bg" x="0" y="0" width="' + num(S[0]) + '" height="' + num(S[1]) + '" fill="#fff"/>');
    var groups = {}, gorder = [];
    sheet.prims.forEach(function (p) { if (!groups[p.layer]) { groups[p.layer] = []; gorder.push(p.layer); } groups[p.layer].push(p); });
    gorder.forEach(function (layer) {
      var vw = sheet.views.filter(function (w) { return w.layer === layer; })[0];
      out.push('<g data-layer="' + esc(layer) + '"' + (vw ? ' data-view="' + vw.view.id + '" class="dv"' : '') + ' fill="none" stroke="#000" stroke-linecap="round">');
      groups[layer].forEach(function (p) {
        var sw = num((STROKE[p.style] || 0.25) * k), cls = p.style ? ' class="' + p.style + '"' : '';
        var dsh = p.style === 'hidden' ? ' stroke-dasharray="' + dash + '"' : p.style === 'chain' ? ' stroke-dasharray="' + chain + '"' : '';
        var col = p.color && COLORS[p.color];
        if (col) { dsh += p.k === 'fill' || p.k === 'text' ? '' : ' stroke="' + col + '"'; cls += ' data-color="' + p.color + '"'; }
        if (p.k === 'arc') {
          var ae = arcEnds(p), big = ((p.a1 - p.a0) % 360 + 360) % 360 > 180 ? 1 : 0;
          out.push('<path' + cls + ' d="M' + X(ae[0]) + ' ' + Y(ae[0]) + ' A' + num(p.r) + ' ' + num(p.r) + ' 0 ' + big + ' 0 ' + X(ae[1]) + ' ' + Y(ae[1]) + '" stroke-width="' + sw + '"' + dsh + '/>');
        } else if (p.k === 'line') out.push('<line' + cls + ' x1="' + X(p.a) + '" y1="' + Y(p.a) + '" x2="' + X(p.b) + '" y2="' + Y(p.b) + '" stroke-width="' + sw + '"' + dsh + '/>');
        else if (p.k === 'circle') out.push('<circle' + cls + ' cx="' + X(p.c) + '" cy="' + Y(p.c) + '" r="' + num(p.r) + '" stroke-width="' + sw + '"' + dsh + '/>');
        else if (p.k === 'fill') out.push('<path' + (col ? ' data-color="' + p.color + '"' : '') + ' d="M' + p.pts.map(function (q) { return X(q) + ' ' + Y(q); }).join(' L') + ' Z" fill="' + (col || '#000') + '" stroke="none"/>');
        else if (p.k === 'text') {
          var tr = p.rot ? ' transform="rotate(' + num(-p.rot) + ' ' + X(p.p) + ' ' + Y(p.p) + ')"' : '';
          out.push('<text x="' + X(p.p) + '" y="' + Y(p.p) + '" font-size="' + num(p.h) + '" text-anchor="' + p.anchor + '" fill="' + (col || '#000') + '" stroke="none"' + tr + (col ? ' data-color="' + p.color + '"' : '') + '>' + esc(p.text) + '</text>');
        }
      });
      out.push('</g>');
    });
    out.push('</svg>');
    return out.join('\n');
  }

  // DXF R12: one layer per drawing view (FRONT, TOP, RIGHT, ISOMETRIC…), plus DIMENSIONS and SHEET; hidden edges use
  // the HIDDEN linetype. Paper units ($INSUNITS 4 = mm, 1 = in).
  function toDXF(sheet) {
    var L = [];
    function pr(c, v) { L.push(String(c), String(v)); }
    var layers = [];
    sheet.prims.forEach(function (p) { if (layers.indexOf(p.layer) < 0) layers.push(p.layer); });
    var colors = { SHEET: 7, DIMENSIONS: 3, BOM: 7, BALLOONS: 3 }, next = 1;
    pr(0, 'SECTION'); pr(2, 'HEADER');
    pr(9, '$ACADVER'); pr(1, 'AC1009');
    pr(9, '$INSUNITS'); pr(70, sheet.units === 'in' ? 1 : 4);
    pr(9, '$MEASUREMENT'); pr(70, sheet.units === 'in' ? 0 : 1);
    pr(9, '$EXTMIN'); pr(10, 0); pr(20, 0); pr(30, 0);
    pr(9, '$EXTMAX'); pr(10, num(sheet.size[0])); pr(20, num(sheet.size[1])); pr(30, 0);
    pr(9, '$LTSCALE'); pr(40, sheet.units === 'in' ? 0.04 : 1);
    pr(0, 'ENDSEC');
    pr(0, 'SECTION'); pr(2, 'TABLES');
    pr(0, 'TABLE'); pr(2, 'LTYPE'); pr(70, 3);
    pr(0, 'LTYPE'); pr(2, 'CONTINUOUS'); pr(70, 0); pr(3, 'Solid line'); pr(72, 65); pr(73, 0); pr(40, 0);
    pr(0, 'LTYPE'); pr(2, 'HIDDEN'); pr(70, 0); pr(3, '__ __ __ __'); pr(72, 65); pr(73, 2); pr(40, 4.5); pr(49, 3); pr(49, -1.5);
    pr(0, 'LTYPE'); pr(2, 'PHANTOM'); pr(70, 0); pr(3, '____ _ ____ _'); pr(72, 65); pr(73, 4); pr(40, 12.5); pr(49, 8); pr(49, -1.5); pr(49, 1.5); pr(49, -1.5);
    pr(0, 'ENDTAB');
    pr(0, 'TABLE'); pr(2, 'LAYER'); pr(70, layers.length);
    layers.forEach(function (n) {
      var col = colors[n] || [5, 1, 6, 4, 2, 30, 140][(next++ - 1) % 7];
      pr(0, 'LAYER'); pr(2, n); pr(70, 0); pr(62, col); pr(6, 'CONTINUOUS');
    });
    pr(0, 'ENDTAB');
    pr(0, 'ENDSEC');
    pr(0, 'SECTION'); pr(2, 'ENTITIES');
    sheet.prims.forEach(function (p) {
      var ltn = p.style === 'hidden' ? 'HIDDEN' : p.style === 'chain' ? 'PHANTOM' : null, dc = p.color && DXF_COLORS[p.color];
      var lt = function () { if (ltn) pr(6, ltn); if (dc) pr(62, dc); };
      if (p.k === 'line') { pr(0, 'LINE'); pr(8, p.layer); lt(); pr(10, num(p.a[0])); pr(20, num(p.a[1])); pr(30, 0); pr(11, num(p.b[0])); pr(21, num(p.b[1])); pr(31, 0); }
      else if (p.k === 'circle') { pr(0, 'CIRCLE'); pr(8, p.layer); lt(); pr(10, num(p.c[0])); pr(20, num(p.c[1])); pr(30, 0); pr(40, num(p.r)); }
      else if (p.k === 'arc') { pr(0, 'ARC'); pr(8, p.layer); lt(); pr(10, num(p.c[0])); pr(20, num(p.c[1])); pr(30, 0); pr(40, num(p.r)); pr(50, num(((p.a0 % 360) + 360) % 360)); pr(51, num(((p.a1 % 360) + 360) % 360)); }
      else if (p.k === 'fill') {
        pr(0, 'SOLID'); pr(8, p.layer); lt();
        var q = [p.pts[0], p.pts[1], p.pts[2], p.pts[2]];
        q.forEach(function (pt, i) { pr(10 + i, num(pt[0])); pr(20 + i, num(pt[1])); pr(30 + i, 0); });
      } else if (p.k === 'text') {
        pr(0, 'TEXT'); pr(8, p.layer); lt(); pr(10, num(p.p[0])); pr(20, num(p.p[1])); pr(30, 0); pr(40, num(p.h)); pr(1, String(p.text).replace(/\u00d8/g, '%%c').replace(/\u00d7/g, 'x').replace(/[^\x20-\x7e]/g, '?'));
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
    var cur = null, curCol = '0 0 0', chain = [8, 1.5, 1.5, 1.5].map(function (x) { return num(x * k * ptPer); }).join(' ');
    function style(s) {
      if (s === cur) return; cur = s;
      c.push(num((STROKE[s] || 0.25) * k * ptPer) + ' w ' + (s === 'hidden' ? '[' + num(dash[0]) + ' ' + num(dash[1]) + '] 0 d' : s === 'chain' ? '[' + chain + '] 0 d' : '[] 0 d'));
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
    function pdfText(s) {
      var out = '';
      for (var i = 0; i < s.length; i++) {
        var ch = s.charCodeAt(i);
        if (ch === 0xd8) out += '\\330';
        else if (ch === 0xd7) out += '\\327';
        else if (ch === 40 || ch === 41 || ch === 92) out += '\\' + s[i];
        else if (ch >= 32 && ch < 127) out += s[i];
        else out += '?';
      }
      return out;
    }
    sheet.prims.forEach(function (p) {
      color(p);
      if (p.k === 'arc') { style(p.style); c.push(arcPath(p)); }
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
        var fs = p.h * ptPer * 1.35, w = textWidth(p.text, p.h) * ptPer * 1.1;   // cap height ≈ 0.72 em
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

  return {
    ORIENTS: Object.keys(ORIENTS), FORMATS: FORMATS, SCALES: SCALES,
    orientation: orientation, meshEdges: meshEdges, projectView: projectView, extentsOf: extentsOf,
    newDrawing: newDrawing, addView: addView, standard3View: standard3View, layout: layout, moveView: moveView, findView: findView,
    sheetSize: sheetSize, scaleText: scaleText, parseScale: parseScale, scaleValue: scaleValue,
    autoDims: autoDims, dimText: dimText, fmtDim: fmtDim, compute: compute, toSVG: toSVG, toDXF: toDXF, toPDF: toPDF,
    frameOf: frameOf, viewFrame: viewFrame, projectedFrame: projectedFrame, sectionFrame: sectionFrame, isOrthoFrame: isOrthoFrame,
    addProjectedView: addProjectedView, addSectionView: addSectionView, addDetailView: addDetailView, detailScale: detailScale, nextLabel: nextLabel,
    sectionOf: sectionOf, hatchLines: hatchLines, hatchStyle: hatchStyle, clipProjection: clipProjection, reattachDim: reattachDim, deleteView: deleteView,
    bomRows: bomRows, bomBox: bomBox, partInfo: partInfo, autoBalloon: autoBalloon, deleteBalloons: deleteBalloons, balloonSpots: balloonSpots,
    BOM_ANCHORS: BOM_ANCHORS, BOM_COLS: BOM_COLS, BOM_TYPES: BOM_TYPES, bomColumns: bomColumns, bomColumnSpecs: bomColumnSpecs,
    TB_FIELDS: TB_FIELDS, titleBlock: titleBlock, titleText: titleText, bomPropertyNames: bomPropertyNames
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
    closeDoc: '<path d="M2 3 h12 v10 H2 z" fill="#fff" stroke="currentColor" stroke-width="1.1"/><path d="M5.5 5.5 l5 5 M10.5 5.5 l-5 5" stroke="#e0553c" stroke-width="1.4"/>'
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
      var dc = Drawing.newDrawing(App.model, opts);
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
  function render() {
    if (!D.active) return;
    var dc = doc();
    if (!dc) { closeDrawing(); return; }
    syncBom(dc);
    if (dc.layout === 'auto') Drawing.layout(dc, mesh(), units());
    D.sheet = Drawing.compute(dc, mesh(), App.model, cctx());
    var svg = Drawing.toSVG(D.sheet);
    D.host.innerHTML = svg;
    var s = D.host.querySelector('svg');
    s.setAttribute('width', '100%'); s.setAttribute('height', '100%');
    s.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g')).setAttribute('id', 'dw-overlay');
    applyViewBox();
    drawOverlay();
    renderTree();
    renderTabs();
    $('doc-title').textContent = dc.name + ' - ' + dc.sheet.name;
  }
  function queueRender() {
    if (D.renderQueued) return;
    D.renderQueued = true;
    requestAnimationFrame(function () { D.renderQueued = false; render(); });
  }
  function svgEl() { return D.host && D.host.querySelector('svg'); }
  function applyViewBox() {
    var s = svgEl();
    if (!s || !D.sheet) return;
    if (!D.vb) D.vb = fitBox();
    s.setAttribute('viewBox', D.vb.x + ' ' + D.vb.y + ' ' + D.vb.w + ' ' + D.vb.h);
  }
  function fitBox() {
    var S = D.sheet.size, m = Math.max(S[0], S[1]) * 0.03;
    return { x: -m, y: -m, w: S[0] + 2 * m, h: S[1] + 2 * m };
  }
  function fitSheet() { D.vb = null; applyViewBox(); }
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
      var sel = D.sel && D.sel.kind === 'view' && D.sel.id === w.view.id, hov = D.hover && D.hover.kind === 'view' && D.hover.id === w.view.id;
      if (!sel && !hov) return;
      svgNode('rect', { class: 'dw-vbox' + (sel ? ' sel' : ''), x: w.box.x0 - pad, y: H - w.box.y1 - pad, width: w.box.x1 - w.box.x0 + 2 * pad, height: w.box.y1 - w.box.y0 + 2 * pad, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g);
    });
    D.sheet.dims.forEach(function (d) {
      var sel = D.sel && D.sel.kind === 'dim' && dimMatches(D.sel, d), hov = D.hover && D.hover.kind === 'dim' && dimMatches(D.hover, d);
      if (!sel && !hov || !d.box) return;
      svgNode('rect', { class: 'dw-dbox' + (sel ? ' sel' : ''), x: d.box.x0 - pad / 2, y: H - d.box.y1 - pad / 2, width: d.box.x1 - d.box.x0 + pad, height: d.box.y1 - d.box.y0 + pad, 'stroke-width': sw }, g);
    });
    if (D.sel && D.sel.kind === 'bom' && D.sheet.bom) { var bb = D.sheet.bom.box; svgNode('rect', { class: 'dw-vbox sel', x: bb.x0 - pad, y: H - bb.y1 - pad, width: bb.x1 - bb.x0 + 2 * pad, height: bb.y1 - bb.y0 + 2 * pad, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g); }
    (D.sheet.balloons || []).forEach(function (b) {
      if (D.sel && D.sel.kind === 'balloon' && D.sel.view === b.view && D.sel.key === b.key && D.sel.component === b.component) svgNode('circle', { class: 'dw-hot', cx: b.c[0], cy: H - b.c[1], r: b.r + pad / 2, 'stroke-width': pxToPaper(2) }, g);
    });
    if (D.hover && D.hover.kind === 'entity') {
      var h = D.hover;
      if (h.circle) svgNode('circle', { class: 'dw-hot', cx: h.circle.c[0], cy: H - h.circle.c[1], r: h.circle.r, 'stroke-width': pxToPaper(3) }, g);
      else svgNode('line', { class: 'dw-hot', x1: h.a[0], y1: H - h.a[1], x2: h.b[0], y2: H - h.b[1], 'stroke-width': pxToPaper(3) }, g);
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
  function entityAt(p) {
    var tol = pxToPaper(6), best = null, bd = tol;
    D.sheet.views.forEach(function (w) {
      if (!w.ortho) return;   // lengths in a pictorial view are foreshortened
      w.proj.lines.visible.forEach(function (l) {
        var a = w.toSheet([l[0], l[1]]), b = w.toSheet([l[2], l[3]]), d = segDist(p, a, b);
        if (d < bd) { bd = d; best = { kind: 'entity', view: w.view.id, a: a, b: b, la: [l[0], l[1]], lb: [l[2], l[3]] }; }
      });
      w.proj.circles.visible.forEach(function (c) {
        var cc = w.toSheet(c.c), r = c.r * w.scale, d = Math.abs(Math.hypot(p[0] - cc[0], p[1] - cc[1]) - r);
        if (d < bd) { bd = d; best = { kind: 'entity', view: w.view.id, circle: { c: cc, r: r }, mc: c }; }
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
  function onDown(e) {
    if (!D.active || !D.sheet) return;
    e.preventDefault();
    var p = toPaper(e);
    if (e.button === 1 || e.button === 2 && e.shiftKey) { D.drag = { kind: 'pan', x: e.clientX, y: e.clientY, vb: D.vb && JSON.parse(JSON.stringify(D.vb)) }; return; }
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
    var bl = balloonAt(p);
    if (bl) { D.sel = { kind: 'balloon', view: bl.view, key: bl.key, component: bl.component }; drawOverlay(); renderTree(); UI.setStatus('Balloon ' + bl.item + ' (Bill of Materials item ' + bl.item + ') — Delete removes it.'); return; }
    var bt = bomAt(p);
    if (bt) {
      D.sel = { kind: 'bom' };
      D.drag = { kind: 'bom', start: p, x0: bt.box.x0, y0: bt.box.y1, moved: false };
      drawOverlay(); renderTree();
      UI.setStatus('Bill of Materials (' + bt.rows.length + ' items) — drag to move it off its anchor, double-click for properties, Delete removes it.');
      return;
    }
    var dm = dimAt(p);
    if (dm) { D.sel = { kind: 'dim', view: dm.view, key: dm.key || null, index: dm.index }; drawOverlay(); renderTree(); UI.setStatus('Dimension ' + dm.text + (dm.auto ? ' (model item)' : '') + ' \u2014 Delete removes it.'); return; }
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
      return;
    }
    if (D.drag && D.drag.kind === 'bom') {
      var pb = toPaper(e), db = D.drag;
      if (!db.moved && Math.hypot(pb[0] - db.start[0], pb[1] - db.start[1]) < pxToPaper(3)) return;
      if (!db.moved) { UI.pushUndo(); db.moved = true; }
      doc().bom.x = db.x0 + pb[0] - db.start[0]; doc().bom.y = db.y0 + pb[1] - db.start[1];
      queueRender();
      return;
    }
    if (D.drag && D.drag.kind === 'view') {
      var p = toPaper(e), dg = D.drag;
      if (!dg.moved && Math.hypot(p[0] - dg.start[0], p[1] - dg.start[1]) < pxToPaper(3)) return;
      if (!dg.moved) { UI.pushUndo(); dg.moved = true; }
      Drawing.moveView(doc(), dg.id, dg.x0 + p[0] - dg.start[0], dg.y0 + p[1] - dg.start[1]);
      queueRender();
      return;
    }
    if (e.target && D.host.contains(e.target)) {
      var q = toPaper(e), h = null;
      if (/^(place|project|section|detail)$/.test(D.tool) && D.pending) { D.pending.at = q; drawOverlay(); return; }
      if (D.tool === 'dim') h = entityAt(q);
      else { var dm = dimAt(q); if (dm) h = { kind: 'dim', view: dm.view, key: dm.key || null, index: dm.index }; else { var w = viewAt(q); if (w) h = { kind: 'view', id: w.view.id }; } }
      if (JSON.stringify(h) !== JSON.stringify(D.hover)) { D.hover = h; drawOverlay(); }
    }
  }
  function onUp() {
    if (!D.drag) return;
    var dg = D.drag;
    D.drag = null;
    if ((dg.kind === 'view' || dg.kind === 'bom') && dg.moved) { UI.autosave(); render(); }
  }
  function onWheel(e) {
    if (!D.active || !D.vb) return;
    e.preventDefault();
    var s = svgEl(), m = s.getScreenCTM();
    var pt = s.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    var q = pt.matrixTransform(m.inverse()), f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    D.vb = { x: q.x - (q.x - D.vb.x) * f, y: q.y - (q.y - D.vb.y) * f, w: D.vb.w * f, h: D.vb.h * f };
    applyViewBox();
    drawOverlay();
  }
  function onDblClick(e) {
    if (!D.active || D.tool) return;
    if (bomAt(toPaper(e))) { cmdBOM(); return; }
    var w = viewAt(toPaper(e));
    if (w) cmdViewProperties(w.view.id); else cmdSheetProperties();
  }
  function onContext(e) {
    e.preventDefault();
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
    spec.onClose = function () { $('app').classList.remove('dw-pm'); if (onClose) onClose(); if (D.active) { UI.setFmTab('tree'); render(); } };
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
    edit(function (dc) { v = Drawing.addProjectedView(dc, mesh(), parent, pl.dir, { x: pl.x, y: pl.y }); });
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
    edit(function (dc) { v = Drawing.addSectionView(dc, mesh(), parent, spec); });
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
    edit(function (dc) { v = Drawing.addDetailView(dc, mesh(), parent, spec); });
    D.sel = { kind: 'view', id: v.id }; drawOverlay(); renderTree();
    UI.setStatus(v.name + ' placed.');
    return v;
  }
  function cmdViewProperties(id) {
    var v = Drawing.findView(doc(), id);
    if (!v) return;
    openDrawingPM({
      title: v.name, icon: 'drawingView', command: 'viewProps',
      values: { orient: v.orient, display: v.display, scale: v.scale ? Drawing.scaleText(v.scale) : 'sheet' },
      // projected, section and detail views take their direction from the parent
      groups: (v.kind ? [] : [{ title: 'Orientation', fields: [{ type: 'select', key: 'orient', label: 'View', options: Drawing.ORIENTS }] }]).concat([
        { title: 'Display Style', fields: [{ type: 'select', key: 'display', label: 'Style', options: [['hlv', 'Hidden Lines Visible'], ['hlr', 'Hidden Lines Removed']] }] },
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
          if (w.role === 'iso') w.role = null;
          dc.layout = 'manual';
        });
      }
    });
  }
  function setViewDisplay(id, display) {
    edit(function (dc) { var v = Drawing.findView(dc, id); if (v) v.display = display; });
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
    if (s.kind === 'balloon') {
      edit(function (dc) { var v = Drawing.findView(dc, s.view); if (v && v.balloons) v.balloons = v.balloons.filter(function (b) { return !(b.key === s.key && b.component === s.component); }); });
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
      { label: 'Delete', key: 'Del', action: function () { deleteView(v.id); } }
    ];
  }
  function sheetMenu() {
    return [
      { label: 'Properties\u2026', action: cmdSheetProperties },
      { label: 'Standard 3 View', action: cmdStandard3View },
      { label: 'Model View\u2026', action: cmdModelView },
      { label: 'Model Items', checked: !!(doc() && doc().autoDims), action: cmdModelItems },
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
      if (props.type) b.type = props.type === 'parts' ? 'parts' : 'top';
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
    var values = { anchor: b.x != null ? 'moved' : b.anchor || 'top-right', type: b.type === 'parts' ? 'parts' : 'top', addProp: '', addTitle: '' };
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
        UI.setStatus('Bill of Materials (' + (val.type === 'parts' ? 'Parts only' : 'Top-level only') + '): ' + n + ' item' + (n === 1 ? '' : 's') + ', ' + (doc().bom.x != null ? 'where it was dragged' : 'anchored ' + ANCHOR_NAMES[doc().bom.anchor]) + '.');
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
  if (UI.ASM_RIBBON) UI.ASM_RIBBON.Drawing = UI.RIBBON.Drawing;
  // the Drawing tab exists only in a drawing document; part tabs are hidden while one is open
  UI.ribbonTabsFor = function (names, extra) {
    if (D.active) return [['Drawing'], ['Annotation', 'Sketch', 'Markup', 'Sheet Format']];
    return [names.filter(function (n) { return n !== 'Drawing'; }), extra];
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
        { label: 'Tables \u25b8 Bill of Materials\u2026', action: cmdBOM }
      ] },
      { label: 'Tools', items: [{ label: 'Sheet Properties\u2026', action: cmdSheetProperties }] },
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
    if (k === 'f' || k === 'F') { fitSheet(); drawOverlay(); return; }
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
    if (!D.sheet || !D.active) { syncBom(dc); if (dc.layout === 'auto') Drawing.layout(dc, mesh(), units()); D.sheet = Drawing.compute(dc, mesh(), App.model, cctx()); }
    return {
      name: dc.name, open: D.active, sheet: { name: dc.sheet.name, format: dc.sheet.format, size: D.sheet.size, scale: Drawing.scaleText(dc.sheet.scale), autoScale: !!dc.sheet.autoScale, projection: dc.sheet.projection },
      views: D.sheet.views.map(function (w) {
        var b = w.proj.bounds;
        return { id: w.view.id, name: w.view.name, orient: w.view.orient, role: w.view.role, kind: w.view.kind || 'model', label: w.view.label || null, parent: w.view.parent,
          display: w.view.display, x: +w.view.x.toFixed(3), y: +w.view.y.toFixed(3), scale: w.view.scale ? Drawing.scaleText(w.view.scale) : null,
          extents: [+(b.umax - b.umin).toFixed(4), +(b.vmax - b.vmin).toFixed(4)], box: [w.box.x0, w.box.y0, w.box.x1, w.box.y1].map(function (x) { return +x.toFixed(3); }), stats: w.proj.stats, dims: (w.view.dims || []).length,
          hatch: w.hatch, sectionArea: w.section ? +w.section.area.toFixed(6) : null,
          hatches: (w.hatches || []).map(function (h) { return { body: h.body, component: isAsm() && App.model.components[h.body] ? App.model.components[h.body].name : null, angle: h.angle, lines: h.lines }; }),
          balloons: (D.sheet.balloons || []).filter(function (b) { return b.view === w.view.id; }).map(function (b) { return b.item; }) };
      }),
      bom: D.sheet.bom ? { anchor: dc.bom.x != null ? 'moved' : dc.bom.anchor, box: ['x0', 'y0', 'x1', 'y1'].map(function (q) { return +D.sheet.bom.box[q].toFixed(3); }),
        type: D.sheet.bom.type, columns: D.sheet.bom.columns.map(function (c) { return c.title; }), cells: D.sheet.bom.cells.map(function (r) { return r.map(function (x) { return String(x); }); }),
        rows: D.sheet.bom.rows.map(function (r, i) { var o = { item: r.item, partNumber: r.partNumber, description: r.description, qty: r.qty, components: r.components.map(function (id) { var c = Assembly.findComponent(App.model, id); return c ? c.name : id; }) }; D.sheet.bom.columns.forEach(function (c, j) { if (c.type === 'property') o[c.prop] = String(D.sheet.bom.cells[i][j]); }); return o; }) } : null,
      titleBlock: Drawing.titleBlock(dc, App.model, cctx()),
      balloons: (D.sheet.balloons || []).map(function (b) { return { view: b.view, item: b.item, component: (Assembly.findComponent(App.model, b.component) || {}).name || null, c: [+b.c[0].toFixed(3), +b.c[1].toFixed(3)], attach: [+b.attach[0].toFixed(3), +b.attach[1].toFixed(3)] }; }),
      dims: D.sheet.dims.map(function (d) { return d.text; }), dangling: D.sheet.dims.filter(function (d) { return d.dangling; }).length, autoDims: !!dc.autoDims
    };
  }
  // runs an engine call on a scratch copy first, so a refused view (missing parent, detail of a detail…) leaves no undo step
  function viewApi(fn) {
    if (!doc()) return null;
    try { fn(JSON.parse(JSON.stringify(doc()))); } catch (err) { UI.toast(err.message); UI.setStatus(err.message); return null; }
    var v;
    edit(function (dc) { v = fn(dc); });
    D.sel = { kind: 'view', id: v.id };
    return summary();
  }
  function current() { if (!doc()) return null; if (!D.active) { syncBom(); if (doc().layout === 'auto') Drawing.layout(doc(), mesh(), units()); D.sheet = Drawing.compute(doc(), mesh(), App.model, cctx()); } return D.sheet; }
  if (window.anvil) {
    window.anvil.drawing = {
      make: function (opts) { return makeDrawing(opts) ? summary() : null; },
      open: function (i) { return makeDrawing({ index: i || 0 }) ? summary() : null; },
      close: function () { closeDrawing(); },
      isOpen: function () { return D.active; },
      summary: summary,
      standard3View: function () { cmdStandard3View(); return summary(); },
      // Projected / Section / Detail View without the mouse; each is one undo step and returns the summary
      projectedView: function (parentId, dir, opts) { return viewApi(function (dc) { return Drawing.addProjectedView(dc, mesh(), parentId, dir, opts); }); },
      sectionView: function (parentId, opts) { return viewApi(function (dc) { return Drawing.addSectionView(dc, mesh(), parentId, opts || {}); }); },
      detailView: function (parentId, opts) { return viewApi(function (dc) { return Drawing.addDetailView(dc, mesh(), parentId, Object.assign({ c: [0, 0] }, opts || {})); }); },
      deleteView: function (id) { deleteView(id); return summary(); },
      // assembly drawings: Auto Balloon on a view (default: the selected view, else the isometric), the Bill of
      // Materials (anchor 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left', or { x, y } for its top-left corner),
      // bom(null) removes it
      autoBalloon: function (viewId, opts) { if (!doc() || !isAsm()) return null; var v = viewId != null ? Drawing.findView(doc(), viewId) : defaultBalloonView(); if (!v) return null; autoBalloonView(v.id, opts); return summary(); },
      deleteBalloons: function (viewId) { if (!doc()) return null; edit(function (dc) { Drawing.deleteBalloons(dc, viewId); }); return summary(); },
      bom: function (props) { if (!doc()) return null; if (props !== undefined) setBom(props === null ? null : typeof props === 'string' ? { anchor: props } : props); return summary().bom; },
      // BOM columns: bomColumns() -> the column specs; bomColumns([{ type, prop, title, width, hidden } | 'Material', …])
      // replaces them (a string is a property column); bomType('top' | 'parts'); each one undo step, returns summary().bom
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
      doc: function () { return JSON.parse(JSON.stringify(doc())); }
    };
  }
  UI.makeDrawing = makeDrawing; UI.openDrawing = openDrawing; UI.closeDrawing = closeDrawing; UI.drawingActive = function () { return D.active; };
  UI.drawing = { state: D, render: render, autoBalloon: cmdAutoBalloon, bom: cmdBOM, balloonAt: balloonAt, bomAt: bomAt, fit: fitSheet, standard3View: cmdStandard3View, projectedView: cmdProjectedView, sectionView: cmdSectionView, detailView: cmdDetailView, modelView: cmdModelView, smartDimension: cmdSmartDimension, modelItems: cmdModelItems, sheetProperties: cmdSheetProperties, viewProperties: cmdViewProperties, deleteSelection: deleteSelection, addDimension: addDimension, entityAt: entityAt, exportAs: exportAs, toPaper: toPaper };
  // the File menu gets its drawing entry through UI.menuHook; redraw the menu bar now that the hook exists
  if (UI.renderMenuBar && $('menus').children.length) UI.renderMenuBar();
  if (UI.refreshRibbon && $('ribbon-buttons').children.length) UI.refreshRibbon();
})();
