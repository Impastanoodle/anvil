  // --- rfAY ---
  (function () {
    var K = window.Kernel, S = window.SketchSolver;
    group('rfAY: spline Curvature Control (tans[i][3], a driving curvature)');
    function rfAYk(e, i) { return K.splineCurvatureAt(e, i); }
    function rfAYc(o) { return JSON.parse(JSON.stringify(o)); }
    var base = { t: 'spline', pts: [[0, 0], [10, 5], [20, 0], [30, 5], [40, 0]] };
    test('rfAY: a curvature control holds its value on both sides of the point — interior, end, closed, local, asymmetric weights; the curve still passes through every point', function () {
      var e = rfAYc(base); e.tans = [null, null, [0, 15, null, 0.05], null, null];
      var k = rfAYk(e, 2);
      near(k.out, 0.05, 1e-9, 'leaving'); near(k['in'], 0.05, 1e-9, 'arriving');
      var g = K.splineGeom(e);
      for (var i = 0; i < 4; i++) { near(g.bez[i][0][0], e.pts[i][0], 1e-12, 'through x ' + i); near(g.bez[i][3][1], e.pts[i + 1][1], 1e-12, 'through y ' + i); }
      e.tans[2][3] = -0.2; near(rfAYk(e, 2).out, -0.2, 1e-9, 'the other way'); near(rfAYk(e, 2)['in'], -0.2, 1e-9, 'the other way, arriving');
      e.tans[2][3] = 0; near(rfAYk(e, 2).out, 0, 1e-9, 'flat'); near(rfAYk(e, 2)['in'], 0, 1e-9, 'flat, arriving');
      var l = rfAYc(e); l.local = true; l.tans[2][3] = 0.12; near(rfAYk(l, 2).out, 0.12, 1e-9, 'local'); near(rfAYk(l, 2)['in'], 0.12, 1e-9, 'local, arriving');
      var end = { t: 'spline', pts: [[0, 0], [10, 5], [20, 0]], tans: [[30, 12, null, 0.08], null, null] };
      near(rfAYk(end, 0).out, 0.08, 1e-9, 'an end point');
      var c = { t: 'spline', closed: true, pts: [[0, 0], [10, 0], [10, 10], [0, 10]], tans: [[-45, 10, null, -0.1], null, null, null] };
      near(rfAYk(c, 0).out, -0.1, 1e-9, 'closed'); near(rfAYk(c, 0)['in'], -0.1, 1e-9, 'closed, across the seam');
      var a = { t: 'spline', pts: [[0, 0], [10, 5], [20, 0], [30, 5]], tans: [null, [0, 10, 14, 0.1], null, null] };
      near(rfAYk(a, 1).out, 0.1, 1e-9, 'asymmetric'); near(rfAYk(a, 1)['in'], 0.1, 1e-9, 'asymmetric, arriving');
      return 'κ exact in 6 cases';
    });
    test('rfAY: with tangent-driving neighbours (as Add Curvature Control leaves them) the point\'s own speeds give the curvature, and a flat or reversed value lets the neighbour\'s tangent go', function () {
      var e = { t: 'spline', pts: [[0, 0], [10, 5], [20, 0], [30, 5]], tans: [[20, 10], [0, 10, null, 0.1], [-20, 10], null] };
      near(rfAYk(e, 1).out, 0.1, 1e-9, '+0.1 out'); near(rfAYk(e, 1)['in'], 0.1, 1e-9, '+0.1 in');
      e.tans[1][3] = -0.1; near(rfAYk(e, 1).out, -0.1, 1e-9, '-0.1 out'); near(rfAYk(e, 1)['in'], -0.1, 1e-9, '-0.1 in');
      e.tans[1][3] = 0; near(rfAYk(e, 1).out, 0, 1e-9, '0 out'); near(rfAYk(e, 1)['in'], 0, 1e-9, '0 in');
      return 'ok';
    });
    test('rfAY: without a curvature value the spline is exactly what it was; mirror turns the curvature over, Scale divides it, Rotate keeps it', function () {
      var e = rfAYc(base); e.tans = [null, null, [10, 12], null, null];
      var g0 = JSON.stringify(K.splineGeom(e)), e2 = rfAYc(e); e2.tans[2] = [10, 12, null];
      assert(JSON.stringify(K.splineGeom(e2)) === g0, 'a null weightIn changes nothing');
      e.tans[2] = [10, 12, null, 0.07];
      var m = K.mirrorEntity(e, K.mirrorAxis('y'));
      near(m.tans[2][3], -0.07, 1e-15, 'mirrored value'); near(rfAYk(m, 2).out, -0.07, 1e-9, 'mirrored curve');
      if (S && S.transformEntities) {
        var sk = { entities: [rfAYc(e)] };
        assert(S.transformEntities(sk, [0], { s: 2, cx: 0, cy: 0 }).ok, 'scaled');
        near(sk.entities[0].tans[2][3], 0.035, 1e-12, 'scaled value'); near(rfAYk(sk.entities[0], 2).out, 0.035, 1e-9, 'scaled curve');
        assert(S.transformEntities(sk, [0], { rot: 30, cx: 0, cy: 0 }).ok, 'rotated');
        near(rfAYk(sk.entities[0], 2).out, 0.035, 1e-9, 'rotated curve');
      }
      return 'ok';
    });
  })();
  // --- end rfAY ---
