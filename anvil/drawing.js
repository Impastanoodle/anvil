// drawing.js — 2D drawings of the active part (SolidWorks: File ▸ Make Drawing from Part).
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
          var k0 = Math.round(cuts[i] / tolT), k1 = Math.round(cuts[i + 1] / tolT), pk = k0 + ':' + k1;
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
    var O = orientation(orientName), e = O.e, U = O.u, Vv = O.v;
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
      function seg(t0, t1, list) {
        if ((t1 - t0) * L2 < tol2 * 10) return;
        list.push([a2[0] + (b2[0] - a2[0]) * t0, a2[1] + (b2[1] - a2[1]) * t0, a2[0] + (b2[0] - a2[0]) * t1, a2[1] + (b2[1] - a2[1]) * t1]);
      }
      hidden.forEach(function (iv) { seg(t, iv[0], vis); seg(iv[0], iv[1], hid); t = iv[1]; });
      seg(t, 1, vis);
    });
    var merged = mergeCollinear(vis, hid, diag);
    var vc = extractCircles(merged.visible, diag), hc = extractCircles(merged.hidden, diag);
    var res = {
      orient: orientName, u: U, v: Vv, e: e, bounds: bounds,
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
      var key = Math.round(dx * 1e6) + ',' + Math.round(dy * 1e6) + ',' + Math.round(c / q);
      var g = groups[key];
      if (!g) { g = groups[key] = { d: [dx, dy], p: [s[0], s[1]], vis: [], hid: [] }; order.push(key); }
      var t0 = (s[0] - g.p[0]) * dx + (s[1] - g.p[1]) * dy, t1 = (s[2] - g.p[0]) * dx + (s[3] - g.p[1]) * dy;
      g[cls].push([Math.min(t0, t1), Math.max(t0, t1)]);
    }
    vis.forEach(function (s) { add(s, 'vis'); });
    hid.forEach(function (s) { add(s, 'hid'); });
    var outV = [], outH = [];
    order.forEach(function (key) {
      var g = groups[key];
      var mv = mergeIntervals(g.vis, gap), mh = mergeIntervals(g.hid, gap);
      function emit(iv, list) {
        if (iv[1] - iv[0] < gap * 10) return;
        list.push([g.p[0] + g.d[0] * iv[0], g.p[1] + g.d[1] * iv[0], g.p[0] + g.d[0] * iv[1], g.p[1] + g.d[1] * iv[1]]);
      }
      mv.forEach(function (iv) { emit(iv, outV); });
      mh.forEach(function (iv) {
        var parts = [iv.slice()];
        mv.forEach(function (w) {
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
    var n = (model.drawings || []).length + 1;
    return {
      name: opts.name || 'Draw' + n,
      sheet: { name: 'Sheet1', format: opts.format || (model.units === 'in' ? 'ANSI B' : 'A3'), scale: opts.scale || [1, 1], autoScale: !opts.scale, projection: opts.projection || 'third' },
      views: [], date: opts.date || todayISO(), autoDims: opts.autoDims !== false, suppressed: [], nextView: 1, layout: 'auto'
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
    var c = mesh._drawingProj || (mesh._drawingProj = {}), key = orient + '|' + display;
    return c[key] || (c[key] = projectView(mesh, orient, { display: display }));
  }
  // Title block and border sizes in paper mm (converted by paperK for inch sheets)
  var BORDER = 10, TB_W = 180, TB_H = 40, GAP = 22;
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
    var O = orientation(orient), P = mesh.positions64 || mesh.positions;
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
    var byRole = {};
    doc.views.forEach(function (v) { if (v.role) byRole[v.role] = v; });
    var F = extentsOf(mesh, 'Front'), T = extentsOf(mesh, 'Top'), R = extentsOf(mesh, 'Right');
    var Wm = F.w, Hm = F.h, Dm = T.h;
    var availW = A.x1 - A.x0, availH = A.y1 - A.y0;
    if (doc.sheet.autoScale || !doc.sheet.scale) {
      var s = SCALES[SCALES.length - 1];
      for (var i = 0; i < SCALES.length; i++) {
        var sv = scaleValue(SCALES[i]);
        if ((Wm + Dm) * sv + 3 * g <= availW && (Hm + Dm) * sv + 3 * g <= availH) { s = SCALES[i]; break; }
      }
      doc.sheet.scale = s;
    }
    var sv2 = scaleValue(doc.sheet.scale);
    var W = Wm * sv2, H = Hm * sv2, D = Dm * sv2;
    // centre the Front + Top + Right block in the usable area
    var blockW = W + g + D, blockH = H + g + D;
    var left = A.x0 + Math.max(g, (availW - blockW) / 2), bottom = A.y0 + Math.max(g, (availH - blockH) / 2);
    var fx, fy, tx, ty, rx, ry, isoBox;
    if (doc.sheet.projection === 'first') {
      // first angle: Top below Front, Right to the left of Front
      rx = left + D / 2; fx = left + D + g + W / 2; tx = fx;
      ty = bottom + D / 2; fy = bottom + D + g + H / 2; ry = fy;
      isoBox = { x0: A.x0, x1: left + D + g / 2, y0: A.y0, y1: bottom + D + g / 2 };
    } else {
      fx = left + W / 2; tx = fx; rx = left + W + g + D / 2;
      fy = bottom + H / 2; ry = fy; ty = bottom + H + g + D / 2;
      isoBox = { x0: left + W + g / 2, x1: A.x1, y0: bottom + H + g / 2, y1: A.y1 };
    }
    if (byRole.front) { byRole.front.x = fx; byRole.front.y = fy; }
    if (byRole.top) { byRole.top.x = tx; byRole.top.y = ty; }
    if (byRole.right) { byRole.right.x = rx; byRole.right.y = ry; }
    if (byRole.iso) {
      var I = extentsOf(mesh, byRole.iso.orient), bw = isoBox.x1 - isoBox.x0 - g / 2, bh = isoBox.y1 - isoBox.y0 - g / 2;
      byRole.iso.scale = null;
      if (I.w * sv2 > bw || I.h * sv2 > bh) {
        for (var j = 0; j < SCALES.length; j++) { var q = scaleValue(SCALES[j]); if (q < sv2 && I.w * q <= bw && I.h * q <= bh) { byRole.iso.scale = SCALES[j]; break; } }
        if (!byRole.iso.scale) byRole.iso.scale = SCALES[SCALES.length - 1];
      }
      byRole.iso.x = (isoBox.x0 + isoBox.x1) / 2; byRole.iso.y = (isoBox.y0 + isoBox.y1) / 2;
    }
    void R;
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
    doc.views.forEach(function (c) { if (c.parent === v.id) { c.x += dx; c.y += dy; } });
    doc.layout = 'manual';
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
    var order = doc.views.filter(function (v) { return ORTHO[v.orient]; });
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

  // ------------------------------------------------------------------ sheet primitives
  // compute(doc, mesh, model) -> { size: [W, H], units, prims: [...], views: [{ view, proj, box }], dims }
  // prims: { k: 'line', a, b, layer, style } | { k: 'circle', c, r, layer, style } | { k: 'text', p, h, text, anchor,
  // layer, rot } | { k: 'fill', pts, layer }; styles: 'visible', 'hidden', 'thin', 'thick'. Paper coordinates, y up.
  function compute(doc, mesh, model) {
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
    var c1 = tx0 + tw / 3, c2 = tx0 + 2 * tw / 3;
    line([c1, ty0], [c1, ty0 + 2 * row], 'SHEET', 'thin');
    line([c2, ty0], [c2, ty0 + 2 * row], 'SHEET', 'thin');
    var lab = 2.2 * k, val = 3.5 * k, pad = 1.5 * k;
    function cell(x, yTop, label, value, big) {
      text([x + pad, yTop - pad - lab], lab, label, 'start', 'SHEET');
      text([x + pad, yTop - pad - lab - (big ? 6.5 : 4.5) * k], big ? 5 * k : val, value, 'start', 'SHEET');
    }
    var scale = doc.sheet.scale || [1, 1];
    var sc = scaleText(scale);
    cell(tx0, ty0 + th, 'TITLE', String(model.name || 'Part').toUpperCase(), true);
    cell(tx0, ty0 + 2 * row, 'DWG. NO.', doc.name);
    cell(c1, ty0 + 2 * row, 'SCALE', sc);
    cell(c2, ty0 + 2 * row, 'UNITS', units.toUpperCase());
    cell(tx0, ty0 + row, 'DATE', doc.date);
    cell(c1, ty0 + row, 'PROJECTION', doc.sheet.projection === 'first' ? 'FIRST ANGLE' : 'THIRD ANGLE');
    cell(c2, ty0 + row, 'SHEET', '1 OF 1');
    function rect(a, b, layer, style) { line([a[0], a[1]], [b[0], a[1]], layer, style); line([b[0], a[1]], [b[0], b[1]], layer, style); line([b[0], b[1]], [a[0], b[1]], layer, style); line([a[0], b[1]], [a[0], a[1]], layer, style); }

    // views
    var projections = {}, views = [];
    var layers = {};
    doc.views.forEach(function (v) {
      var pr = cachedProjection(mesh, v.orient, v.display);
      projections[v.id] = pr;
      var s = viewScale(doc, v), bd = pr.bounds, cu = (bd.umin + bd.umax) / 2, cv = (bd.vmin + bd.vmax) / 2;
      var toSheet = function (p) { return [v.x + (p[0] - cu) * s, v.y + (p[1] - cv) * s]; };
      var layer = layerName(v, layers);
      pr.lines.visible.forEach(function (l) { line(toSheet([l[0], l[1]]), toSheet([l[2], l[3]]), layer, 'visible'); });
      pr.circles.visible.forEach(function (c) { prims.push({ k: 'circle', c: toSheet(c.c), r: c.r * s, layer: layer, style: 'visible' }); });
      pr.lines.hidden.forEach(function (l) { line(toSheet([l[0], l[1]]), toSheet([l[2], l[3]]), layer, 'hidden'); });
      pr.circles.hidden.forEach(function (c) { prims.push({ k: 'circle', c: toSheet(c.c), r: c.r * s, layer: layer, style: 'hidden' }); });
      var box = { x0: v.x - (bd.umax - bd.umin) * s / 2, x1: v.x + (bd.umax - bd.umin) * s / 2, y0: v.y - (bd.vmax - bd.vmin) * s / 2, y1: v.y + (bd.vmax - bd.vmin) * s / 2 };
      if (v.scale && scaleValue(v.scale) !== scaleValue(scale)) text([v.x, box.y0 - 6 * k], 3 * k, v.orient.toUpperCase() + '  SCALE ' + scaleText(v.scale), 'middle', layer);
      views.push({ view: v, proj: pr, box: box, layer: layer, toSheet: toSheet, scale: s });
    });
    // dimensions
    var suppressed = doc.suppressed || [];
    var dims = doc.autoDims ? autoDims(doc, projections, units).filter(function (d) { d.key = autoDimKey(d); return suppressed.indexOf(d.key) < 0; }) : [];
    doc.views.forEach(function (v) { (v.dims || []).forEach(function (d, i) { var c = JSON.parse(JSON.stringify(d)); c.view = v.id; c.index = i; c.text = dimText(c, units); dims.push(c); }); });
    var placed = [], shown = [];
    dims.forEach(function (d) {
      var vw = views.filter(function (w) { return w.view.id === d.view; })[0];
      if (!vw) return;
      var p = dimPrims(d, vw, k, placed);
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
    return { size: S, units: units, prims: prims, views: views, dims: dims, projections: projections, scale: scale };
  }
  function layerName(v, used) {
    var base = String(v.orient).toUpperCase(), name = base, n = 2;
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
  var STROKE = { visible: 0.5, hidden: 0.35, thin: 0.25, thick: 0.7 };
  function toSVG(sheet, opts) {
    opts = opts || {};
    var S = sheet.size, k = sheet.units === 'in' ? 1 / MM : 1, H = S[1];
    function X(p) { return num(p[0]); } function Y(p) { return num(H - p[1]); }
    var dash = num(3 * k) + ' ' + num(1.5 * k);
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + num(S[0]) + sheet.units + '" height="' + num(S[1]) + sheet.units + '" viewBox="0 0 ' + num(S[0]) + ' ' + num(S[1]) + '" font-family="Arial, Helvetica, sans-serif">'];
    out.push('<rect class="sheet-bg" x="0" y="0" width="' + num(S[0]) + '" height="' + num(S[1]) + '" fill="#fff"/>');
    var groups = {}, gorder = [];
    sheet.prims.forEach(function (p) { if (!groups[p.layer]) { groups[p.layer] = []; gorder.push(p.layer); } groups[p.layer].push(p); });
    gorder.forEach(function (layer) {
      var vw = sheet.views.filter(function (w) { return w.layer === layer; })[0];
      out.push('<g data-layer="' + esc(layer) + '"' + (vw ? ' data-view="' + vw.view.id + '" class="dv"' : '') + ' fill="none" stroke="#000" stroke-linecap="round">');
      groups[layer].forEach(function (p) {
        var sw = num((STROKE[p.style] || 0.25) * k), cls = p.style ? ' class="' + p.style + '"' : '';
        var dsh = p.style === 'hidden' ? ' stroke-dasharray="' + dash + '"' : '';
        if (p.k === 'line') out.push('<line' + cls + ' x1="' + X(p.a) + '" y1="' + Y(p.a) + '" x2="' + X(p.b) + '" y2="' + Y(p.b) + '" stroke-width="' + sw + '"' + dsh + '/>');
        else if (p.k === 'circle') out.push('<circle' + cls + ' cx="' + X(p.c) + '" cy="' + Y(p.c) + '" r="' + num(p.r) + '" stroke-width="' + sw + '"' + dsh + '/>');
        else if (p.k === 'fill') out.push('<path d="M' + p.pts.map(function (q) { return X(q) + ' ' + Y(q); }).join(' L') + ' Z" fill="#000" stroke="none"/>');
        else if (p.k === 'text') {
          var tr = p.rot ? ' transform="rotate(' + num(-p.rot) + ' ' + X(p.p) + ' ' + Y(p.p) + ')"' : '';
          out.push('<text x="' + X(p.p) + '" y="' + Y(p.p) + '" font-size="' + num(p.h) + '" text-anchor="' + p.anchor + '" fill="#000" stroke="none"' + tr + '>' + esc(p.text) + '</text>');
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
    var colors = { SHEET: 7, DIMENSIONS: 3 }, next = 1;
    pr(0, 'SECTION'); pr(2, 'HEADER');
    pr(9, '$ACADVER'); pr(1, 'AC1009');
    pr(9, '$INSUNITS'); pr(70, sheet.units === 'in' ? 1 : 4);
    pr(9, '$MEASUREMENT'); pr(70, sheet.units === 'in' ? 0 : 1);
    pr(9, '$EXTMIN'); pr(10, 0); pr(20, 0); pr(30, 0);
    pr(9, '$EXTMAX'); pr(10, num(sheet.size[0])); pr(20, num(sheet.size[1])); pr(30, 0);
    pr(9, '$LTSCALE'); pr(40, sheet.units === 'in' ? 0.04 : 1);
    pr(0, 'ENDSEC');
    pr(0, 'SECTION'); pr(2, 'TABLES');
    pr(0, 'TABLE'); pr(2, 'LTYPE'); pr(70, 2);
    pr(0, 'LTYPE'); pr(2, 'CONTINUOUS'); pr(70, 0); pr(3, 'Solid line'); pr(72, 65); pr(73, 0); pr(40, 0);
    pr(0, 'LTYPE'); pr(2, 'HIDDEN'); pr(70, 0); pr(3, '__ __ __ __'); pr(72, 65); pr(73, 2); pr(40, 4.5); pr(49, 3); pr(49, -1.5);
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
      var lt = p.style === 'hidden' ? function () { pr(6, 'HIDDEN'); } : function () { };
      if (p.k === 'line') { pr(0, 'LINE'); pr(8, p.layer); lt(); pr(10, num(p.a[0])); pr(20, num(p.a[1])); pr(30, 0); pr(11, num(p.b[0])); pr(21, num(p.b[1])); pr(31, 0); }
      else if (p.k === 'circle') { pr(0, 'CIRCLE'); pr(8, p.layer); lt(); pr(10, num(p.c[0])); pr(20, num(p.c[1])); pr(30, 0); pr(40, num(p.r)); }
      else if (p.k === 'fill') {
        pr(0, 'SOLID'); pr(8, p.layer);
        var q = [p.pts[0], p.pts[1], p.pts[2], p.pts[2]];
        q.forEach(function (pt, i) { pr(10 + i, num(pt[0])); pr(20 + i, num(pt[1])); pr(30 + i, 0); });
      } else if (p.k === 'text') {
        pr(0, 'TEXT'); pr(8, p.layer); pr(10, num(p.p[0])); pr(20, num(p.p[1])); pr(30, 0); pr(40, num(p.h)); pr(1, String(p.text).replace(/\u00d8/g, '%%c'));
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
    var cur = null;
    function style(s) {
      if (s === cur) return; cur = s;
      c.push(num((STROKE[s] || 0.25) * k * ptPer) + ' w ' + (s === 'hidden' ? '[' + num(dash[0]) + ' ' + num(dash[1]) + '] 0 d' : '[] 0 d'));
    }
    function pdfText(s) {
      var out = '';
      for (var i = 0; i < s.length; i++) {
        var ch = s.charCodeAt(i);
        if (ch === 0xd8) out += '\\330';
        else if (ch === 40 || ch === 41 || ch === 92) out += '\\' + s[i];
        else if (ch >= 32 && ch < 127) out += s[i];
        else out += '?';
      }
      return out;
    }
    sheet.prims.forEach(function (p) {
      if (p.k === 'line') { style(p.style); c.push(P(p.a[0]) + ' ' + P(p.a[1]) + ' m ' + P(p.b[0]) + ' ' + P(p.b[1]) + ' l S'); }
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
    autoDims: autoDims, dimText: dimText, fmtDim: fmtDim, compute: compute, toSVG: toSVG, toDXF: toDXF, toPDF: toPDF
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
  // drawings belong to part documents; an assembly model never has one open
  function doc() { var l = App.model && App.model.type !== 'assembly' && App.model.drawings; return l && l[D.index] || null; }
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
    tabs.appendChild(el('button', { class: 'dw-tab', html: Icons('part', 14) + '<span>' + (App.model.name || 'Part') + '</span>', title: 'Switch to the part document (Window menu)', onclick: function () { closeDrawing(); } }));
  }

  // ------------------------------------------------------------------ open / close
  // makeDrawing(opts): File ▸ Make Drawing from Part. Reuses the part's first drawing or creates one with Standard 3
  // View + Isometric (one undo step), then shows the drawing document.
  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  var ASM_REFUSAL = 'Make Drawing from Part works on parts only; drawings of assemblies are not supported yet. Open a part (File \u25b8 New \u25b8 Part or the Design Library) to make its drawing.';
  function makeDrawing(opts) {
    opts = opts || {};
    if (isAsm()) { UI.toast('Drawings of assemblies are not supported yet.'); UI.setStatus(ASM_REFUSAL); return null; }
    if (!App.mesh || !App.mesh.triCount) { UI.toast('The part has no solid body to draw yet.'); return null; }
    if (App.mode === 'sketch' && UI.exitSketch) UI.exitSketch();
    if (UI.hasPM && UI.hasPM()) UI.pmCancel();
    var list = App.model.drawings || [];
    if (!list.length || opts.fresh) {
      UI.pushUndo();
      App.model.drawings = list = list.concat([]);
      var dc = Drawing.newDrawing(App.model, opts);
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
    UI.setStatus('Drawing ' + doc().name + ': drag a view to move it, Smart Dimension (D) to dimension an edge or circle, wheel to zoom.');
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
    UI.setStatus('Part ' + App.model.name);
  }

  // ------------------------------------------------------------------ render
  function render() {
    if (!D.active) return;
    var dc = doc();
    if (!dc) { closeDrawing(); return; }
    if (dc.layout === 'auto') Drawing.layout(dc, mesh(), units());
    D.sheet = Drawing.compute(dc, mesh(), App.model);
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
    if (D.hover && D.hover.kind === 'entity') {
      var h = D.hover;
      if (h.circle) svgNode('circle', { class: 'dw-hot', cx: h.circle.c[0], cy: H - h.circle.c[1], r: h.circle.r, 'stroke-width': pxToPaper(3) }, g);
      else svgNode('line', { class: 'dw-hot', x1: h.a[0], y1: H - h.a[1], x2: h.b[0], y2: H - h.b[1], 'stroke-width': pxToPaper(3) }, g);
    }
    if (D.tool === 'place' && D.pending && D.pending.at) {
      var P = D.pending, gw = P.w, gh = P.h;
      svgNode('rect', { class: 'dw-ghost', x: P.at[0] - gw / 2, y: H - P.at[1] - gh / 2, width: gw, height: gh, 'stroke-width': sw, 'stroke-dasharray': pxToPaper(5) + ' ' + pxToPaper(3) }, g);
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
      if (ORTHO_NAMES.indexOf(w.view.orient) < 0) return;   // lengths in a pictorial view are foreshortened
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
    if (D.tool === 'dim') {
      var ent = entityAt(p);
      if (ent) addDimension(ent); else UI.setStatus('Smart Dimension: click a visible edge or circle of an orthographic view.');
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
      if (D.tool === 'place' && D.pending) { D.pending.at = q; drawOverlay(); return; }
      if (D.tool === 'dim') h = entityAt(q);
      else { var dm = dimAt(q); if (dm) h = { kind: 'dim', view: dm.view, key: dm.key || null, index: dm.index }; else { var w = viewAt(q); if (w) h = { kind: 'view', id: w.view.id }; } }
      if (JSON.stringify(h) !== JSON.stringify(D.hover)) { D.hover = h; drawOverlay(); }
    }
  }
  function onUp() {
    if (!D.drag) return;
    var dg = D.drag;
    D.drag = null;
    if (dg.kind === 'view' && dg.moved) { UI.autosave(); render(); }
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
    var w = viewAt(toPaper(e));
    if (w) cmdViewProperties(w.view.id); else cmdSheetProperties();
  }
  function onContext(e) {
    e.preventDefault();
    if (!D.active) return;
    var p = toPaper(e), w = viewAt(p);
    if (w) { D.sel = { kind: 'view', id: w.view.id }; drawOverlay(); renderTree(); UI.showMenu(e.clientX, e.clientY, viewMenu(w.view)); }
    else UI.showMenu(e.clientX, e.clientY, sheetMenu());
  }

  // ------------------------------------------------------------------ commands
  function cmdStandard3View() {
    if (!App.mesh || !App.mesh.triCount) { UI.toast('The part has no solid body to draw yet.'); return; }
    edit(function (dc) { Drawing.standard3View(dc, mesh(), units()); });
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
    if (!App.mesh || !App.mesh.triCount) { UI.toast('The part has no solid body to draw yet.'); return; }
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
  function cmdViewProperties(id) {
    var v = Drawing.findView(doc(), id);
    if (!v) return;
    openDrawingPM({
      title: v.name, icon: 'drawingView', command: 'viewProps',
      values: { orient: v.orient, display: v.display, scale: v.scale ? Drawing.scaleText(v.scale) : 'sheet' },
      groups: [
        { title: 'Orientation', fields: [{ type: 'select', key: 'orient', label: 'View', options: Drawing.ORIENTS }] },
        { title: 'Display Style', fields: [{ type: 'select', key: 'display', label: 'Style', options: [['hlv', 'Hidden Lines Visible'], ['hlr', 'Hidden Lines Removed']] }] },
        { title: 'Scale', fields: [{ type: 'select', key: 'scale', label: 'Scale', options: scaleOptions() }] }
      ],
      onOK: function (val) {
        edit(function (dc) {
          var w = Drawing.findView(dc, id);
          if (!w) return;
          if (w.orient !== val.orient) { w.orient = val.orient; w.role = null; w.parent = null; w.align = null; w.dims = []; }
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
    edit(function (dc) {
      dc.views = dc.views.filter(function (v) { return v.id !== id; });
      dc.views.forEach(function (v) { if (v.parent === id) { v.parent = null; v.align = null; } });
    });
    D.sel = null; render();
  }
  function deleteSelection() {
    var s = D.sel;
    if (!s) return false;
    if (s.kind === 'view') { deleteView(s.id); return true; }
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
      // re-place the standard views for the new sheet / scale / projection
      if (dc.views.some(function (v) { return v.role; })) { var manual = dc.layout === 'manual'; Drawing.layout(dc, mesh(), units()); if (manual) dc.layout = 'manual'; }
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
    UI.showModal({ title: 'Sheet Properties', body: body, buttons: [
      { label: 'Apply Changes', primary: true, action: function () { UI.closeModal(); setSheet({ name: nm.value, format: fmt.value, scale: sc.value, projection: proj.value }); } },
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
    dc.views.forEach(function (v) {
      var sel = D.sel && D.sel.kind === 'view' && D.sel.id === v.id;
      var w = D.sheet && D.sheet.views.filter(function (x) { return x.view.id === v.id; })[0];
      var st = w ? w.proj.stats : null;
      t.appendChild(row({ icon: 'drawingView', name: v.name, depth: 2, twisty: true, cls: 'dw-view', data: { view: String(v.id) }, sel: sel, badge: v.orient,
        title: v.name + ' \u2014 ' + v.orient + (v.scale ? ', scale ' + Drawing.scaleText(v.scale) : '') + (st ? ' \u2014 ' + st.visibleLines + ' visible / ' + st.hiddenLines + ' hidden lines, ' + st.visibleCircles + ' circles' : '') + '. Double-click for properties.',
        click: function () { D.sel = { kind: 'view', id: v.id }; drawOverlay(); renderTree(); },
        dbl: function () { cmdViewProperties(v.id); }, menu: function () { return viewMenu(v); } }));
      t.appendChild(row({ icon: 'part', name: App.model.name, depth: 3, cls: 'dw-ref' }));
    });
  }

  // ------------------------------------------------------------------ ribbon, menus, keys
  UI.RIBBON.Drawing = [
    { id: 'std3view', label: 'Standard\n3 View', run: cmdStandard3View },
    { id: 'modelView', label: 'Model\nView', run: cmdModelView, active: function () { return D.tool === 'place'; } },
    { id: 'projView', label: 'Projected\nView' },
    { sep: true },
    { id: 'dim', label: 'Smart\nDimension', run: cmdSmartDimension, active: function () { return D.tool === 'dim'; } },
    { id: 'modelItems', label: 'Model\nItems', run: cmdModelItems, active: function () { return !!(doc() && doc().autoDims); } },
    { sep: true },
    { id: 'sheetProps', label: 'Sheet\nProperties', run: cmdSheetProperties },
    { sep: true },
    { id: 'svgExport', label: 'Save as\nSVG', run: function () { exportAs('svg'); } },
    { id: 'dxfExport', label: 'Save as\nDXF', run: function () { exportAs('dxf'); } },
    { id: 'pdfExport', label: 'Save as\nPDF', run: function () { exportAs('pdf'); } },
    { sep: true },
    { id: 'closeDoc', label: 'Close\nDrawing', run: function () { closeDrawing(); } }
  ];
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
        // an assembly cannot be drawn yet: the item stays visible but disabled (SolidWorks shows Make Drawing from Assembly)
        file.items.splice(at, 0, { sep: true }, { label: 'Make Drawing from Part', disabled: asm, action: function () { makeDrawing(); } });
      }
      // Window: the open document (part or assembly), then the part's drawings
      var win = menus.filter(function (m) { return m.label === 'Window'; })[0];
      if (win) {
        win.items.push({ sep: true });
        win.items.push({ label: (App.model.name || (asm ? 'Assem1' : 'Part1')) + (asm ? ' (assembly)' : ' (part)'), checked: true, action: function () { } });
        if (!asm) (App.model.drawings || []).forEach(function (dc, i) { win.items.push({ label: dc.name + ' - ' + dc.sheet.name, action: function () { makeDrawing({ index: i }); } }); });
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
        { label: 'Annotations \u25b8 Smart Dimension', key: 'D', action: cmdSmartDimension },
        { label: 'Annotations \u25b8 Model Items', checked: !!(dc && dc.autoDims), action: cmdModelItems }
      ] },
      { label: 'Tools', items: [{ label: 'Sheet Properties\u2026', action: cmdSheetProperties }] },
      { label: 'Window', items: [
        { label: App.model.name + ' (part)', action: closeDrawing },
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
    if (!D.sheet || !D.active) { if (dc.layout === 'auto') Drawing.layout(dc, mesh(), units()); D.sheet = Drawing.compute(dc, mesh(), App.model); }
    return {
      name: dc.name, open: D.active, sheet: { name: dc.sheet.name, format: dc.sheet.format, size: D.sheet.size, scale: Drawing.scaleText(dc.sheet.scale), autoScale: !!dc.sheet.autoScale, projection: dc.sheet.projection },
      views: D.sheet.views.map(function (w) {
        var b = w.proj.bounds;
        return { id: w.view.id, name: w.view.name, orient: w.view.orient, role: w.view.role, display: w.view.display, x: +w.view.x.toFixed(3), y: +w.view.y.toFixed(3), scale: w.view.scale ? Drawing.scaleText(w.view.scale) : null,
          extents: [+(b.umax - b.umin).toFixed(4), +(b.vmax - b.vmin).toFixed(4)], box: [w.box.x0, w.box.y0, w.box.x1, w.box.y1].map(function (x) { return +x.toFixed(3); }), stats: w.proj.stats, dims: (w.view.dims || []).length };
      }),
      dims: D.sheet.dims.map(function (d) { return d.text; }), autoDims: !!dc.autoDims
    };
  }
  function current() { if (!doc()) return null; if (!D.active) { if (doc().layout === 'auto') Drawing.layout(doc(), mesh(), units()); D.sheet = Drawing.compute(doc(), mesh(), App.model); } return D.sheet; }
  if (window.anvil) {
    window.anvil.drawing = {
      make: function (opts) { return makeDrawing(opts) ? summary() : null; },
      open: function (i) { return makeDrawing({ index: i || 0 }) ? summary() : null; },
      close: function () { closeDrawing(); },
      isOpen: function () { return D.active; },
      summary: summary,
      standard3View: function () { cmdStandard3View(); return summary(); },
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
  UI.drawing = { state: D, render: render, fit: fitSheet, standard3View: cmdStandard3View, modelView: cmdModelView, smartDimension: cmdSmartDimension, modelItems: cmdModelItems, sheetProperties: cmdSheetProperties, viewProperties: cmdViewProperties, deleteSelection: deleteSelection, addDimension: addDimension, entityAt: entityAt, exportAs: exportAs, toPaper: toPaper };
  // the File menu gets its drawing entry through UI.menuHook; redraw the menu bar now that the hook exists
  if (UI.renderMenuBar && $('menus').children.length) UI.renderMenuBar();
  if (UI.refreshRibbon && $('ribbon-buttons').children.length) UI.refreshRibbon();
})();
