  // ---- rfAS (2026-10-13): Parabola and Conic (rational quadratic splines), their regions, DXF and script
  (function () {
    group('rfAS: Parabola / Conic regions, DXF, script round trip; the conic geometry');
    function rfASConicArea(e) {   // the area between the exact conic and its chord (fine polygon of K.conicPoint)
      var c = K.conicData(e), A = 0, N = 40000;
      for (var k = 0; k < N; k++) { var a = K.conicPoint(c, k / N), b = K.conicPoint(c, (k + 1) / N); A += (a[0] * b[1] - b[0] * a[1]) / 2; }
      return Math.abs(A + (c.P2[0] * c.P0[1] - c.P0[0] * c.P2[1]) / 2);
    }
    test('rfAS: a parabola region (top vertex (5, 10), ends (0, 0) and (10, 0)) extruded 2 is 2/3 of base x height x depth', function () {
      var r = build('p.sketch("Front").parabola([0, 0], [5, 10], [10, 0]).line(10, 0, 0, 0).end().extrude(2);');
      assert(!(r.errors && r.errors.length), 'no errors: ' + JSON.stringify(r.errors));
      nearRel(r.mp.volume, 2 / 3 * 10 * 5 * 2, 1e-6, 'parabola region volume');
      var e = r.model.features[0].entities[0];
      assert(e.t === 'spline' && e.conic === 0.5 && e.parabola, 'a parabola entity');
      return fmt(r.mp.volume);
    });
    test('rfAS: a conic with rho = 0.4142 (w = cos 45°) through (10, 0), top vertex (10, 10), (0, 10) is a quarter circle: the quarter disk is 25π', function () {
      var rho = Math.SQRT1_2 / (1 + Math.SQRT1_2);
      var r = build('p.sketch("Front").conic([10, 0], [10, 10], [0, 10], ' + rho + ').line(0, 10, 0, 0).line(0, 0, 10, 0).end().extrude(1);');
      assert(!(r.errors && r.errors.length), 'no errors: ' + JSON.stringify(r.errors));
      nearRel(r.mp.volume, 25 * Math.PI, 1e-6, 'quarter disk');
      var c = K.conicData(r.model.features[0].entities[0]);
      for (var k = 0; k <= 8; k++) { var p = K.conicPoint(c, k / 8); near(Math.hypot(p[0], p[1]), 10, 1e-9, 'on the circle ' + k); }
      return fmt(r.mp.volume);
    });
    test('rfAS: conic regions for rho 0.3 / 0.6 / 0.8 extrude to the exact conic area (within 1e-6), the curve within 1e-6 of its size of the rational conic', function () {
      var out = [];
      [0.3, 0.6, 0.8].forEach(function (rho) {
        var r = build('p.sketch("Front").conic([0, 0], [5, 10], [10, 0], ' + rho + ').line(10, 0, 0, 0).end().extrude(1);');
        var e = r.model.features[0].entities[0], want = rfASConicArea(e);
        nearRel(r.mp.volume, want, 1e-6, 'rho ' + rho);
        var c = K.conicData(e), g = K.splineGeom(e), fc = SketchSolver.freeCurve(e), m = 0;
        for (var k = 0; k <= 64; k++) m = Math.max(m, SketchSolver.freeClosest(fc, K.conicPoint(c, k / 64)).d);
        assert(m < 1e-5, 'rho ' + rho + ' deviation ' + m);
        assert(g.bez.length === 16 && Math.abs(g.bez[0][0][0]) < 1e-12 && Math.abs(g.bez[15][3][0] - 10) < 1e-12, 'spans run end to end');
        out.push(fmt(r.mp.volume));
      });
      return out.join(' ');
    });
    test('rfAS: moving a conic\'s points keeps it a conic of the same rho (the top vertex follows the shoulder point)', function () {
      var e = { t: 'spline', pts: [[0, 0], [5, 3], [10, 0]], conic: 0.6 }, c = K.conicData(e);
      near(c.T[1], 5, 1e-12, 'top vertex from the shoulder'); near(c.w, 1.5, 1e-12, 'weight');
      e.pts[2] = [12, 4];
      var c2 = K.conicData(e), p = K.conicPoint(c2, 0.5);
      near(p[0], 5, 1e-12, 'shoulder x'); near(p[1], 3, 1e-12, 'shoulder y');
      return c2.T.map(fmt).join(', ');
    });
    test('rfAS: sketch DXF writes a conic / parabola as SPLINE (R2000) and as ARCs (R12); the script round-trips them', function () {
      var r = build('p.sketch("Front").conic([0, 0], [5, 10], [10, 0], 0.7).parabola([0, 20], [5, 30], [10, 20]).end();');
      var s = r.model.features[0];
      var ents = sketchDxfEnts(K.exportDXFSketch(s, 'mm', { version: 'R2000' }));
      assert(ents.filter(function (x) { return x.t === 'SPLINE'; }).length === 2, 'two SPLINEs: ' + ents.map(function (x) { return x.t; }).join(' '));
      var r12 = sketchDxfEnts(K.exportDXFSketch(s, 'mm', { version: 'R12' }));
      assert(r12.length >= 2, 'R12 entities written');
      var code = K.generateScript(r.model);
      assert(/conic: 0\.7/.test(code) && /parabola: true/.test(code), 'script keeps conic / parabola: ' + code);
      var m2 = K.newModel('RT'); K.runScript(m2, code);
      assert(JSON.stringify(m2.features[0].entities) === JSON.stringify(s.entities), 'same entities after the round trip');
      return ents.length + ' / ' + r12.length;
    });
  })();
  // --- end rfAS ---
