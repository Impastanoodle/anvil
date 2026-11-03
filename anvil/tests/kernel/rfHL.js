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
  })();
