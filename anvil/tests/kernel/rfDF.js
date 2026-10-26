  // --- rfDF (2026-10-26, lane DF: reference geometry follow-ups) --- a reference Point "Center of Face" on a planar
  // face is the exact area centroid (Kernel.faceCentroidExact: the faceted face corrected by the circular segment of
  // every true-circle chord on its outline), not the facets' (≈0.004 off beside an 8 mm hole). The OpenCascade side
  // (patterns / revolves about a reference axis) is checked in occt-tests.html.
  (function () {
    group('rfDF: reference geometry follow-ups (exact Center of Face)');
    function rfDFPoint(r, name) { var f = r.model.features.filter(function (x) { return x.name === name; })[0]; assert(f, 'feature ' + name); return r.build.planes[f.id].p; }

    test('rfDF: Center of Face beside a through hole is the exact centroid on both caps (1e-9), and follows the hole when it moves', function () {
      var code = 'p.sketch("Front").rect(0, 0, 40, 30).end().extrude(10);\np.sketch("Front").circle(12, 15, 4).end().cut("through");\n' +
        'p.point("face", [{ face: [30, 15, 0] }]);\np.point("face", [{ face: [30, 15, 10] }]);';
      var r = build(code), A = 1200 - 16 * Math.PI;
      noErrors(r);
      nearVec(rfDFPoint(r, 'Point1'), [(1200 * 20 - 16 * Math.PI * 12) / A, 15, 0], 1e-9, 'back cap');
      nearVec(rfDFPoint(r, 'Point2'), [(1200 * 20 - 16 * Math.PI * 12) / A, 15, 10], 1e-9, 'front cap');
      r.model.features[2].entities[0].cx = 8; delete r.model.features[2].profile;   // the hole moves to x = 8: the points follow
      var b2 = K.rebuild(r.model), id = r.model.features.filter(function (x) { return x.name === 'Point1'; })[0].id;
      nearVec(b2.planes[id].p, [(1200 * 20 - 16 * Math.PI * 8) / A, 15, 0], 1e-9, 'after the hole moved');
      return 'x ' + fmt(rfDFPoint(r, 'Point1')[0]);
    });

    test('rfDF: Center of Face on a face with a round end (segments added), under a boss standing on it (taken off), and on an inch plate with two Ø.281 holes', function () {
      var r = build('p.sketch("Front").rect(0, 0, 40, 20).end().extrude(5);\np.sketch("Front").circle(40, 10, 10).end().extrude(5);\np.point("face", [{ face: [20, 10, 5] }]);');
      noErrors(r);
      var A2 = 800 + 50 * Math.PI, M2 = 800 * 20 + 50 * Math.PI * (40 + 40 / (3 * Math.PI));
      nearVec(rfDFPoint(r, 'Point1'), [M2 / A2, 10, 5], 1e-9, 'D-shaped face');
      var r2 = build('p.sketch("Front").rect(0, 0, 40, 30).end().extrude(5);\nvar pl = p.plane("Front", 5);\np.sketch(pl).circle(30, 15, 4).end().extrude(5);\np.point("face", [{ face: [5, 5, 5] }]);');
      noErrors(r2);
      nearVec(rfDFPoint(r2, 'Point1'), [(1200 * 20 - 16 * Math.PI * 30) / (1200 - 16 * Math.PI), 15, 5], 1e-9, 'face under a boss');
      var r3 = build('p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).end().extrude(0.075);\np.sketch("Front").circle(0.5, 0.5, 0.1405).circle(3.25, 1.5, 0.1405).end().cut("through");\np.point("face", [{ face: [2, 1, 0.075] }]);');
      noErrors(r3);
      var a = Math.PI * 0.1405 * 0.1405, A3 = 8 - 2 * a;
      nearVec(rfDFPoint(r3, 'Point1'), [(8 * 2 - a * 0.5 - a * 3.25) / A3, (8 * 1 - a * 0.5 - a * 1.5) / A3, 0.075], 1e-9, 'inch plate');
      return 'D x ' + fmt(rfDFPoint(r, 'Point1')[0]);
    });

    test('rfDF: Center of Face of a cylindrical face stays on its axis; Kernel.faceCentroidExact is null off a planar face', function () {
      var r = build('p.sketch("Top").circle(0, 0, 10).end().extrude(20);\np.point("face", [{ face: [10, 10, 0] }]);');
      noErrors(r);
      var p = rfDFPoint(r, 'Point1');
      near(Math.hypot(p[0], p[2]), 0, 1e-6, 'on the axis');
      assert(K.faceCentroidExact(r.body, [10, 10, 0], 0.01) === null, 'a curved face has no exact planar centroid');
      assert(K.faceCentroidExact(r.body, [100, 100, 100], 0.01) === null, 'nothing there');
      return 'y ' + fmt(p[1]);
    });
  })();
