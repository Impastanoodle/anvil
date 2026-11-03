  // --- rfHM (2026-11-03, lane sweep-shade): smooth shading of freeform (record-less) faces. Kernel.analyticNormals gives
  // every corner of a facet of one smooth face ONE normal (no jumps across the facet edges, which shaded as lumps and
  // bright streaks), facets of one OpenCascade face are never split by the 20° crease rule (OpenCascade's mesh turns
  // up to its angular deflection), real creases stay sharp, and a face whose pieces touch at one corner still has
  // every outline edge (faceOutline: missing edges were drawn as dark marks). ---
  (function () {
    group('rfHM: smooth shading of sweeps, lofts, boundaries and fillets (analyticNormals, faceOutline)');
    var D2R = Math.PI / 180;
    function rfHMBuild(code) {
      var model = K.newModel('rfHM');
      K.runScript(model, code);
      var b = K.rebuild(model);
      assert(b.body && !Object.keys(b.errors || {}).length, 'build errors ' + JSON.stringify(b.errors));
      return K.meshFromBody(b.body);
    }
    function rfHMAng(a, b) { return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / D2R; }
    function rfHMKey(x, y, z) { return Math.round(x * 1e6) + ',' + Math.round(y * 1e6) + ',' + Math.round(z * 1e6); }
    // the largest jump between the smooth normals two faces give one vertex of a smooth edge between them (the edges
    // inside one OpenCascade face, or bodyEdges' smooth ones)
    function rfHMJump(mesh, N) {
      var P = mesh.positions64 || mesh.positions, nT = P.length / 9, faceOf = new Int32Array(nT), vf = new Map();
      mesh.faces.forEach(function (f, fi) { for (var q = f.start; q < f.start + f.count; q++) faceOf[q] = fi; });
      for (var t = 0; t < nT; t++) for (var k = 0; k < 3; k++) {
        var o = t * 9 + k * 3, kk = rfHMKey(P[o], P[o + 1], P[o + 2]) + '#' + faceOf[t], a = vf.get(kk);
        if (!a) vf.set(kk, a = []);
        a.push([N[o], N[o + 1], N[o + 2]]);
      }
      var bf = mesh.faces.map(function (f) { return f.polys && f.polys[0] && f.polys[0].face != null ? f.polys[0].face : null; });
      var worst = 0, n = 0;
      K.bodyEdges(mesh).forEach(function (e) {
        if (e.faces.length !== 2) return;
        var fa = e.faces[0], fb = e.faces[1];
        if (!(bf[fa] != null ? bf[fa] === bf[fb] : e.smooth)) return;
        [e.a, e.b].forEach(function (p) {
          var A = vf.get(rfHMKey(p[0], p[1], p[2]) + '#' + fa), B = vf.get(rfHMKey(p[0], p[1], p[2]) + '#' + fb);
          if (!A || !B) return;
          n++;
          A.forEach(function (x) { B.forEach(function (y) { worst = Math.max(worst, rfHMAng(x, y)); }); });
        });
      });
      return { worst: worst, n: n };
    }
    // every corner whose facet lies on the surface: worst angle between its smooth normal and trueN(p) (null = skip)
    function rfHMTrue(mesh, N, trueN) {
      var P = mesh.positions64 || mesh.positions, nT = P.length / 9, worst = 0, n = 0;
      for (var t = 0; t < nT; t++) for (var k = 0; k < 3; k++) {
        var o = t * 9 + k * 3, tn = trueN([P[o], P[o + 1], P[o + 2]]);
        if (!tn) continue;
        var fl = [mesh.normals[o], mesh.normals[o + 1], mesh.normals[o + 2]];
        if (rfHMAng(fl, tn) > 30) continue;   // an end cap's corner on the rim
        n++;
        worst = Math.max(worst, rfHMAng([N[o], N[o + 1], N[o + 2]], tn));
      }
      return { worst: worst, n: n };
    }
    function rfHMUnit(v) { var l = Math.hypot(v[0], v[1], v[2]); return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : null; }
    // corners of planar faces keep their face's own normal (a real crease stays sharp)
    function rfHMFlatPlanes(mesh, N, isPlane) {
      var bad = 0;
      mesh.faces.forEach(function (f) {
        if (!isPlane(f)) return;
        for (var i = f.start * 9; i < (f.start + f.count) * 9; i += 3) if (rfHMAng([N[i], N[i + 1], N[i + 2]], f.normal) > 0.05) bad++;
      });
      return bad;
    }
    // an OpenCascade-like body: polygons tagged with their B-rep face (polygon.face), as OcctKernel.toBodies makes them
    function rfHMPoly(pts, face) {
      var p = CSG.Polygon.tryCreate(pts.map(function (q) { return new CSG.Vertex(new CSG.Vector(q[0], q[1], q[2])); }), null);
      if (p) p.face = face;
      return p;
    }
    // a tube of radius r along X, length L, nSeg facets round (turning 360/nSeg each), nRow rows, diagonals alternating
    function rfHMTube(r, L, nSeg, nRow) {
      var polys = [], i, j;
      function at(i, j) { var th = 2 * Math.PI * i / nSeg; return [L * j / nRow, r * Math.cos(th), r * Math.sin(th)]; }
      for (i = 0; i < nSeg; i++) for (j = 0; j < nRow; j++) {
        var a = at(i, j), b = at(i, j + 1), c = at(i + 1, j + 1), d = at(i + 1, j);
        if ((i + j) % 2) { polys.push(rfHMPoly([a, d, c], 0), rfHMPoly([a, c, b], 0)); }
        else { polys.push(rfHMPoly([a, d, b], 0), rfHMPoly([d, c, b], 0)); }
      }
      var c0 = [], c1 = [];
      for (i = 0; i < nSeg; i++) { c0.push(at(nSeg - i, 0)); c1.push(at(i, nRow)); }
      polys.push(rfHMPoly(c0, 1), rfHMPoly(c1, 2));
      return K.meshFromBody(CSG.fromPolygons(polys.filter(Boolean)));
    }
    var SPRING = 'p.units("in");\nvar s = p.sketch("Top").circle(0, 0, 0.5).id();\nvar h = p.helix(s, { pitch: 0.25, revolutions: 8 });\n' +
      'var wire = p.sketch("Front").circle(0.5, 0, 0.03125).id();\np.sweep({ profile: wire, path: h });';

    test('rfHM: Compression Spring (Ø.0625 wire swept along a helix): one smooth normal at every side vertex (jump under 0.1°), each within 8° of its facet', function () {
      var m = rfHMBuild(SPRING), N = K.analyticNormals(m), j = rfHMJump(m, N), dev = 0;
      assert(j.n > 10000, 'only ' + j.n + ' smooth-edge corners');
      assert(j.worst < 0.1, 'normals jump ' + j.worst.toFixed(3) + '° across a smooth edge of the wire');
      for (var i = 0; i < N.length; i += 3) { var a = rfHMAng([N[i], N[i + 1], N[i + 2]], [m.normals[i], m.normals[i + 1], m.normals[i + 2]]); if (a < 60) dev = Math.max(dev, a); }
      assert(dev < 8, 'a corner normal is ' + dev.toFixed(2) + '° from its facet (32 facets round: 5.6° expected)');
      return j.n + ' corners, jump ' + j.worst.toFixed(4) + '°, facet ' + dev.toFixed(2) + '°';
    });

    test('rfHM: a Ø.0625 circle swept along a straight line and along a quarter arc R1: smooth, and within 1° of the true pipe normal', function () {
      var r = 0.03125, out = [];
      var straight = rfHMBuild('p.units("in");\nvar w = p.sketch("Front").circle(0, 0, ' + r + ').id();\nvar l = p.sketch("Top").line(0, 0, 0, -2).id();\np.sweep({ profile: w, path: l });');
      var arc = rfHMBuild('p.units("in");\nvar w = p.sketch("Front").circle(0, 0, ' + r + ').id();\nvar l = p.sketch("Top").arc(1, 0, 1, 180, 270).id();\np.sweep({ profile: w, path: l });');
      [[straight, function (p) { return Math.abs(Math.hypot(p[0], p[1]) - r) < 1e-4 ? rfHMUnit([p[0], p[1], 0]) : null; }, 'straight'],
        [arc, function (p) {
          var c = rfHMUnit([p[0] - 1, 0, p[2]]);
          if (!c) return null;
          var q = [p[0] - (1 + c[0]), p[1], p[2] - c[2]];
          return Math.abs(Math.hypot(q[0], q[1], q[2]) - r) < 1e-4 ? rfHMUnit(q) : null;
        }, 'arc']].forEach(function (c) {
        var N = K.analyticNormals(c[0]), j = rfHMJump(c[0], N), tr = rfHMTrue(c[0], N, c[1]);
        assert(tr.n > 50, c[2] + ': only ' + tr.n + ' corners on the pipe');
        assert(j.worst < 0.1, c[2] + ': normals jump ' + j.worst.toFixed(3) + '°');
        assert(tr.worst < 1, c[2] + ': ' + tr.worst.toFixed(3) + '° from the pipe normal');
        out.push(c[2] + ' ' + tr.worst.toFixed(4) + '°');
      });
      return out.join(', ');
    });

    test('rfHM: 3-section circle loft (Trumpet Funnel Ø4 > Ø1.8 > Ø1): smooth, every normal in its meridian plane (tilt under 0.5°), caps flat', function () {
      var m = rfHMBuild('p.units("in");\nvar a = p.sketch("Top").circle(0, 0, 2).id();\nvar b = p.sketch("Top", 2).circle(0, 0, 0.9).id();\nvar c = p.sketch("Top", 4).circle(0, 0, 0.5).id();\np.loft([a, b, c]);');
      var N = K.analyticNormals(m), j = rfHMJump(m, N), P = m.positions64, tilt = 0;
      for (var i = 0; i < P.length; i += 3) {
        var rr = Math.hypot(P[i], P[i + 2]);
        if (rr < 1e-6 || Math.abs(m.normals[i + 1]) > 0.999) continue;
        tilt = Math.max(tilt, Math.asin(Math.min(1, Math.abs(N[i] * (-P[i + 2] / rr) + N[i + 2] * (P[i] / rr)))) / D2R);
      }
      assert(j.worst < 0.1, 'normals jump ' + j.worst.toFixed(3) + '°');
      assert(tilt < 0.5, 'a normal leans ' + tilt.toFixed(3) + '° out of its meridian plane');
      var bad = rfHMFlatPlanes(m, N, function (f) { return Math.abs(f.normal[1]) > 0.9999999; });
      assert(bad === 0, bad + ' cap corners not flat');
      return 'jump ' + j.worst.toFixed(4) + '°, tilt ' + tilt.toFixed(4) + '°';
    });

    test('rfHM: Boundary between two offset circles and an R2 fillet on an elliptic boss rim: smooth, and the box\'s own edges stay sharp', function () {
      var bnd = rfHMBuild('p.units("in");\nvar a = p.sketch("Top").circle(0, 0, 1).id();\nvar b = p.sketch("Top", 2).circle(0.5, 0, 0.5).id();\np.boundary([a, b]);');
      var fil = rfHMBuild('p.units("mm"); p.box(80, 60, 10);\np.sketch("Top", 10).ellipse(40, -30, 20, 12).extrude(15);\np.fillet(2, [[60, 25, 30]]);');
      var out = [];
      [[bnd, 'boundary'], [fil, 'fillet']].forEach(function (c) {
        var N = K.analyticNormals(c[0]), j = rfHMJump(c[0], N);
        assert(j.n > 50, c[1] + ': only ' + j.n + ' smooth-edge corners');
        assert(j.worst < 0.1, c[1] + ': normals jump ' + j.worst.toFixed(3) + '°');
        var bad = rfHMFlatPlanes(c[0], N, function (f) { return !f.polys.some(function (p) { return p.surf; }) && f.normal.some(function (x) { return Math.abs(Math.abs(x) - 1) < 1e-9; }) && f.area > 1e-3; });
        assert(bad === 0, c[1] + ': ' + bad + ' corners of axis-aligned planar faces were smoothed');
        out.push(c[1] + ' ' + j.worst.toFixed(4) + '°');
      });
      return out.join(', ');
    });

    test('rfHM: OpenCascade-style tube (one B-rep face, 17 facets round = 21° turns, over the 20° crease): every side normal radial within 0.5°, caps flat', function () {
      var m = rfHMTube(1, 4, 17, 6), N = K.analyticNormals(m), j = rfHMJump(m, N);
      var tr = rfHMTrue(m, N, function (p) { return Math.abs(Math.hypot(p[1], p[2]) - 1) < 1e-6 ? rfHMUnit([0, p[1], p[2]]) : null; });
      assert(tr.n > 100, 'only ' + tr.n + ' side corners');
      assert(j.worst < 0.1, 'normals jump ' + j.worst.toFixed(3) + '° inside one OpenCascade face');
      assert(tr.worst < 0.5, 'a side normal is ' + tr.worst.toFixed(3) + '° from radial (crease rule split the face)');
      var bad = rfHMFlatPlanes(m, N, function (f) { return Math.abs(f.normal[0]) > 0.9999; });
      assert(bad === 0, bad + ' cap corners smoothed');
      return tr.n + ' corners, ' + tr.worst.toFixed(4) + '° from radial';
    });

    test('rfHM: real creases stay sharp: a 90° fold inside one OpenCascade face, a box, and a square-to-square loft', function () {
      var fold = K.meshFromBody(CSG.fromPolygons([rfHMPoly([[0, 0, 0], [1, 0, 0], [1, 0, -1], [0, 0, -1]], 0), rfHMPoly([[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], 0)]));
      var Nf = K.analyticNormals(fold), bad = rfHMFlatPlanes(fold, Nf, function () { return true; });
      assert(bad === 0, 'fold: ' + bad + ' corners smoothed across the 90° crease');
      var box = rfHMBuild('p.units("in"); p.box(2, 1, 0.5);'), Nb = K.analyticNormals(box);
      bad = rfHMFlatPlanes(box, Nb, function () { return true; });
      assert(bad === 0, 'box: ' + bad + ' corners smoothed');
      var loft = rfHMBuild('var a = p.sketch("Front").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Front", 2).centerRect(0, 0, 1, 1).id();\np.loft([a, b]);'), Nl = K.analyticNormals(loft);
      bad = rfHMFlatPlanes(loft, Nl, function () { return true; });
      assert(bad === 0, 'square loft: ' + bad + ' corners smoothed');
      return 'sharp';
    });

    test('rfHM: a face made of two triangles touching at one corner has two outline loops and every edge (no chain across the pinch)', function () {
      var m = K.meshFromBody(CSG.fromPolygons([rfHMPoly([[0, 0, 0], [1, 0, 0], [0, 1, 0]], 0), rfHMPoly([[0, 0, 0], [-1, 0, 0], [0, -1, 0]], 0)]));
      assert(m.faces.length === 1, m.faces.length + ' faces');
      var o = K.faceOutline(m, 0);
      assert(o.loops.length === 2 && o.loops.every(function (l) { return l.length === 3; }), 'loops ' + o.loops.map(function (l) { return l.length; }).join('/'));
      var E = K.bodyEdges(m), L = E.reduce(function (s, e) { return s + e.len; }, 0);
      near(L, 2 * (2 + Math.SQRT2), 1e-9, 'outline length');
      return E.length + ' edges';
    });
  })();
