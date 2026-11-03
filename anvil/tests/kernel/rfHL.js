  // --- rfHL (2026-11-03, lane loft-face) --- no stray lines on freeform faces. The Trumpet Funnel (three coaxial circles)
  // showed short dark segments on its flare with OpenCascade on: the loft's quarter pieces were four B-rep faces and their
  // tangent seams were drawn wherever the coarse mesh turned by more than 22° across them. Now a loft through full circles
  // has ONE side face on OpenCascade (loftPatches says `smooth`, occt-kernel.js joinPatches), any edge OpenCascade finds
  // tangent is never drawn (tangentFaces → build.occt.tangent → ui-core.js edgesFor), and a Boundary without curves is the
  // Loft on both kernels. These rows check the kernel side on Anvil's engine; smoke/rfHL.js checks OpenCascade in the app.
  (function () {
    group('rfHL: lofts, boundaries and sweeps draw no seams: only rims and real corners');
    var U = 'p.units("in");\n';
    var FUNNEL = U + 'var a = p.sketch("Top").circle(0, 0, 2).id();\nvar b = p.sketch("Top", 2).circle(0, 0, 0.9).id();\nvar c = p.sketch("Top", 4).circle(0, 0, 0.5).id();\n';
    var SQUARES = U + 'var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 2).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 4).centerRect(0, 0, 3, 3).id();\n';
    var MIXED = U + 'var a = p.sketch("Top").centerRect(0, 0, 3, 3).id();\nvar b = p.sketch("Top", 2).circle(0, 0, 1).id();\nvar c = p.sketch("Top", 4).circle(0, 0, 1.5).id();\n';
    // the loft's sections as buildLoft makes them (for K._.loftPatches)
    function rfHLSecs(r) {
      var f = r.model.features.filter(function (x) { return x.type === 'loft' || x.type === 'boundary'; })[0], ids = f.sketches || f.dir1;
      return ids.map(function (id) {
        var s = K.findFeature(r.model, id), pl = K.resolvePlane(s.plane, r.model, {}), prof = s.profile || K.sketchProfile(s);
        var outer = prof.loops.filter(function (l) { return !l.hole; })[0];
        return { plane: pl, pts: outer.pts.map(function (p) { return K.to3D(pl, p[0], p[1]); }), loop: outer, prof: prof };
      });
    }
    // the edges the viewport draws (bodyEdges' sharp ones): those not on a cap plane y = y0 are what we look at
    function rfHLDrawn(r, capYs) {
      return K.bodyEdges(r.mesh).filter(function (e) {
        if (e.smooth) return false;
        return !capYs.some(function (y) { return Math.abs(e.a[1] - y) < 1e-6 && Math.abs(e.b[1] - y) < 1e-6; });
      });
    }

    test('rfHL: the Trumpet Funnel (Ø4 > Ø1.8 > Ø1 over 4 in) draws only its two rims on Anvil\'s kernel; volume in the library\'s range; loftPatches marks it smooth (one side face on OpenCascade)', function () {
      var r = build(FUNNEL + 'p.loft([a, b, c]);');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      assert(r.mp.volume > Math.PI * (0.25 + 0.81) * 2 * 0.9 && r.mp.volume < Math.PI * 4 * 4, 'volume ' + r.mp.volume);
      var off = rfHLDrawn(r, [0, 4]);
      assert(!off.length, off.length + ' edges drawn on the flare, first at ' + (off[0] && JSON.stringify(off[0].mid)));
      var pa = K._.loftPatches(rfHLSecs(r));
      assert(pa && pa.smooth === true && pa.faces.length === 4, 'smooth quarter patches: ' + (pa && pa.smooth) + ', ' + (pa && pa.faces.length));
      // the pieces meet end to end: last pole row of each = first of the next (what joinPatches needs)
      for (var j = 0; j < 4; j++) {
        var A = pa.faces[j].poles, B = pa.faces[(j + 1) % 4].poles, last = A[A.length - 1], first = B[0];
        last.forEach(function (q, k) { nearVec(q, first[k], 1e-9, 'piece ' + j + ' → ' + ((j + 1) % 4) + ' row ' + k); });
        assert(pa.faces[j].vKnots.join() === pa.faces[0].vKnots.join() && !pa.faces[j].weights, 'same v knots, not rational');
      }
      return 'volume ' + r.mp.volume.toFixed(6) + ', ' + r.mesh.faces.length + ' mesh faces';
    });

    test('rfHL: a loft through three squares keeps its four corners drawn the whole height, and is not smooth', function () {
      var r = build(SQUARES + 'p.loft([a, b, c]);');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      var off = rfHLDrawn(r, [0, 4]), corners = {};
      off.forEach(function (e) {
        var key = (e.mid[0] > 0 ? '+' : '-') + (e.mid[2] > 0 ? '+' : '-');
        assert(Math.abs(Math.abs(e.mid[0]) - Math.abs(e.mid[2])) < 1e-6, 'a drawn edge off the corner lines at ' + JSON.stringify(e.mid));
        corners[key] = (corners[key] || 0) + Math.abs(e.b[1] - e.a[1]);
      });
      ['++', '+-', '-+', '--'].forEach(function (k) { near(corners[k] || 0, 4, 1e-6, 'corner ' + k + ' drawn height'); });
      var pa = K._.loftPatches(rfHLSecs(r));
      assert(pa && !pa.smooth && pa.faces.length === 4, 'four faces, not smooth');
      return 'corner edges: ' + off.length;
    });

    test('rfHL: a loft from a square to two circles keeps its four square corners where they start and is not smooth (one face per square side, as SolidWorks)', function () {
      var r = build(MIXED + 'p.loft([a, b, c]);');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      var pa = K._.loftPatches(rfHLSecs(r));
      assert(pa && !pa.smooth && pa.faces.length === 4, 'four faces, not smooth: ' + (pa && pa.faces.length));
      var low = rfHLDrawn(r, [0, 4]).filter(function (e) { return Math.min(e.a[1], e.b[1]) < 1e-9; });
      assert(low.length >= 4, 'square corners drawn at the bottom: ' + low.length);
    });

    test('rfHL: a Boundary through three circles (no curves) is the Loft: same volume, only the rims drawn', function () {
      var lo = build(FUNNEL + 'p.loft([a, b, c]);'), bd = build(FUNNEL + 'p.boundary([a, b, c]);');
      assert(!Object.keys(bd.errors).length, JSON.stringify(bd.errors));
      nearRel(bd.mp.volume, lo.mp.volume, 1e-12, 'boundary volume');
      var off = rfHLDrawn(bd, [0, 4]);
      assert(!off.length, off.length + ' edges drawn on the boundary side');
      assert(K._.loftPatches(rfHLSecs(bd)).smooth === true, 'smooth');
    });

    test('rfHL: a sweep of a circle along a line then a tangent arc draws only its two end rims (no seam where the tube meets the bend)', function () {
      var r = build(U + 'var prof = p.sketch("Top").circle(0, 0, 0.25).id();\nvar path = p.sketch("Front").line(0, 0, 0, 1).arc(2, 1, 2, 90, 180).id();\np.sweep({ profile: prof, path: path });');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      // the path runs (0,0) → (0,1), then the arc about (2,1) to (2,3) heading along +x: the start rim lies in y = 0, the
      // end rim in the plane x = 2
      var drawn = K.bodyEdges(r.mesh).filter(function (e) { return !e.smooth; });
      var start = drawn.filter(function (e) { return Math.abs(e.a[1]) < 1e-6 && Math.abs(e.b[1]) < 1e-6; });
      var end = drawn.filter(function (e) { return Math.abs(e.a[0] - 2) < 1e-6 && Math.abs(e.b[0] - 2) < 1e-6; });
      assert(start.length >= 8 && end.length >= 8, 'rims: ' + start.length + ', ' + end.length);
      assert(start.length + end.length === drawn.length, (drawn.length - start.length - end.length) + ' edges drawn off the rims');
      return 'start rim ' + start.length + ', end rim ' + end.length;
    });

    // STEP: the funnel's side is one closed B-spline face (exchange.js splineLoftOf joins loftPatches' quarters with
    // K._.joinLoftPatches, as occt-kernel.js loftTool does): 3 faces; Anvil's reader takes it back closed at the volume
    function rfHLStepVolume(s) {
      var P = s.positions, T = s.triangles, v = 0;
      for (var i = 0; i < T.length; i += 3) {
        var a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3;
        v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
      }
      return v;
    }
    function rfHLOpen(s) {
      var P = s.positions, T = s.triangles, use = {}, bad = 0;
      function key(i) { return Math.round(P[i * 3] * 1e7) + ',' + Math.round(P[i * 3 + 1] * 1e7) + ',' + Math.round(P[i * 3 + 2] * 1e7); }
      for (var t = 0; t < T.length; t += 3) for (var e = 0; e < 3; e++) {
        var a = key(T[t + e]), b = key(T[t + (e + 1) % 3]);
        if (a !== b) use[a + '>' + b] = (use[a + '>' + b] || 0) + 1;
      }
      Object.keys(use).forEach(function (k) { var ab = k.split('>'); if (use[k] !== 1 || use[ab[1] + '>' + ab[0]] !== 1) bad++; });
      return bad;
    }
    test('rfHL: the Trumpet Funnel goes to STEP as ONE closed B-spline side face and two planes (3 faces, as SolidWorks and OpenCascade); it reads back closed at the part\'s volume', function () {
      var r = build(FUNNEL + 'p.loft([a, b, c]);'), step = Exchange.exportSTEP(r.model, r.build), back = Exchange.importFile('funnel.step', step, { units: 'in' });
      assert((step.match(/B_SPLINE_SURFACE_WITH_KNOTS/g) || []).length === 1, 'B-spline faces ' + (step.match(/B_SPLINE_SURFACE_WITH_KNOTS/g) || []).length);
      assert((step.match(/=ADVANCED_FACE/g) || []).length === 3 && (step.match(/=PLANE\(/g) || []).length === 2, 'faces');
      assert(back.solids.length === 1 && !back.warnings.length, 'solids ' + back.solids.length + ' ' + back.warnings);
      assert(rfHLOpen(back.solids[0]) === 0, 'open edges ' + rfHLOpen(back.solids[0]));
      nearRel(rfHLStepVolume(back.solids[0]), r.mp.volume, 3e-5, 'volume read back');
      // the joined patch: closed in u (last pole row = first), the quarters' knots kept (mult 3 at the joins)
      var one = K._.joinLoftPatches(K._.loftPatches(rfHLSecs(r)).faces);
      assert(one && one.closed && one.poles[one.poles.length - 1] === one.poles[0], 'closed patch');
      assert(one.uMults.join() === [4, 3, 3, 3, 4].join() || one.uMults.filter(function (x) { return x === 3; }).length >= 3, 'join knots ' + one.uMults.join());
      return step.length + ' bytes, volume ' + rfHLStepVolume(back.solids[0]).toFixed(6);
    });
    // meshFromBody on face-tagged triangles (OpenCascade's toBodies): a curved B-rep face groups only edge-connected,
    // exactly coplanar triangles; a flat one keeps the loose grouping (its edge nodes may sit 1e-7 off the plane)
    function rfHLTri(a, b, c, face) {
      var pg = CSG.Polygon.tryCreate([a, b, c].map(function (p) { return new CSG.Vertex(new CSG.Vector(p[0], p[1], p[2])); }), 1);
      pg.face = face;
      return pg;
    }
    test('rfHL: meshFromBody keeps two coplanar triangles of one curved B-rep face that only share a corner apart (it joined them into a bow tie whose outline lost points and drew stray diagonals), joins edge-sharing coplanar ones, and keeps a flat face whole', function () {
      var polys = [
        rfHLTri([0, 0, 0], [1, 0, 0], [0, 1, 0], 7), rfHLTri([1, 0, 0], [2, 0, 0], [2, 1, 0], 7),   // coplanar, one shared corner
        rfHLTri([0, 1, 0], [1, 0, 0], [1, 1, 0.0123], 7),                                         // between them, tilted: face 7 is curved
        rfHLTri([2, 0, 0], [3, 0, 0], [2, 1, 0], 7),                                              // shares an edge with the second: joined
        rfHLTri([0, 0, 5], [1, 0, 5], [1, 1, 5 + 1e-7], 8), rfHLTri([0, 0, 5], [1, 1, 5 + 1e-7], [0, 1, 5], 8)   // a flat face, a node 1e-7 off
      ];
      var m = K.meshFromBody(CSG.fromPolygons(polys)), f7 = m.faces.filter(function (f) { return f.polys[0].face === 7; }), f8 = m.faces.filter(function (f) { return f.polys[0].face === 8; });
      assert(f7.length === 3, 'curved face: ' + f7.length + ' mesh faces (want 3: the corner-sharing pair apart, the edge-sharing pair joined)');
      assert(f7.some(function (f) { return f.polys.length === 2; }), 'the edge-sharing pair joined');
      assert(f8.length === 1 && f8[0].polys.length === 2, 'flat face kept whole: ' + f8.length);
      // every outline keeps its triangles' own corners (nothing re-projected)
      m.faces.forEach(function (f, i) {
        var o = K.faceOutline(m, i), pts = [];
        f.polys.forEach(function (p) { p.vertices.forEach(function (v) { pts.push([v.pos.x, v.pos.y, v.pos.z]); }); });
        o.loops.forEach(function (l) { l.forEach(function (q) { var p = K.to3D(o.plane, q[0], q[1]); assert(pts.some(function (w) { return Math.hypot(w[0] - p[0], w[1] - p[1], w[2] - p[2]) < 1e-6; }), 'outline point moved: ' + JSON.stringify(p)); }); });
      });
    });
    test('rfHL: a square-to-round transition (6 × 6 square to Ø3 circle over 4 in) on Anvil\'s kernel: no open / T-junction edges and no drawn edge off the four corner rulings (the loose plane grouping joined nearly flat facets and drew 56 stray lines)', function () {
      var r = build(U + 'var a = p.sketch("Top").centerRect(0, 0, 6, 6).id();\nvar b = p.sketch("Top", 4).circle(0, 0, 1.5).id();\np.loft([a, b]);\n');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      var E = K.bodyEdges(r.mesh), open = E.filter(function (e) { return e.faces.length !== 2; });
      assert(!open.length, open.length + ' edges with one face, first ' + (open[0] && JSON.stringify([open[0].a, open[0].b])));
      var off = rfHLDrawn(r, [0, 4]).filter(function (e) { return Math.abs(Math.abs(e.a[0]) - Math.abs(e.a[2])) > 1e-6 || Math.abs(Math.abs(e.b[0]) - Math.abs(e.b[2])) > 1e-6; });
      assert(!off.length, off.length + ' drawn edges off the corner rulings, first ' + (off[0] && JSON.stringify([off[0].a, off[0].b])));
      // every mesh face is flat: no vertex off its plane by more than 1e-9 of the size
      r.mesh.faces.forEach(function (f) {
        f.polys.forEach(function (p) { p.vertices.forEach(function (v) { near(f.normal[0] * v.pos.x + f.normal[1] * v.pos.y + f.normal[2] * v.pos.z, f.w, 1e-8, 'face flatness'); }); });
      });
    });
    test('rfHL: a loft through squares still goes to STEP as four B-spline faces (corners are real edges): joinLoftPatches is only for full circles', function () {
      var r = build(SQUARES + 'p.loft([a, b, c]);'), step = Exchange.exportSTEP(r.model, r.build);
      assert((step.match(/B_SPLINE_SURFACE_WITH_KNOTS/g) || []).length === 4, 'B-spline faces');
    });
  })();
