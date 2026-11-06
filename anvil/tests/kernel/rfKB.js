  // --- rfKB (2026-11-06, lane stepout-2) --- STEP: a bend cut obliquely by a plane is written as its CYLINDRICAL_SURFACE
  // bounded by the true ELLIPSE of the cut (was planar facets), and Anvil's reader reads ELLIPSE edges on cylinders, so
  // the round trip is exact. A bend is written whole: when one side of it must stay faceted the other side does too.
  (function () {
    group('rfKB: STEP ELLIPSE edges (bends cut obliquely: true cylinders, exact round trip), whole bends only');
    var T = 0.0598, HEAD = 'p.name("Bracket").units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    var LB = HEAD + 'p.flange(1.5, [[2, 0.0598, 0]], { position: "inside" });\n';
    function rfKBcount(text, re) { return (text.match(re) || []).length; }
    function rfKBtrip(code) {
      var src = build(code); noErrors(src);
      var step = Exchange.exportSTEP(src.model, src.build, { faceted: true });
      var m = Exchange.newPartFromImport(Exchange.importFile('part.step', step, { units: src.model.units }));
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      return { src: src, step: step, back: { mesh: mesh, mp: K.massProps(mesh) } };
    }
    function rfKBsame(r, rel) {
      nearRel(r.back.mp.volume, r.src.mp.volume, rel || 1e-6, 'round trip volume');
      for (var k = 0; k < 3; k++) { near(r.back.mp.bbox.min[k], r.src.mp.bbox.min[k], 1e-9, 'box min ' + k); near(r.back.mp.bbox.max[k], r.src.mp.bbox.max[k], 1e-9, 'box max ' + k); }
      var q = K.meshQuality(r.back.mesh);
      assert(q.closed && !q.openEdges && !q.nonManifoldEdges, 'read back closed ' + JSON.stringify(q));
    }

    test('rfKB: L-bracket with a corner cut off across the bend at an angle: both bend faces are cylinders bounded by an ELLIPSE (a = r / |n·d|, b = r), 13 faces, round trip exact', function () {
      var r = rfKBtrip(LB + 'p.sketch("Front").polyline([[3, -1], [5, -1], [5, 3]], true).end().extrude(1, { cut: true, through: true, both: true });\n');
      assert(rfKBcount(r.step, /CYLINDRICAL_SURFACE\(/g) === 2, 'bend cylinders: ' + rfKBcount(r.step, /CYLINDRICAL_SURFACE\(/g));
      assert(rfKBcount(r.step, /=ELLIPSE\(/g) === 2, 'one ellipse per bend face: ' + rfKBcount(r.step, /=ELLIPSE\(/g));
      assert(rfKBcount(r.step, /ADVANCED_FACE\(/g) === 13, 'no facets: ' + rfKBcount(r.step, /ADVANCED_FACE\(/g));
      // the cut's plane holds the line (3, -1) -> (5, 3) of the Front sketch: |n·x| = 4 / √20, so a = r·√20 / 4
      var radii = [];
      r.step.replace(/=ELLIPSE\('',#\d+,([^,]+),([^)]+)\)/g, function (m0, a, b) { radii.push([+a, +b]); return m0; });
      radii.sort(function (p, q) { return p[1] - q[1]; });
      near(radii[0][1], T, 1e-12, 'inner b = R'); near(radii[1][1], 2 * T, 1e-12, 'outer b = R + T');
      near(radii[0][0], T * Math.sqrt(20) / 4, 1e-12, 'inner a'); near(radii[1][0], 2 * T * Math.sqrt(20) / 4, 1e-12, 'outer a');
      rfKBsame(r);
    });

    test('rfKB: both ends of the bend cut obliquely and a hole in the base: 4 ELLIPSE edges, 3 cylinders, round trip exact', function () {
      var r = rfKBtrip(LB + 'p.sketch("Front").polyline([[3, -1], [5, -1], [5, 3]], true).polyline([[1, -1], [-1, -1], [-1, 2]], true).end().extrude(1, { cut: true, through: true, both: true });\n' +
        'p.sketch("Top").circle(2, -1.5, 0.25).end().extrude(1, { cut: true, through: true });\n');
      assert(rfKBcount(r.step, /CYLINDRICAL_SURFACE\(/g) === 3, 'cylinders ' + rfKBcount(r.step, /CYLINDRICAL_SURFACE\(/g));
      assert(rfKBcount(r.step, /=ELLIPSE\(/g) === 4, 'ellipses ' + rfKBcount(r.step, /=ELLIPSE\(/g));
      rfKBsame(r);
    });

    test('rfKB: a square-cut bend keeps CIRCLE edges (no ELLIPSE where none is needed)', function () {
      var r = rfKBtrip(LB);
      assert(rfKBcount(r.step, /=ELLIPSE\(/g) === 0 && rfKBcount(r.step, /CYLINDRICAL_SURFACE\(/g) === 2, 'circles only');
      rfKBsame(r);
    });

    test('rfKB: 4-edge mitred tray and Closed Corner box: bends written whole or not at all, read back closed at the same box, no worse than facets (their outer bends end on faceted mitre faces: kernel, report)', function () {
      var tray = rfKBtrip(HEAD + 'p.flange(1, [[2, 0.0598, 0], [4, 0.0598, 1.5], [2, 0.0598, 3], [0, 0.0598, 1.5]], { position: "inside" });\n');
      rfKBsame(tray, 6e-4);
      var box = rfKBtrip(HEAD + '[[2, 0.0598, 0], [4, 0.0598, 1.5], [2, 0.0598, 3], [0, 0.0598, 1.5]].forEach(function (e) { p.flange(1, [e], { position: "inside", lengthRef: "outer" }); });\n' +
        'p.closedCorner([[0.0299, 0.6, 0.1196], [3.8804, 0.6, 2.9701], [0.0299, 0.6, 2.8804]], { cornerType: "butt", gap: 0.01 });\n');
      rfKBsame(box, 5e-4);
      // every written cylinder has its partner across the sheet (no half-exact bend)
      [tray, box].forEach(function (r) {
        var rs = [];
        r.step.replace(/CYLINDRICAL_SURFACE\('',#\d+,([^)]+)\)/g, function (m0, rr) { rs.push(+rr); return m0; });
        var inner = rs.filter(function (x) { return Math.abs(x - T) < 1e-9; }).length, outer = rs.filter(function (x) { return Math.abs(x - 2 * T) < 1e-9; }).length;
        assert(inner === outer, 'whole bends: ' + inner + ' inner, ' + outer + ' outer');
      });
    });
  })();
  // --- end rfKB ---
