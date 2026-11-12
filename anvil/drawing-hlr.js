// drawing-hlr.js — hidden-line removal for the drawing engine (Drawing, see drawing.js): projectView projects a mesh
// in a view frame and clips every candidate edge (sharp edges, silhouettes, tangent edges) against the front-facing
// triangles, draws the true curves of drawing-curves.js as exact circles, arcs and ellipses with their hidden parts,
// the exact silhouettes of cylinders, cones, spheres and tori, and tidies the linework (collinear pieces merged, hidden
// pieces under visible ones dropped, ends closed onto their occluders); chainLines, extractCircles and fitArcs turn
// chords into chains, circles and arcs. Loads after drawing.js and drawing-curves.js.
(function (D, _) {
  'use strict';
  var K = Kernel, V = K.vec;
  var frameOf = D.frameOf, meshEdges = D.meshEdges, joinCollinear = D.joinCollinear, meshCurves = D.meshCurves;
  var TWO_PI = _.TWO_PI, COS_CREASE = _.COS_CREASE, meshDiag = _.meshDiag, closeEnds = _.closeEnds, closeFreeEnds = _.closeFreeEnds, closeSmallGaps = _.closeSmallGaps;
  var curveAngle = _.curveAngle, unwrapNear = _.unwrapNear, modMerge = _.modMerge, subtractIntervals = _.subtractIntervals, joinRuns = _.joinRuns, isFull = _.isFull, closeFull = _.closeFull;
  var exactSilhouette = _.exactSilhouette, circle3 = _.circle3, surfDist = _.surfDist, intersectionChain = _.intersectionChain, curveBounds = _.curveBounds;

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
  // opts._noCrease (tests only, r9/drawings9): smooth edges are never turned into creases or seams, to compare.
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
    // (lane flatperf: G·G cells shared out by the view's aspect, GU across and GV up: a sheet seen edge-on is 400 times
    // wider than tall, and square cells there held every hole wall of a column)
    var G = Math.max(4, Math.min(160, Math.round(Math.sqrt(tris.length) * 1.5)));
    var bu = bounds.umax - bounds.umin + 2 * tol2, bv = bounds.vmax - bounds.vmin + 2 * tol2, asp = bu > 0 && bv > 0 ? Math.sqrt(bu / bv) : 1;
    var GU = Math.max(1, Math.min(2048, Math.round(G * asp))), GV = Math.max(1, Math.min(2048, Math.round(G * G / GU)));
    var gu0 = bounds.umin - tol2, gv0 = bounds.vmin - tol2;
    var cw = Math.max(bu / GU, 1e-12), ch = Math.max(bv / GV, 1e-12);
    var grid = new Array(GU * GV);
    function cellU(x) { return Math.max(0, Math.min(GU - 1, Math.floor((x - gu0) / cw))); }
    function cellV(y) { return Math.max(0, Math.min(GV - 1, Math.floor((y - gv0) / ch))); }
    // lane flatperf: the occluders are filed largest first (by powers of two of their area), so a segment that one of
    // them hides whole (a perforated panel's hole walls behind its edge face in a side view) stops at it
    // (hiddenIntervals' early exit; the merged intervals do not depend on the order the occluders come in)
    var lv = tris.map(function (t, ti) { var a = (t.umax - t.umin) * (t.vmax - t.vmin); return a > 0 ? Math.floor(Math.log2(a)) : -2000; });
    var byLv = tris.map(function (t, ti) { return ti; }).sort(function (a, b) { return lv[b] - lv[a] || a - b; });
    byLv.forEach(function (ti) {
      var t = tris[ti], u0 = cellU(t.umin - epsIn), u1 = cellU(t.umax + epsIn), v0 = cellV(t.vmin - epsIn), v1 = cellV(t.vmax + epsIn);
      for (var cx = u0; cx <= u1; cx++) for (var cy = v0; cy <= v1; cy++) {
        var c = cy * GU + cx; (grid[c] || (grid[c] = [])).push(ti);
      }
    });
    var stamp = new Int32Array(tris.length), stampId = 0;
    // candidates(a2, b2, visit): visit(ti) for every occluder near the segment, once each, until it returns true
    function candidates(a2, b2, visit) {
      stampId++;
      var stop = false;
      function addCell(cx, cy) {
        if (stop || cx < 0 || cy < 0 || cx >= GU || cy >= GV) return;
        var lst = grid[cy * GU + cx];
        if (!lst) return;
        for (var i = 0; i < lst.length; i++) { var ti = lst[i]; if (stamp[ti] !== stampId) { stamp[ti] = stampId; if (visit(ti)) { stop = true; return; } } }
      }
      var x0 = cellU(Math.min(a2[0], b2[0]) - epsIn), x1 = cellU(Math.max(a2[0], b2[0]) + epsIn);
      var y0 = cellV(Math.min(a2[1], b2[1]) - epsIn), y1 = cellV(Math.max(a2[1], b2[1]) + epsIn);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) <= 2 * (GU + GV)) {
        for (var cx = x0; cx <= x1 && !stop; cx++) for (var cy = y0; cy <= y1 && !stop; cy++) addCell(cx, cy);
      } else {
        // a long diagonal: walk it at a quarter-cell step and take each cell's 3×3 neighbourhood
        var L = Math.hypot((b2[0] - a2[0]) / cw, (b2[1] - a2[1]) / ch), n = Math.ceil(L * 4) + 1, seen = {};
        for (var s = 0; s <= n && !stop; s++) {
          var x = a2[0] + (b2[0] - a2[0]) * s / n, y = a2[1] + (b2[1] - a2[1]) * s / n, gx = cellU(x), gy = cellV(y), kk = gx + ',' + gy;
          if (seen[kk]) continue; seen[kk] = 1;
          for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) addCell(gx + dx, gy + dy);
        }
      }
    }
    // hidden intervals of one 3D segment (ez: a larger depth tolerance, for exact curves that lie off the facets;
    // skip: a surface key whose own facets cannot hide the segment, the exact silhouette of a cylinder or cone: its
    // chordal facets lie inside the surface, and a sliver facet ending on the silhouette must not cut it short near
    // its end, r5/drawings5)
    // (only: { body, same } keeps just the occluders of that body (same) or of the other bodies (!same), r10/drawings10)
    // (lane FX) skip may also be { faces: [mesh face indices] }: an intersection chain on Anvil's solid lies on the true
    // surfaces, up to a sagitta behind its own two faces' facets (a sheet-metal mitre seam on two concave bend
    // surfaces): those faces cannot hide their own edge
    function hiddenIntervals(A, B, a2, b2, ez, skip, only) {
      var wa = V.dot(A, e), wb = V.dot(B, e), wmin = Math.min(wa, wb), AB = V.sub(B, A), eZ = ez > epsZ ? ez : epsZ;
      var ivs = [], whole = null;
      candidates(a2, b2, function (ti) {
        var t = tris[ti];
        if (t.wmax <= wmin + eZ) return false;               // the triangle is nowhere in front of the segment
        if (skip != null && (skip.faces ? skip.faces.indexOf(t.f) >= 0 : CV.faceSurf[t.f] && CV.faceSurf[t.f].key === skip)) return false;
        if (only && ((mesh.faces[t.f].body || 0) === only.body) !== only.same) return false;
        var lo = 0, hi = 1;
        // in front: s(t) = (c - n·X(t)) / (n·e) > epsZ
        var s0 = (t.c - V.dot(t.n, A)) / t.ne, s1 = (t.c - V.dot(t.n, B)) / t.ne;
        var r = clipLinear(s0 - eZ, s1 - eZ, lo, hi, true); if (!r) return false; lo = r[0]; hi = r[1];
        for (var j = 0; j < 3 && r; j++) {
          var h = t.hs[j], h0 = h[0] * a2[0] + h[1] * a2[1] + h[2] + epsIn, h1 = h[0] * b2[0] + h[1] * b2[1] + h[2] + epsIn;
          r = clipLinear(h0, h1, lo, hi, false); if (r) { lo = r[0]; hi = r[1]; }
        }
        if (r && hi - lo > 1e-12) {
          if (lo <= 0 && hi >= 1) { whole = [[lo, hi]]; return true; }   // hidden whole: no other piece can change that
          ivs.push([lo, hi]);
        }
        return false;
      });
      if (whole) return whole;
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

    // xsil (rfFI): visible pieces of exact silhouettes of curved faces, { l: [u0, v0, u1, v1], dev } with dev how far
    // the face's facet outline (what hides other linework) may lie from it in this view, for rimsToSilhouettes
    var vis = [], hid = [], tan = [], fsil = [], xsil = [], tanOn =opts.tangent === 'visible' || opts.tangent === 'font';
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
      if (!opts._noCrease && ed.smooth && !sameSurf && !ed.exactDone && ed.faces.length === 2 && (seam && ei != null && seam[ei] || creased(ed))) ed = { a: ed.a, b: ed.b, faces: ed.faces, normals: ed.normals, smooth: false };
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
              for (var ci = 0; ci + 1 < chn.pts.length; ci++) edgePiece({ a: chn.pts[ci], b: chn.pts[ci + 1], faces: ed.faces, normals: ed.normals, exactDone: true, eps: brepMesh ? ceps : 2 * Math.max(offC(chn.pts[ci]), offC(chn.pts[ci + 1])) + diag * 1e-6, isect: true, skip: brepMesh ? null : { faces: ed.faces } }, null);
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
      // Seen obliquely, only other bodies' facets get the same test (r10/drawings10): a bore's rim on a shaft of the
      // same radius in an assembly, the shaft's facets turned against the bore's (OpenCascade's Gear train, Gear B
      // turned 45° on its shaft), hid every other half-chord of the rim's visible half in the isometric (18 dashes);
      // the body's own facets keep hiding the chord as before.
      var ngf = g >= 0 ? Math.abs(V.dot(GR[g].n, e)) : 0, obl = g >= 0 && ngf > 1e-9 && ngf <= 1 - 1e-9, own = null;
      if (obl && !hiddenIntervals(A, B, a2, b2, ed.eps, ed.skip).length) { obl = false; hidden = []; }   // in plain view
      if (obl) {
        own = hiddenIntervals(A, B, a2, b2, ed.eps, ed.skip, { body: body, same: true });
        hidden = hiddenIntervals(A, B, a2, b2, ed.eps, ed.skip, { body: body, same: false });
      }
      if (g >= 0 && ngf > 1e-9) {
        // a true circle seen face-on: the chord lies up to a sagitta inside the curve, where the facets of a surface
        // that ends on the circle from inside (a handle's bend round its tube seen end-on) cover it and the outline
        // came out in dashes. The true arc is tested too, as short chords between points on the circle (depth
        // tolerance: the chord's distance from its faces' true surfaces, their facets being chords too); a part is
        // hidden only where both are (the true arc alone sinks into a surface ending on the circle from outside, a
        // torus's inner equator, whose facets' inner edges are chords inside the circle) (r5/drawings5)
        var Gf = GR[g], fa = curveAngle(Gf, A), fb = unwrapNear(curveAngle(Gf, B), fa);
        if (!hidden) hidden = hiddenIntervals(A, B, a2, b2, ed.eps, ed.skip);
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
            hiddenIntervals(P0, P1, [V.dot(P0, U), V.dot(P0, Vv)], [V.dot(P1, U), V.dot(P1, Vv)], ezf, ed.skip, obl ? { body: body, same: false } : null).forEach(function (q) {
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
        if (obl) hidden = mergeIntervals(own.concat(hidden), 1e-9);
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
      // (an exact silhouette's facet deviation in this view: the facet edge's distance from the exact line)
      var xdev = -1;
      if (ed.exactA && ed.smooth) {
        xdev = 0;
        [ed.a, ed.b, V.scale(V.add(ed.a, ed.b), 0.5)].forEach(function (X) { var x2 = [V.dot(X, U) - a2[0], V.dot(X, Vv) - a2[1]]; xdev = Math.max(xdev, Math.abs(x2[0] * (b2[1] - a2[1]) - x2[1] * (b2[0] - a2[0])) / L2); });
      }
      function seg(t0, t1, list) {
        if ((t1 - t0) * L2 < tol2 * 10) return;
        list.push([a2[0] + (b2[0] - a2[0]) * t0, a2[1] + (b2[1] - a2[1]) * t0, a2[0] + (b2[0] - a2[0]) * t1, a2[1] + (b2[1] - a2[1]) * t1, body]);
        if (list === vis && xdev >= 0) xsil.push({ l: list[list.length - 1], dev: xdev });
      }
      hidden.forEach(function (iv) { seg(t, iv[0], vis); seg(iv[0], iv[1], hid); t = iv[1]; });
      seg(t, 1, vis);
      // silhouettes of facets with no surface record, for dropStubs (r9/drawings9)
      if (ed.smooth && !sameSurf && !ed.exactDone && ed.faces.length === 2 && !(CV && (CV.faceSurf[ed.faces[0]] || CV.faceSurf[ed.faces[1]]))) fsil.push([a2[0], a2[1], b2[0], b2[1]]);
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
    // seamRuns() (r9/drawings9): an edge between two surfaces is drawn whole when any of it is a crease, as SolidWorks
    // draws a B-rep edge: a mitre seam of a swept tube or a sheet-metal bend runs into points where the two surfaces
    // turn tangent, and its pieces there (under 2° on OpenCascade's true normals, under 23° between Anvil's facets)
    // were dropped: the Handlebar's mitre ellipses stopped 0.2-1.9 mm short, the Tray's bend mitres 0.55 mm short of
    // the base. -> seam[i] (meshEdges index) set for smooth pieces drawn as edges.
    // B-rep meshes (faces carry OpenCascade face ids): every smooth piece between the same two B-rep faces connected
    // to a creased / sharp piece between them. Other meshes: from a sharp piece that is a shallow crease (under 40°
    // between its facets) and ends where no other sharp piece does, along the smooth pieces between two faces of no
    // common surface that run on in its direction (turning under 30° per piece), at most 16 pieces / 8% of the size.
    var seam = null;
    function seamRuns() {
      var E = meshEdges(mesh), n = E.length, st = new Int8Array(n), at = {}, out = new Uint8Array(n), any = false;
      function bf(fi) { var f = mesh.faces[fi], p = f.polys && f.polys[0]; return (f.body || 0) + ':' + (p && p.face != null ? p.face : 'x' + fi); }
      for (var i = 0; i < n; i++) {
        var ed = E[i];
        if (!ed.smooth) st[i] = 1;
        else if (ed.faces.length === 2) {
          var fs0 = CV && CV.faceSurf[ed.faces[0]], fs1 = CV && CV.faceSurf[ed.faces[1]];
          if (fs0 && fs1 && fs0.key === fs1.key) continue;
          if (brepMesh && bf(ed.faces[0]) === bf(ed.faces[1])) continue;
          st[i] = creased(ed) ? 1 : 2;
          if (st[i] === 2) any = true;
        }
        if (st[i]) [ed.a, ed.b].forEach(function (p) { var k = vKey(p); (at[k] || (at[k] = [])).push(i); });
      }
      if (!any) return null;
      if (brepMesh) {
        // connected runs per B-rep face pair
        var pk = [], seen = new Uint8Array(n);
        for (var j = 0; j < n; j++) if (st[j]) { var a = bf(E[j].faces[0]), b = E[j].faces.length > 1 ? bf(E[j].faces[1]) : ''; pk[j] = a < b ? a + '|' + b : b + '|' + a; }
        for (var s = 0; s < n; s++) {
          if (st[s] !== 2 || seen[s]) continue;
          var comp = [], stack = [s], hasSharp = false;
          seen[s] = 1;
          while (stack.length) {
            var c = stack.pop(); comp.push(c);
            if (st[c] === 1) hasSharp = true;
            [E[c].a, E[c].b].forEach(function (p) {
              (at[vKey(p)] || []).forEach(function (o) { if (!seen[o] && pk[o] === pk[c]) { seen[o] = 1; stack.push(o); } });
            });
          }
          if (hasSharp) comp.forEach(function (c2) { if (st[c2] === 2) out[c2] = 1; });
        }
        return out;
      }
      var maxL = 0.08 * diag, cosTurn = Math.cos(30 * Math.PI / 180), cosShallow = Math.cos(40 * Math.PI / 180);
      for (var r = 0; r < n; r++) {
        if (st[r] !== 1 || E[r].faces.length !== 2 || V.dot(E[r].normals[0], E[r].normals[1]) < cosShallow) continue;
        [0, 1].forEach(function (end) {
          var v = end ? E[r].b : E[r].a, from = end ? E[r].a : E[r].b, run = [], L = 0, cur = r;
          if ((at[vKey(v)] || []).filter(function (o) { return st[o] === 1; }).length !== 1) return;
          var d = V.norm(V.sub(v, from));
          while (run.length < 16) {
            var best = -1, bd = cosTurn, bo = null;
            (at[vKey(v)] || []).forEach(function (o) {
              if (o === cur || st[o] !== 2 || out[o] || run.indexOf(o) >= 0) return;
              var oe = vKey(E[o].a) === vKey(v) ? E[o].b : E[o].a, w = V.sub(oe, v), lw = V.len(w);
              if (lw < 1e-12) return;
              var c = V.dot(w, d) / lw;
              if (c > bd) { bd = c; best = o; bo = oe; }
            });
            if (best < 0) break;
            L += V.len(V.sub(bo, v));
            if (L > maxL) { run = []; break; }
            run.push(best); d = V.norm(V.sub(bo, v)); v = bo; cur = best;
            if ((at[vKey(v)] || []).some(function (o) { return o !== best && (st[o] === 1 || out[o]); })) break;   // joined
          }
          run.forEach(function (o) { out[o] = 1; });
        });
      }
      return out;
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
    seam = opts._noCrease ? null : seamRuns();
    meshEdges(mesh).forEach(edgePiece);
    // exact silhouettes:the facet silhouette pieces of one generator (same surface, same side) are chained along the
    // axis; a chain whose two ends lie on true circles or arcs of that surface's axis that pass through the generator
    // (an untrimmed stretch of cylinder or cone between caps, steps or rims) is drawn as the exact tangent line;
    // a chain ending on a trimmed boundary (a cone cut by a flat) keeps its facet edges
    if (pend.length) {
      var runs = {}, rorder = [], tz = diag * 1e-7 + 1e-12;
      pend.forEach(function (p) {
        // (and per record origin: z is measured from it, and OpenCascade gives two faces of one cylinder, the Pulley's
        // rim either side of the groove, records with different origins, r9/drawings9)
        var key = p.key + '|' + (mesh.faces[p.ed.faces[0]].body || 0) + '|' + p.ex[4].map(function (x) { return Math.round(x * 1e6); }).join(',') + '|' + Math.round(V.dot(p.S.o, p.S.d) / (tz * 1000));
        if (!runs[key]) { runs[key] = []; rorder.push(key); }
        runs[key].push(p);
      });
      // lane flatperf: the circles filed by centre in cells of 2·tz·100 (a group passes endOk's test only with its centre
      // within tz·100·√2 of the axis point at z): a perforated panel's 3600 rims were each tried against every chain end
      var gA = tz * 100, gCell = 2 * gA, gHash = null;
      var gKey = function (x, y, z) { return x + ',' + y + ',' + z; };
      var groupsNear = function (Q) {
        if (!gHash) {
          gHash = {};
          CV.groups.forEach(function (G, gi) { (gHash[gKey(Math.floor(G.c[0] / gCell), Math.floor(G.c[1] / gCell), Math.floor(G.c[2] / gCell))] || (gHash[gKey(Math.floor(G.c[0] / gCell), Math.floor(G.c[1] / gCell), Math.floor(G.c[2] / gCell))] = [])).push(gi); });
        }
        var r = 1.5 * gA, out = [], lo = Q.map(function (x) { return Math.floor((x - r) / gCell); }), hi = Q.map(function (x) { return Math.floor((x + r) / gCell); });
        for (var x = lo[0]; x <= hi[0]; x++) for (var y = lo[1]; y <= hi[1]; y++) for (var zc = lo[2]; zc <= hi[2]; zc++) (gHash[gKey(x, y, zc)] || []).forEach(function (gi) { out.push(CV.groups[gi]); });
        return out;
      };
      var endOk = function (S, w, z) {
        var k = S.t === 'cone' ? S.k || 0 : 0, rz = S.r + k * z, P0 = V.add(V.add(S.o, V.scale(S.d, z)), V.scale(w, rz));
        return groupsNear(V.add(S.o, V.scale(S.d, z))).some(function (G) {
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
        if (!runs[key]) { runs[key] = { S: S, skey: p.key, body: body, sg: sg, x0: x0, y0: y0, ivs: [], dev: 0, dev2: 0, phi: phi }; rorder.push(key); }
        runs[key].ivs.push([Math.min(fa, fb), Math.max(fa, fb)]);
        var ra = runs[key];
        ra.p = p;
        [a, b].forEach(function (q) { var X = torusSil(ra, phi(q)); if (X) ra.dev = Math.max(ra.dev, V.len(V.sub(X, q))); });
        // (dev2, rfFI: the same in this view, the facet edge's middle included: a swept tube's facets are chords both
        // round the tube and along the path, and their outline lies up to both sagittas inside the exact one)
        [a, b, m].forEach(function (q) { var X = torusSil(ra, phi(q)); if (X) ra.dev2 = Math.max(ra.dev2, Math.hypot(V.dot(V.sub(X, q), U), V.dot(V.sub(X, q), Vv))); });
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
      var tolS = Math.min(diag * 3e-5, 0.005) + 1e-9;   // (rfIN: at most 0.005 mm off the true outline, a large part too)
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
            var seg = function (t0, t1, list) {
              if (!(t1 - t0 > 1e-9)) return;
              list.push([a2[0] + (b2[0] - a2[0]) * t0, a2[1] + (b2[1] - a2[1]) * t0, a2[0] + (b2[0] - a2[0]) * t1, a2[1] + (b2[1] - a2[1]) * t1, ra.body]);
              if (list === vis) xsil.push({ l: list[list.length - 1], dev: ra.dev2 });
            };
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
              // whole (rfAL): the model edge is a whole circle (a hole's rim), though this piece may be only part of it
              exact.ellipses[pair[1]].push({ c: c2, ax: x2, ay: y2, t0: full ? 0 : iv[0], t1: full ? TWO_PI : iv[1], full: full, whole: !G.arc, body: G.body });
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
    // dropStubs (r9/drawings9): an exact silhouette line (a cylinder's or cone's generator) ends where its face does; a
    // single piece of facet silhouette running on from that end (within 30°) to a free end is the facets' version
    // of a contour that turns away behind the face (the Rounded handle's post running into its concave root fillet:
    // 0.64 mm past the true end in the isometric, where SolidWorks ends the line): dropped when under 2% of the size
    function dropStubs(lines, ells, arcs, circs) {
      var eps = diag * 1e-7 + 1e-9, maxL = diag * 0.02, cos30 = Math.cos(Math.PI / 6);
      function segD(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
      function curveNear(p) {
        var cs = [];
        ells.forEach(function (q) { cs.push([q.c, q.ax, q.ay, q.full ? 0 : q.t0, q.full ? TWO_PI : q.t1]); });
        arcs.forEach(function (a) { cs.push([a.c, [a.r, 0], [0, a.r], a.a0 * Math.PI / 180, a.a1 * Math.PI / 180]); });
        circs.forEach(function (c) { cs.push([c.c, [c.r, 0], [0, c.r], 0, TWO_PI]); });
        return cs.some(function (C) {
          for (var i = 0; i <= 720; i++) { var t = C[3] + (C[4] - C[3]) * i / 720; if (Math.hypot(C[0][0] + Math.cos(t) * C[1][0] + Math.sin(t) * C[2][0] - p[0], C[0][1] + Math.cos(t) * C[1][1] + Math.sin(t) * C[2][1] - p[1]) < 1e-3 * (1 + Math.hypot(C[1][0], C[1][1]))) return true; }
          return false;
        });
      }
      return lines.filter(function (l) {
        var L = Math.hypot(l[2] - l[0], l[3] - l[1]);
        if (!(L > 0) || L > maxL) return true;
        var mid = [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2];
        if (!fsil.some(function (s) { return segD(mid, s) < eps * 10; })) return true;
        for (var end = 0; end < 2; end++) {
          var p = end ? [l[2], l[3]] : [l[0], l[1]], q = end ? [l[0], l[1]] : [l[2], l[3]];
          for (var i = 0; i + 1 < silh.length; i += 2) {
            for (var se = 0; se < 2; se++) {
              var x = silh[i + se], y = silh[i + 1 - se], Ls = Math.hypot(x[0] - y[0], x[1] - y[1]);
              if (Math.hypot(x[0] - p[0], x[1] - p[1]) > eps * 10 || !(Ls > L)) continue;
              // the stub runs on from the exact line's end x (from y through x, on past it)
              if (((x[0] - y[0]) * (q[0] - p[0]) + (x[1] - y[1]) * (q[1] - p[1])) / (Ls * L) < cos30) continue;
              // and its far end touches nothing
              if (lines.some(function (o) { return o !== l && segD(q, o) < eps * 10; }) || curveNear(q)) continue;
              return false;
            }
          }
        }
        return true;
      });
    }
    // dropOnCurves (r10/drawings10): straight pieces lying along an exact arc, circle or ellipse of the view (ends on it,
    // inside its angle range, middle no further off than a chord's sagitta) are the same edge drawn twice:
    // OpenCascade's Tray seen from the right drew the mitre seam's chain (its ellipse, seen along the wall, lands on
    // the bend's arc) as 22 facet lines over the exact arc. Such pieces are dropped.
    function dropOnCurves(lines, arcs, circs, ells) {
      if (!lines.length || !(arcs.length || circs.length || ells.length)) return lines;
      var tc = Math.min(0.005, chordTol() / 10), cs = [];
      function add(c, ax, ay, t0, t1) {
        var rx = Math.hypot(ax[0], ay[0]), ry = Math.hypot(ax[1], ay[1]), det = ax[0] * ay[1] - ax[1] * ay[0];
        // rc: the smallest radius of curvature, b² / a (a, b: the semi-axes), for the sagitta a chord may show
        var qa = ax[0] * ax[0] + ax[1] * ax[1], qb = ay[0] * ay[0] + ay[1] * ay[1], Ea = (qa + qb) / 2, Da = Math.hypot((qa - qb) / 2, ax[0] * ay[0] + ax[1] * ay[1]);
        if (Math.abs(det) < 1e-12) return;
        cs.push({ c: c, ax: ax, ay: ay, t0: t0, t1: t1, inv: [ay[1] / det, -ay[0] / det, -ax[1] / det, ax[0] / det], rc: Math.max(Ea - Da, 0) / Math.sqrt(Ea + Da),
          box: [c[0] - rx - tc, c[1] - ry - tc, c[0] + rx + tc, c[1] + ry + tc] });
      }
      arcs.forEach(function (a) { add(a.c, [a.r, 0], [0, a.r], a.a0 * Math.PI / 180, a.a1 * Math.PI / 180); });
      circs.forEach(function (c) { add(c.c, [c.r, 0], [0, c.r], 0, TWO_PI); });
      ells.forEach(function (q) { add(q.c, q.ax, q.ay, q.full ? 0 : q.t0, q.full ? TWO_PI : q.t1); });
      function at(C, t) { return [C.c[0] + Math.cos(t) * C.ax[0] + Math.sin(t) * C.ay[0], C.c[1] + Math.cos(t) * C.ax[1] + Math.sin(t) * C.ay[1]]; }
      // the curve parameter nearest p (from the unit-circle preimage, refined by a few bisections), or null when it
      // falls outside the curve's range
      function near(C, p) {
        var dx = p[0] - C.c[0], dy = p[1] - C.c[1], t = Math.atan2(C.inv[2] * dx + C.inv[3] * dy, C.inv[0] * dx + C.inv[1] * dy), h = 0.05;
        for (var k = 0; k < 12; k++) {
          var d0 = Math.hypot(at(C, t)[0] - p[0], at(C, t)[1] - p[1]), dm = Math.hypot(at(C, t - h)[0] - p[0], at(C, t - h)[1] - p[1]), dp = Math.hypot(at(C, t + h)[0] - p[0], at(C, t + h)[1] - p[1]);
          if (dm < d0 && dm <= dp) t -= h; else if (dp < d0) t += h; else h /= 2;
        }
        var full = C.t1 - C.t0 >= TWO_PI - 1e-9, tt = C.t0 + ((t - C.t0) % TWO_PI + TWO_PI) % TWO_PI;
        if (!full && tt > C.t1 + 1e-6 && tt < C.t0 + TWO_PI - 1e-6) return null;
        var q = at(C, t);
        return Math.hypot(q[0] - p[0], q[1] - p[1]);
      }
      // (ends within 0.005 mm of the curve, the middle within that plus the chord's sagitta: a nearby true edge, the
      // Hex nut's chamfer hyperbolas 0.015-0.04 mm off its rim ellipse, stays)
      return lines.filter(function (l) {
        var L = Math.hypot(l[2] - l[0], l[3] - l[1]), ends = [[l[0], l[1]], [l[2], l[3]]], mid = [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2];
        return !cs.some(function (C) {
          if (Math.min(l[0], l[2]) < C.box[0] || Math.max(l[0], l[2]) > C.box[2] || Math.min(l[1], l[3]) < C.box[1] || Math.max(l[1], l[3]) > C.box[3]) return false;
          if (!(C.rc > 0) || L > C.rc) return false;
          if (!ends.every(function (p) { var d = near(C, p); return d != null && d <= tc; })) return false;
          var dm = near(C, mid);
          return dm != null && dm <= tc + L * L / (8 * C.rc);
        });
      });
    }
    // rimsToSilhouettes (rfFI): a rim (exact ellipse / arc) hidden by a curved face is hidden where that face's facets
    // are, and their outline lies inside the face's exact silhouette, which is what is drawn: the rim ran on past the
    // silhouette (or stopped short of it) by up to the facets' deviation in this view. A swept tube's facets are chords
    // round the tube and along the path, so that can be more than the chord tolerance closeEnds reaches (the Mug's
    // bottom rim under the handle's bend in the isometric, 0.052 mm past it at maxAngle 12°). A free rim end within
    // 1.5 such deviations of an exact silhouette piece it crosses (not tangentially) is moved along the rim to the
    // crossing; a hidden piece of the same rim that began there begins at the crossing too.
    function rimsToSilhouettes(lines, ells, arcs, circs, hidEll, hidArc, tol) {
      if (!xsil.length || !(ells.length || arcs.length)) return;
      var cs = [];
      ells.forEach(function (q) { cs.push({ o: q, c: q.c, ax: q.ax, ay: q.ay, t0: q.full ? 0 : q.t0, t1: q.full ? TWO_PI : q.t1, full: q.full }); });
      arcs.forEach(function (a) { cs.push({ o: a, arc: true, c: a.c, ax: [a.r, 0], ay: [0, a.r], t0: a.a0 * Math.PI / 180, t1: a.a1 * Math.PI / 180 }); });
      circs.forEach(function (c) { cs.push({ o: c, c: c.c, ax: [c.r, 0], ay: [0, c.r], t0: 0, t1: TWO_PI, full: true }); });
      function cp(E, t) { return [E.c[0] + Math.cos(t) * E.ax[0] + Math.sin(t) * E.ay[0], E.c[1] + Math.cos(t) * E.ax[1] + Math.sin(t) * E.ay[1]]; }
      function segD(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
      function curveD(E, p) {
        var n = 96, h = (E.t1 - E.t0) / n, bt = E.t0, bd = Infinity;
        for (var i = 0; i <= n; i++) { var t = E.t0 + h * i, q = cp(E, t), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; bt = t; } }
        var lo = Math.max(E.t0, bt - h), hi = Math.min(E.t1, bt + h);
        for (var it = 0; it < 60; it++) { var m1 = lo + (hi - lo) * 0.382, m2 = lo + (hi - lo) * 0.618, q1 = cp(E, m1), q2 = cp(E, m2); if (Math.hypot(q1[0] - p[0], q1[1] - p[1]) < Math.hypot(q2[0] - p[0], q2[1] - p[1])) hi = m2; else lo = m1; }
        var qm = cp(E, (lo + hi) / 2);
        return Math.min(bd, Math.hypot(qm[0] - p[0], qm[1] - p[1]));
      }
      cs.forEach(function (E) {
        if (E.full) return;
        [0, 1].forEach(function (end) {
          var te = end ? E.t1 : E.t0, sg = end ? 1 : -1, pe = cp(E, te), eps = 1e-6 * (1 + Math.abs(pe[0]) + Math.abs(pe[1]));
          var dv = [-Math.sin(te) * E.ax[0] + Math.cos(te) * E.ay[0], -Math.sin(te) * E.ax[1] + Math.cos(te) * E.ay[1]], sp = Math.hypot(dv[0], dv[1]);
          if (sp < 1e-12) return;
          var maxS = (E.t1 - E.t0) * sp * 0.5, best = null;
          xsil.forEach(function (x) {
            var l = x.l, R = Math.max(tol, 1.5 * x.dev), dx = l[2] - l[0], dy = l[3] - l[1], L = Math.hypot(dx, dy);
            if (!(L > 0) || segD(pe, l) >= R) return;
            if (Math.abs(dv[0] * dy - dv[1] * dx) / (sp * L) < 0.2) return;   // tangential: closeFreeEnds' case
            var side = function (s) { var q = cp(E, te + sg * s / sp); return ((q[0] - l[0]) * dy - (q[1] - l[1]) * dx) / L; };
            var Rs = Math.min(2 * R, maxS), N = 32, sol = null;
            for (var k = 1; k <= N && sol == null; k++) {
              [1, -1].forEach(function (dir) {
                if (sol != null) return;
                var a = dir * Rs * (k - 1) / N, b = dir * Rs * k / N, ga = side(a), gb = side(b);
                if (ga === 0) { sol = a; return; }
                if (ga * gb > 0) return;
                for (var it = 0; it < 80; it++) { var m = (a + b) / 2, gm = side(m); if (ga * gm <= 0) b = m; else { a = m; ga = gm; } }
                sol = (a + b) / 2;
              });
            }
            if (sol == null) return;
            var q = cp(E, te + sg * sol / sp);
            if (segD(q, l) > eps || Math.hypot(q[0] - pe[0], q[1] - pe[1]) >= R) return;   // on the piece, near the end
            if (!best || Math.abs(sol) < Math.abs(best.s)) best = { s: sol };
          });
          if (!best || Math.abs(best.s) < 1e-9) return;
          // only a free end: one that meets other linework already stays
          for (var i = 0; i < lines.length; i++) if (segD(pe, lines[i]) <= eps) return;
          for (var j = 0; j < cs.length; j++) if (cs[j] !== E && curveD(cs[j], pe) <= eps) return;
          var t = te + sg * best.s / sp, deg = 180 / Math.PI;
          if (end) E.t1 = t; else E.t0 = t;
          if (E.arc) {
            if (end) E.o.a1 = t * deg; else E.o.a0 = t * deg;
            hidArc.forEach(function (h) { if (h.r === E.o.r && h.c[0] === E.o.c[0] && h.c[1] === E.o.c[1]) { if (end && Math.abs(h.a0 - te * deg) < 1e-9) h.a0 = t * deg; if (!end && Math.abs(h.a1 - te * deg) < 1e-9) h.a1 = t * deg; } });
          } else {
            if (end) E.o.t1 = t; else E.o.t0 = t;
            hidEll.forEach(function (h) { if (h.ax === E.o.ax && !h.full) { if (end && Math.abs(h.t0 - te) < 1e-9) h.t0 = t; if (!end && Math.abs(h.t1 - te) < 1e-9) h.t1 = t; } });
          }
        });
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
    if (CV && !opts._keepOnCurves) {
      res.lines.visible = dropOnCurves(res.lines.visible, res.arcs.visible, res.circles.visible, res.ellipses.visible);
      res.lines.hidden = dropOnCurves(res.lines.hidden, res.arcs.visible.concat(res.arcs.hidden), res.circles.visible.concat(res.circles.hidden), res.ellipses.visible.concat(res.ellipses.hidden));
    }
    if (CV) rimsToSilhouettes(res.lines.visible, res.ellipses.visible, res.arcs.visible, res.circles.visible, exact.ellipses.hidden, exact.arcs.hidden, chordTol());
    if (CV) closeEnds(res.lines.visible, res.ellipses.visible, res.arcs.visible, res.circles.visible, chordTol());
    closeFreeEnds(res.lines.visible, res.ellipses.visible, res.arcs.visible, chordTol());
    if (fsil.length && silh.length) res.lines.visible = dropStubs(res.lines.visible, res.ellipses.visible, res.arcs.visible, res.circles.visible);
    // (again: closeEnds / closeFreeEnds can carry a piece back along a curve, the Chamfered block's corner arcs' ends)
    if (CV && !opts._keepOnCurves) res.lines.visible = dropOnCurves(res.lines.visible, res.arcs.visible, res.circles.visible, res.ellipses.visible);
    if (!opts._keepGaps) res.lines.visible = closeSmallGaps(res.lines.visible, res.ellipses.visible, res.arcs.visible, res.circles.visible, 0.6 * chordTol());
    if (!opts._keepGaps) { res.lines.visible = joinCollinear(res.lines.visible, 0.6 * chordTol(), diag); res.lines.hidden = joinCollinear(res.lines.hidden, 0.6 * chordTol(), diag); }
    // equal chords of a curve with no analytic record (Anvil's sheet-metal bends) as exact arcs (r13/drawings13)
    var fitted = 0;
    if (!opts._noFit) ['visible', 'hidden'].forEach(function (st) {
      var fa = fitArcs(res.lines[st], diag);
      if (!fa.arcs.length) return;
      res.lines[st] = fa.lines; res.arcs[st] = res.arcs[st].concat(fa.arcs); res.arcsAll = (res.arcsAll || []).concat(fa.arcs); fitted += fa.arcs.length;
    });
    // (rfIN) facet chords on the circle of an exact arc, filling its gaps, are that arc
    if (CV && !opts._keepGaps) ['visible', 'hidden'].forEach(function (st) { res.lines[st] = _.chordsToArcs(res.lines[st], res.arcs[st], res.circles[st]); });
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
    // (rfIJ) ends that meet to within rounding are one point (exact joins in the DXF)
    if (!opts._keepGaps) ['visible', 'hidden', 'tangent'].forEach(function (st) { _.weldEnds(res.lines[st], res.ellipses[st], res.arcs[st]); });
    res.stats = { visibleLines: res.lines.visible.length, hiddenLines: res.lines.hidden.length, visibleCircles: res.circles.visible.length, hiddenCircles: res.circles.hidden.length, occluders: tris.length };
    if (CV || fitted) { res.stats.visibleArcs = res.arcs.visible.length; res.stats.hiddenArcs = res.arcs.hidden.length; res.stats.visibleEllipses = res.ellipses.visible.length; res.stats.hiddenEllipses = res.ellipses.hidden.length; }
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
  // fitArcs(segs, diag) -> { lines, arcs } (r13/drawings13): runs of 4 or more pieces of one body that meet end to end
  // with equal lengths and equal turns of 0.5–25° each (a curve drawn as equal chords: a sheet-metal bend on Anvil's
  // kernel, which builds bends as faceted prisms with no analytic record, seen along its axis or cut by a section)
  // become exact arcs through their vertices { c, r, a0, a1 (degrees CCW), body, src: 'arc', fit: true }, so both kernels draw the
  // U-bracket's section as 8 lines and 4 arcs. Equal means to 1e-6: a tessellated ellipse or torus outline (OpenCascade's
  // Mug handle in the isometric) has chords that change slowly, and a bend seen obliquely, unequal ones; they stay lines.
  function fitArcs(segs, diag) {
    var arcs = [], drop = [], minT = 0.5 * Math.PI / 180, maxT = 25 * Math.PI / 180;
    if (segs.length < 4) return { lines: segs, arcs: arcs };
    chainLines(segs, { umin: 0, umax: diag, vmin: 0, vmax: 0 }).forEach(function (ch) {
      if (ch.length < 4) return;
      var L = ch.map(function (s) { return Math.hypot(s[2] - s[0], s[3] - s[1]); }), T = [];
      for (var i = 0; i + 1 < ch.length; i++) {
        var a = ch[i], b = ch[i + 1], ax = a[2] - a[0], ay = a[3] - a[1], bx = b[2] - b[0], by = b[3] - b[1];
        T.push(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
      }
      // piece j continues the run that starts at piece s: the same length, and the turn into it like the first turn
      function goesOn(s, j) {
        var t = T[j - 1], t0 = T[s];
        return Math.abs(L[j] - L[s]) <= L[s] * 1e-6 + diag * 1e-9 && Math.abs(t) >= minT && Math.abs(t) <= maxT && Math.abs(t - t0) <= Math.abs(t0) * 1e-5 + 1e-9;
      }
      var s0 = 0;
      while (s0 < ch.length) {
        var e0 = s0;
        while (e0 + 1 < ch.length && goesOn(s0, e0 + 1)) e0++;
        if (e0 - s0 + 1 >= 4) {
          var pts = [[ch[s0][0], ch[s0][1]]];
          for (var j = s0; j <= e0; j++) pts.push([ch[j][2], ch[j][3]]);
          var A = pts[0], B = pts[Math.floor(pts.length / 2)], C = pts[pts.length - 1];
          var d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
          if (Math.abs(d) > 1e-18) {
            var a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
            var c = [(a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d, (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d];
            var r = Math.hypot(A[0] - c[0], A[1] - c[1]), tr = r * 1e-6 + diag * 1e-9, sw = 0;
            if (pts.every(function (p) { return Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - r) <= tr; })) {
              for (var q = 0; q + 1 < pts.length; q++) {
                var u = [pts[q][0] - c[0], pts[q][1] - c[1]], w = [pts[q + 1][0] - c[0], pts[q + 1][1] - c[1]];
                sw += Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1]);
              }
              var t0 = Math.atan2(A[1] - c[1], A[0] - c[0]) * 180 / Math.PI;
              sw *= 180 / Math.PI;
              var arc = { c: c, r: r, a0: sw > 0 ? t0 : t0 + sw, a1: sw > 0 ? t0 + sw : t0, body: ch[s0][4] || 0, src: 'arc', fit: true };
              arcs.push(arc);
              for (var k2 = s0; k2 <= e0; k2++) { drop.push(ch[k2]); ch[k2]._arc = arc; }
            }
          }
        }
        s0 = e0 + 1;
      }
    });
    if (!drop.length) return { lines: segs, arcs: arcs };
    // chainLines hands back the pieces themselves, or reversed copies of them
    var gone = new Uint8Array(segs.length), at = new Map();
    segs.forEach(function (s, i) { at.set(s, i); });
    drop.forEach(function (s) {
      var i = at.get(s);
      if (i == null) for (var j = 0; j < segs.length; j++) { var o = segs[j]; if (!gone[j] && o[0] === s[2] && o[1] === s[3] && o[2] === s[0] && o[3] === s[1]) { i = j; break; } }
      if (i != null) gone[i] = 1;
    });
    // a line that ended on one of the chords (inside it, the Tray's mitre seam on its bend) now ends on the arc: it is
    // carried along itself to the circle (at most the chord's sagitta away)
    var tol = diag * 1e-6 + 1e-9, kept = [];
    function segD(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
    segs.forEach(function (s, i) {
      if (gone[i]) return;
      var o = s;
      [0, 1].forEach(function (end) {
        var p = [o[end * 2], o[end * 2 + 1]], q = [o[2 - end * 2], o[3 - end * 2]];
        for (var j = 0; j < drop.length; j++) {
          var ch = drop[j], A = ch._arc;
          if (segD(p, ch) > tol || Math.hypot(p[0] - ch[0], p[1] - ch[1]) <= tol || Math.hypot(p[0] - ch[2], p[1] - ch[3]) <= tol) continue;
          // the circle point on the line through q and p nearest p
          var dx = p[0] - q[0], dy = p[1] - q[1], L = Math.hypot(dx, dy);
          if (!(L > 0)) break;
          dx /= L; dy /= L;
          var fx = q[0] - A.c[0], fy = q[1] - A.c[1], b = fx * dx + fy * dy, cc = fx * fx + fy * fy - A.r * A.r, disc = b * b - cc;
          if (disc < 0) break;
          var best = null;
          [-b - Math.sqrt(disc), -b + Math.sqrt(disc)].forEach(function (t) { if (t > 0 && (best == null || Math.abs(t - L) < Math.abs(best - L))) best = t; });
          if (best == null || Math.abs(best - L) > A.r * 0.05 + tol) break;
          if (o === s) o = s.slice();
          o[end * 2] = q[0] + dx * best; o[end * 2 + 1] = q[1] + dy * best;
          break;
        }
      });
      kept.push(o);
    });
    drop.forEach(function (ch) { delete ch._arc; });
    return { lines: kept, arcs: arcs };
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

  D.projectView = projectView; D.fitArcs = fitArcs;
  _.mergeIntervals = mergeIntervals; _.mergeCollinear = mergeCollinear; _.chainLines = chainLines; _.extractCircles = extractCircles;
})(Drawing, Drawing._);
