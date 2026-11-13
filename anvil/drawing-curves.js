// drawing-curves.js — true curves for the drawing engine (Drawing, see drawing.js): the kernel's analytic records
// (polygon.surf, Kernel.curveEdges) read into curve groups (meshCurves), the angle arithmetic on them, the exact
// silhouette generators of cylinders and cones, the circle through points in space, the signed distance to a surface
// record and the intersection curve of two surfaces as a chain of points. Loads after drawing.js (meshDiag, meshEdges)
// and before drawing-hlr.js, which draws with these; mergeIntervals comes from drawing-hlr.js (late bound).
(function (D, _) {
  'use strict';
  var K = Kernel, V = K.vec;
  var TWO_PI = _.TWO_PI, meshDiag = _.meshDiag, meshEdges = D.meshEdges;

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
      var raw = [], changed = true, seenCh = new Map();
      (g.raw || []).forEach(function (ch) {   // a chord reported from both faces it bounds once (r4/drawings4)
        // (lane drawperf) the two ends' rounded coordinates compared as integers (either order), filed by a numeric hash
        var P = ch[0], Q = ch[1], a0 = q(P[0]), a1 = q(P[1]), a2 = q(P[2]), b0 = q(Q[0]), b1 = q(Q[1]), b2 = q(Q[2]);
        var ha = (Math.imul(a0 | 0, 73856093) ^ Math.imul(a1 | 0, 19349663) ^ Math.imul(a2 | 0, 83492791)), hb = (Math.imul(b0 | 0, 73856093) ^ Math.imul(b1 | 0, 19349663) ^ Math.imul(b2 | 0, 83492791));
        var hk = (ha + hb) | 0, bl = seenCh.get(hk);
        if (bl) for (var i = 0; i < bl.length; i++) {
          var k = bl[i];
          if ((k[0] === a0 && k[1] === a1 && k[2] === a2 && k[3] === b0 && k[4] === b1 && k[5] === b2) || (k[0] === b0 && k[1] === b1 && k[2] === b2 && k[3] === a0 && k[4] === a1 && k[5] === a2)) return;
        }
        if (bl) bl.push([a0, a1, a2, b0, b1, b2]); else seenCh.set(hk, [[a0, a1, a2, b0, b1, b2]]);
        raw.push(ch);
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
    // (lane drawperf) the cells are kept in nested Maps by their integer coordinates (no key strings), each holding
    // [edge index, end] pairs in the order they were filed
    function cellOf(cx, cy, cz, make) {
      var my = hash.get(cx);
      if (!my) { if (!make) return null; hash.set(cx, my = new Map()); }
      var mz = my.get(cy);
      if (!mz) { if (!make) return null; my.set(cy, mz = new Map()); }
      var l = mz.get(cz);
      if (!l && make) mz.set(cz, l = []);
      return l || null;
    }
    function mapPieces(smooth) {
      hash = new Map(); pieceCurve = new Int32Array(edges.length);
      for (var i = 0; i < pieceCurve.length; i++) pieceCurve[i] = -1;
      for (var ei = 0; ei < edges.length; ei++) {
        var ed = edges[ei];
        if (!ed.smooth !== !smooth) continue;
        for (var end = 0; end < 2; end++) { var p = end ? ed.b : ed.a; cellOf(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell), true).push([ei, end]); }
      }
      walk();
      return pieceCurve;
    }
    function near(P) {
      // lane flatperf: only the cells [P − tol, P + tol] reaches (1 of the 27 mostly: cell = 4 tol), same order
      var c0 = Math.floor(P[0] / cell), c1 = Math.floor(P[1] / cell), c2 = Math.floor(P[2] / cell), out = [];
      var x0 = Math.max(-1, Math.floor((P[0] - tol) / cell) - c0), x1 = Math.min(1, Math.floor((P[0] + tol) / cell) - c0);
      var y0 = Math.max(-1, Math.floor((P[1] - tol) / cell) - c1), y1 = Math.min(1, Math.floor((P[1] + tol) / cell) - c1);
      var z0 = Math.max(-1, Math.floor((P[2] - tol) / cell) - c2), z1 = Math.min(1, Math.floor((P[2] + tol) / cell) - c2);
      for (var dx = x0; dx <= x1; dx++) for (var dy = y0; dy <= y1; dy++) for (var dz = z0; dz <= z1; dz++) {
        var l = cellOf(c0 + dx, c1 + dy, c2 + dz, false);
        if (l) for (var i = 0; i < l.length; i++) {
          var h = l[i], ed = edges[h[0]], X = h[1] ? ed.b : ed.a, ex = X[0] - P[0], ey = X[1] - P[1], ez = X[2] - P[2];
          if (Math.sqrt(ex * ex + ey * ey + ez * ez) <= tol) out.push(h);
        }
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
    return _.mergeIntervals(list, gap);
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

  D.meshCurves = meshCurves;
  _.curveAngle = curveAngle; _.unwrapNear = unwrapNear; _.modMerge = modMerge; _.subtractIntervals = subtractIntervals;
  _.joinRuns = joinRuns; _.isFull = isFull; _.closeFull = closeFull; _.exactSilhouette = exactSilhouette; _.circle3 = circle3;
  _.surfDist = surfDist; _.intersectionChain = intersectionChain; _.curveBounds = curveBounds;
})(Drawing, Drawing._);
