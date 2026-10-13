  // ------------------------------------------------------------------ mesh quality (run cloud-2026-09-25g)
  group('mesh quality');
  // The Funnel, computed without the kernel: its sections are the Ø80 and Ø14 circles as the sketch polylines them
  // (regular n-gons, n = round(8 √r), vertex 0 at angle 0; Top frame: x = u, z = −v). The loft side is the convex hull
  // of the two sections: every plane through an edge of one and a vertex of the other that has all points behind it.
  function funnelSections() {
    var TAU = Math.PI * 2;
    function ngon(r, y) { var n = Math.round(8 * Math.sqrt(r)), out = []; for (var k = 0; k < n; k++) out.push([r * Math.cos(TAU * k / n), y, -r * Math.sin(TAU * k / n)]); return out; }
    var P = ngon(40, 60), Q = ngon(7, 20), all = P.concat(Q), V = K.vec, planes = [], seen = {};
    function tryPlane(a, b, c) {
      var n = V.cross(V.sub(b, a), V.sub(c, a)), l = V.len(n);
      if (l < 1e-12) return;
      n = V.scale(n, 1 / l);
      var w = V.dot(n, a), hi = -Infinity, lo = Infinity;
      all.forEach(function (p) { var d = V.dot(n, p) - w; hi = Math.max(hi, d); lo = Math.min(lo, d); });
      if (hi > 1e-9) { if (lo < -1e-9) return; n = V.scale(n, -1); w = -w; }
      if (Math.abs(n[1]) > 1 - 1e-12) return; // the two caps
      var key = n.map(function (x) { return Math.round(x * 1e8); }).join(',');
      if (!seen[key]) { seen[key] = true; planes.push({ n: n, w: w }); }
    }
    [[P, Q], [Q, P]].forEach(function (pr) { var A = pr[0]; for (var i = 0; i < A.length; i++) pr[1].forEach(function (q) { tryPlane(A[i], A[(i + 1) % A.length], q); }); });
    return { P: P, Q: Q, planes: planes };
  }
  // 2D (x, z) helpers: clip a convex polygon to a x + b z <= c; polygon area; convex hull (monotone chain)
  function clip2(poly, a, b, c) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length], dp = a * p[0] + b * p[1] - c, dq = a * q[0] + b * q[1] - c;
      if (dp <= 0) out.push(p);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { var t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    return out;
  }
  function area2(poly) { var s = 0; for (var i = 0; i < poly.length; i++) { var p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; } return Math.abs(s) / 2; }
  function hull2(pts) {
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [];
    pts.forEach(function (p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    pts.slice().reverse().forEach(function (p) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  var FUNNEL_LOFT = 'var mouth = p.sketch("Top", 60).circle(0, 0, 40).id();\nvar neck = p.sketch("Top", 20).circle(0, 0, 7).id();\np.loft([mouth, neck], { name: "Cone" });';
  // funnelSections() is the 51- and 21-gon of the legacy tessellation, so the hull proofs run there (withLegacy); the
  // same construction at the default tessellation is covered by the closed / manifold checks below
  test('loft between parallel convex sections is their convex hull: prismatoid volume h/6 (A1 + A2 + 4 Am), Am = Minkowski mean', function () { return withLegacy(function () {
    var fs = funnelSections(), r = build(FUNNEL_LOFT);
    noErrors(r);
    var xz = function (p) { return [p[0], p[2]]; }, P2 = fs.P.map(xz), Q2 = fs.Q.map(xz), mid = [];
    P2.forEach(function (p) { Q2.forEach(function (q) { mid.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); }); });
    var expected = 40 / 6 * (area2(P2) + area2(Q2) + 4 * area2(hull2(mid)));
    nearRel(r.body.volume(), expected, 1e-12, 'hull loft volume');
    // planar side faces: one mesh face per hull plane (51 + 21 edges, 3 parallel pairs give quads), no saddle edges
    var side = r.mesh.faces.filter(function (f) { return Math.abs(f.normal[1]) < 1 - 1e-9; });
    assert(side.length === fs.planes.length && fs.planes.length === 69, 'side faces ' + side.length + ', hull planes ' + fs.planes.length);
    var q = K.meshQuality(r.mesh);
    assert(q.closed && q.slivers === 0, 'loft mesh closed, no slivers: ' + JSON.stringify(q));
    return 'volume ' + fmt(expected);
  }); });
  test('Funnel volume = slice integral of the 1.5 mm shell of hull + tube, computed without the kernel (was 12268.395 on the resampled loft)', function () { return withLegacy(function () {
    // Body section B(y): the Ø14 21-gon below y = 20, the hull section above. Sharp inner offset (what Shell makes: face
    // planes moved in by T and extended to meet; top and bottom faces open): C(y) = hull section with every side plane
    // moved in by T, S = tube 21-gon moved in by T. Wall area = |B| − |B∩(C∪S)| = |B| − (|B∩C| + |B∩S| − |B∩C∩S|);
    // each piece is a convex polygon whose area is piecewise quadratic in y, so Simpson converges fast (1e-10 here).
    var fs = funnelSections(), T = 1.5, TAU = Math.PI * 2, nq = fs.Q.length, ap = 7 * Math.cos(Math.PI / nq);
    var BIG = [[-1e3, -1e3], [1e3, -1e3], [1e3, 1e3], [-1e3, 1e3]];
    function byPlanes(poly, y, off) { fs.planes.forEach(function (pl) { poly = clip2(poly, pl.n[0], pl.n[2], pl.w - off - pl.n[1] * y); }); return poly; }
    function byTube(poly, off) { for (var k = 0; k < nq; k++) { var a = -TAU * (k + 0.5) / nq; poly = clip2(poly, Math.cos(a), Math.sin(a), ap - off); } return poly; }
    function wall(y) {
      var b = y < 20 ? byTube(BIG, 0) : byPlanes(BIG, y, 0), c = byPlanes(b, y, T);
      return area2(b) - (area2(c) + area2(byTube(b, T)) - area2(byTube(c, T)));
    }
    function simpson(f, a, b, n) { var h = (b - a) / n, s = f(a) + f(b); for (var i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return s * h / 3; }
    var expected = simpson(wall, 0, 20, 2) + simpson(wall, 20, 60, 20000);
    var ex = AnvilExamples.filter(function (e) { return e.name === 'Funnel'; })[0], r = build(ex.code);
    noErrors(r);
    nearRel(r.body.volume(), expected, 1e-8, 'Funnel vs the analytic shell');
    return 'analytic ' + expected.toFixed(6) + ', kernel ' + r.body.volume().toFixed(6);
  }); });
  test('the Funnel is closed where the cone meets the tube (the resampled loft left a ~1e-5 mm crack: 3 open edges)', function () {
    var ex = AnvilExamples.filter(function (e) { return e.name === 'Funnel'; })[0], r = build(ex.code), q = K.meshQuality(r.mesh);
    assert(q.openEdges === 0 && q.nonManifoldEdges === 0, JSON.stringify(q));
    // and the check does see a crack that narrow: two unit cubes 1e-5 apart share no edge
    var c = build('p.box(10, 10, 10);\np.box(10, 10, 10, { at: [10.00001, 0, 0], merge: false });');
    var qc = K.meshQuality(c.mesh);
    assert(qc.closed, 'two separate closed boxes: ' + JSON.stringify(qc));
    var M = K.meshFromBody(r.body), P = M.positions64, moved = new Float64Array(P);
    // open a 1e-5 crack: shift one face's vertices by 1e-5 along its normal
    var f = M.faces[0];
    for (var i = f.start * 9; i < (f.start + f.count) * 9; i += 3) for (var k = 0; k < 3; k++) moved[i + k] += f.normal[k] * 1e-5;
    var qb = K.meshQuality({ positions64: moved });
    assert(qb.openEdges > 0, 'a 1e-5 mm crack is reported: ' + JSON.stringify(qb));
    return 'Funnel ' + q.triangles + ' triangles, ' + q.tJunctions + ' T-junctions resolved; cracked copy: ' + qb.openEdges + ' open edges';
  });
  test('Funnel drawing: no extra lines from the shell (Front 7 visible lines, Top 72: the two rims; were 7 / 394 with 469 hidden)', function () {
    if (typeof Drawing === 'undefined') return 'drawing.js not loaded';
    var ex = AnvilExamples.filter(function (e) { return e.name === 'Funnel'; })[0], r = build(ex.code);
    var front = Drawing.projectView(r.mesh, 'Front'), top = Drawing.projectView(r.mesh, 'Top');
    assert(front.lines.visible.length <= 10 && front.lines.hidden.length <= 20, 'Front ' + front.lines.visible.length + ' visible, ' + front.lines.hidden.length + ' hidden');
    assert(top.lines.visible.length <= 80 && top.lines.hidden.length === 0, 'Top ' + top.lines.visible.length + ' visible, ' + top.lines.hidden.length + ' hidden');
    return 'Front ' + front.lines.visible.length + ' / ' + front.lines.hidden.length + ', Top ' + top.lines.visible.length + ' / ' + top.lines.hidden.length;
  });
  test('meshQuality counts slivers, needles and non-manifold edges on hand-made meshes', function () {
    // a tetrahedron: closed, min angle 60°
    var a = [0, 0, 0], b = [1, 0, 0], c = [0.5, Math.sqrt(3) / 2, 0], d = [0.5, Math.sqrt(3) / 6, Math.sqrt(2 / 3)];
    function mesh(tris) { var out = []; tris.forEach(function (t) { t.forEach(function (p) { out.push(p[0], p[1], p[2]); }); }); return { positions64: new Float64Array(out) }; }
    var tet = [[a, c, b], [a, b, d], [b, c, d], [c, a, d]], q = K.meshQuality(mesh(tet));
    assert(q.closed && q.slivers === 0 && q.needles === 0, JSON.stringify(q));
    near(q.minAngle, 60, 1e-9, 'tetrahedron min angle');
    var q1 = K.meshQuality(mesh(tet.slice(1)));
    assert(q1.openEdges === 3 && !q1.closed, 'one face missing: 3 open edges ' + JSON.stringify(q1));
    var q2 = K.meshQuality(mesh(tet.concat([[a, b, d]])));
    assert(q2.nonManifoldEdges === 3, 'a face used twice: 3 non-manifold edges ' + JSON.stringify(q2));
    var q3 = K.meshQuality(mesh(tet.concat([[a, [0.5, 0, 0], b]])));
    assert(q3.slivers === 1, 'a collinear triangle is a sliver ' + JSON.stringify(q3));
  });
  if (typeof AnvilExamples !== 'undefined') {
    AnvilExamples.forEach(function (ex) {
      test('mesh quality: ' + ex.name + ' is closed, manifold, without slivers', function () {
        // an assembly's components may touch (a pin in its hole shares edges with the plate), so each component body
        // is checked on its own; a part is checked as one mesh
        var r = buildExample(ex), meshes = isAsmExample(ex) ? r.build.bodies.filter(Boolean).map(function (b) { return K.meshFromBody(b); }) : [r.mesh];
        var q = { triangles: 0, openEdges: 0, nonManifoldEdges: 0, slivers: 0, needles: 0, tJunctions: 0, minAngle: 180 };
        meshes.forEach(function (m) {
          var qm = K.meshQuality(m);
          ['triangles', 'openEdges', 'nonManifoldEdges', 'slivers', 'needles', 'tJunctions'].forEach(function (k) { q[k] += qm[k]; });
          q.minAngle = Math.min(q.minAngle, qm.minAngle);
        });
        assert(q.openEdges === 0, q.openEdges + ' open edges');
        assert(q.nonManifoldEdges === 0, q.nonManifoldEdges + ' non-manifold edges');
        assert(q.slivers === 0, q.slivers + ' sliver (collinear) triangles');
        assert(q.triangles > 0 && q.minAngle > 1e-3, 'min angle ' + q.minAngle + '° (a corner under 0.001° is a CSG fragment)');
        return q.triangles + ' triangles, min angle ' + q.minAngle.toFixed(3) + '°, ' + q.needles + ' under 1°, ' + q.tJunctions + ' T-junctions';
      });
    });
  }
