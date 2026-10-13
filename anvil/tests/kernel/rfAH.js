  // ------------------------------------------------------------------ rfAH: Style Spline (one Bézier span of degree 3 / 5 / 7)
  (function () {
    group('rfAH: Style Spline — a single Bézier span shaped by its control polygon (degree 3, 5, 7)');
    // an arch of degree n: control vertices on a half sine, 10 apart, ends on y = 0
    function rfAHArch(n) { var P = []; for (var i = 0; i <= n; i++) P.push([i * 10, Math.round(30 * Math.sin(Math.PI * i / n) * 1000) / 1000]); return P; }
    // the exact area under the Bézier (Green, ½∮ x dy − y dx; Gauss-Legendre on 64 pieces: exact to rounding)
    function rfAHArea(P) {
      var g = [[-0.8611363115940526, 0.3478548451374538], [-0.3399810435848563, 0.6521451548625461], [0.3399810435848563, 0.6521451548625461], [0.8611363115940526, 0.3478548451374538]], a = 0, N = 64;
      for (var i = 0; i < N; i++) g.forEach(function (q) { var t = (i + 0.5 + q[0] / 2) / N, p = K.bzPoint(P, t), d = K.bzDeriv(P, t); a += q[1] / 2 / N * (p[0] * d[1] - p[1] * d[0]); });
      return a / 2;
    }
    function rfAHDist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
    test('rfAH: the Bézier runs through its first and last control vertex, tangent to the control polygon there; a piece (bzSub) and degree elevation are the same curve; lowering the degree keeps the ends and end tangent directions', function () {
      [3, 5, 7].forEach(function (n) {
        var P = rfAHArch(n);
        assert(rfAHDist(K.bzPoint(P, 0), P[0]) < 1e-12 && rfAHDist(K.bzPoint(P, 1), P[n]) < 1e-12, n + ': through the end vertices');
        var d0 = K.bzDeriv(P, 0), d1 = K.bzDeriv(P, 1);
        near(d0[0], n * (P[1][0] - P[0][0]), 1e-9, n + ': start tangent along the first leg (x)'); near(d0[1], n * (P[1][1] - P[0][1]), 1e-9, n + ': (y)');
        near(d1[0], n * (P[n][0] - P[n - 1][0]), 1e-9, n + ': end tangent along the last leg (x)'); near(d1[1], n * (P[n][1] - P[n - 1][1]), 1e-9, n + ': (y)');
        var S = K.bzSub(P, 0.25, 0.75), E = K.bzElevate(P);
        [0, 0.3, 0.5, 1].forEach(function (s) {
          assert(rfAHDist(K.bzPoint(S, s), K.bzPoint(P, 0.25 + 0.5 * s)) < 1e-9, n + ': piece at ' + s);
          assert(rfAHDist(K.bzPoint(E, s), K.bzPoint(P, s)) < 1e-9, n + ': elevated at ' + s);
        });
        if (n > 3) {
          var R = K.bzDegree(P, 3), r0 = K.bzDeriv(R, 0), cr = r0[0] * d0[1] - r0[1] * d0[0];
          assert(R.length === 4 && rfAHDist(R[0], P[0]) < 1e-12 && rfAHDist(R[3], P[n]) < 1e-12 && Math.abs(cr) < 1e-6 * Math.hypot(r0[0], r0[1]) * Math.hypot(d0[0], d0[1]), n + ' -> 3 keeps the ends and the start tangent');
          assert(rfAHDist(K.bzPoint(R, 0.5), K.bzPoint(P, 0.5)) < 2, n + ' -> 3 stays near: ' + rfAHDist(K.bzPoint(R, 0.5), K.bzPoint(P, 0.5)));
        }
        // splineGeom's cubic spans (what profiles and OpenCascade take) follow the true curve
        var g = K.splineGeom({ t: 'spline', style: true, pts: P }), worst = 0;
        assert(g.style && g.style.degree === n && !g.closed && g.bez.length === (n === 3 ? 1 : 8 * n), n + ': spans ' + g.bez.length);
        g.bez.forEach(function (B, j) { [0.25, 0.5, 0.75].forEach(function (s) { worst = Math.max(worst, rfAHDist(K.bezPoint(B, s), K.bzPoint(P, (j + s) / g.bez.length))); }); });
        assert(worst < 1e-6, n + ': cubic spans within 1e-6 of the Bézier: ' + worst);
      });
      return 'degree 3 / 5 / 7';
    });
    test('rfAH: a style spline closed by a line extrudes to its exact area × depth (degree 3 / 5 / 7); generateScript writes .styleSpline(pts, { degree }) and runScript reads back the same sketch and volume', function () {
      var out = [];
      [3, 5, 7].forEach(function (n) {
        var P = rfAHArch(n), m = K.newModel('rfAH' + n);
        K.runScript(m, 'p.sketch("Front").styleSpline(' + JSON.stringify(P) + ', { degree: ' + n + ' }).line(' + P[n][0] + ', ' + P[n][1] + ', 0, 0).extrude(5);');
        var b = K.rebuild(m);
        noErrors({ errors: b.errors });
        var v = K.massProps(K.meshFromBody(b.body), 1).volume, want = Math.abs(rfAHArea(P)) * 5;
        nearRel(v, want, 1e-6, n + ': volume');
        var e = m.features[0].entities[0];
        assert(e.t === 'spline' && e.style === true && e.pts.length === n + 1, n + ': entity ' + JSON.stringify(e));
        var src = K.generateScript(m);
        assert(src.indexOf('.styleSpline(' + JSON.stringify(P) + ', { degree: ' + n + ' })') >= 0, n + ': script ' + src);
        var m2 = K.newModel('rfAH' + n + 'b');
        K.runScript(m2, src);
        assert(JSON.stringify(m2.features[0].entities) === JSON.stringify(m.features[0].entities), n + ': same entities');
        nearRel(K.massProps(K.meshFromBody(K.rebuild(m2).body), 1).volume, v, 1e-9, n + ': same volume');
        out.push(n + ': ' + v.toFixed(3));
      });
      // a degree asked of fewer vertices elevates them (the same curve)
      var m3 = K.newModel('rfAHe');
      K.runScript(m3, 'p.sketch("Front").styleSpline([[0, 0], [10, 30], [30, 30], [40, 0]], { degree: 7 });');
      var e3 = m3.features[0].entities[0];
      assert(e3.pts.length === 8 && rfAHDist(K.bzPoint(e3.pts, 0.4), K.bzPoint([[0, 0], [10, 30], [30, 30], [40, 0]], 0.4)) < 1e-6, 'elevated to 7: ' + JSON.stringify(e3.pts));
      return out.join(', ');
    });
    test('rfAH: sketch DXF — R2000 writes a style spline as one SPLINE of its degree (n + 1 control vertices, clamped knots), read back by dxf-check; R12 as ARCs within tolerance that chain with the closing line into one loop (mm and in)', function () {
      if (typeof DxfCheck === 'undefined') { fail('DxfCheck is undefined'); return; }
      var out = [];
      [3, 5, 7].forEach(function (n) {
        var P = rfAHArch(n), m = K.newModel('rfAHd' + n), b = new K.Builder(m);
        b.sketch('Front').styleSpline(P).line(P[n][0], P[n][1], 0, 0);
        var f = m.features[0];
        var r2 = K.exportDXFSketch(f, 'mm', { version: 'R2000' }), sp = DxfCheck.parse(r2).entities.filter(function (e) { return e.type === 'SPLINE'; });
        assert(sp.length === 1 && sp[0].degree === n && sp[0].cps.length === n + 1, n + ': one SPLINE of degree n: ' + JSON.stringify(sp[0] && [sp[0].degree, sp[0].cps.length]));
        var kn = sp[0].knots;
        assert(kn.length === 2 * n + 2 && kn.slice(0, n + 1).every(function (t) { return t === kn[0]; }) && kn.slice(n + 1).every(function (t) { return t === kn[2 * n + 1]; }) && kn[2 * n + 1] > kn[0], n + ': clamped single-span knots ' + JSON.stringify(kn));
        sp[0].cps.forEach(function (q, i) { assert(rfAHDist(q, P[i]) < 1e-6, n + ': control vertex ' + i + ' ' + JSON.stringify(q)); });
        var c2 = DxfCheck.check(r2, { units: 'mm' });
        assert(c2.ok, n + ': R2000 sound: ' + JSON.stringify(c2.errors));
        ['mm', 'in'].forEach(function (u) {
          var r12 = K.exportDXFSketch(f, u), ents = DxfCheck.parse(r12).entities, arcs = ents.filter(function (e) { return e.type === 'ARC'; });
          assert(!ents.some(function (e) { return e.type === 'SPLINE'; }) && arcs.length > 2, n + '/' + u + ': ARCs, no SPLINE');
          var c = DxfCheck.check(r12, { units: u });
          assert(c.ok && c.loops.length === 1 && c.loops[0].closed, n + '/' + u + ': one closed loop ' + JSON.stringify([c.errors, c.loops]));
          if (u === 'mm') out.push(n + ': ' + arcs.length + ' arcs');
        });
      });
      return out.join(', ');
    });
    test('rfAH: Trim to closest keeps a style spline of the same degree (the Bézier\'s own piece) joined to the cutting line; Extend Entities carries it on to a line along its own polynomial; a point Coincident on it lies on the curve; Tangent to a line at its end runs the line along the first leg', function () {
      if (typeof SketchSolver === 'undefined') { fail('SketchSolver is undefined'); return; }
      var SS = SketchSolver, P5 = K.bzDegree([[0, 0], [10, 30], [30, 30], [40, 0]], 5);
      var s = { entities: [{ t: 'spline', style: true, pts: P5.map(function (q) { return q.slice(); }) }, { t: 'line', x1: 20, y1: -10, x2: 20, y2: 40 }] };
      var r = SS.trimAt(s, 0, [35, 10], {});
      assert(r.ok, 'trimmed: ' + JSON.stringify(r));
      var e = s.entities.filter(function (q) { return q.t === 'spline'; })[0];
      assert(e && e.style && e.pts.length === 6, 'still a style spline of degree 5: ' + JSON.stringify(e));
      assert(rfAHDist(e.pts[5], [20, 22.5]) < 1e-5 && rfAHDist(K.bzPoint(e.pts, 0.5), K.bzPoint(P5, 0.25)) < 1e-5, 'the left half of the same curve');
      assert((s.rels || []).some(function (q) { return q.type === 'coincident' && q.refs.join() === '0.p2,1'; }), 'new end on the line: ' + JSON.stringify(s.rels));
      var P = [[0, 0], [10, 30], [30, 30], [40, 0]];
      s = { entities: [{ t: 'spline', style: true, pts: P.map(function (q) { return q.slice(); }) }, { t: 'line', x1: 43, y1: -50, x2: 43, y2: 50 }] };
      r = SS.extendEntity(s, 0, [39, 1]);
      e = s.entities[0];
      assert(r.ok && e.pts.length === 4 && Math.abs(e.pts[3][0] - 43) < 1e-6, 'extended to x = 43: ' + JSON.stringify([r, e.pts]));
      var fc = SS.freeCurve({ t: 'spline', style: true, pts: P }), cl = SS.freeClosest(fc, e.pts[3]);
      assert(SS.freeClosest(SS.freeCurve(e), K.bzPoint(P, 1.05)).d < 1e-6 && SS.freeClosest(SS.freeCurve(e), K.bzPoint(P, 0.5)).d < 1e-6, 'on the carried-on polynomial (the old curve lies on the new)');
      s = { entities: [{ t: 'spline', style: true, pts: P.map(function (q) { return q.slice(); }) }, { t: 'point', x: 20, y: 25 }] };
      assert(SS.addRelation(s, 'coincident', ['1', '0']).ok, 'point on curve');
      SS.solve(s);
      fc = SS.freeCurve(s.entities[0]); cl = SS.freeClosest(fc, [s.entities[1].x, s.entities[1].y]);
      assert(cl.d < 1e-7, 'the point lies on the style spline: ' + cl.d);
      s = { entities: [{ t: 'spline', style: true, pts: P.map(function (q) { return q.slice(); }) }, { t: 'line', x1: -10, y1: 0, x2: 0, y2: 0 }], rels: [{ type: 'coincident', refs: ['1.p2', '0.p1'] }] };
      assert(SS.applicable(s, ['0', '1']).indexOf('tangent') >= 0 && SS.addRelation(s, 'tangent', ['0', '1']).ok, 'Tangent applies');
      SS.solve(s);
      var E0 = s.entities[0], L1 = s.entities[1], leg = [E0.pts[1][0] - E0.pts[0][0], E0.pts[1][1] - E0.pts[0][1]], ld = [L1.x2 - L1.x1, L1.y2 - L1.y1];
      assert(Math.abs(leg[0] * ld[1] - leg[1] * ld[0]) < 1e-6 * Math.hypot(leg[0], leg[1]) * Math.hypot(ld[0], ld[1]), 'the line runs along the first leg');
      var o = SS.offsetEntity({ t: 'spline', style: true, pts: P }, 2);
      assert(o && o.t === 'spline' && !o.style && o.pts.length >= 9, 'Offset: a spline through offset points');
      return 'trim, extend, coincident, tangent, offset';
    });
  })();
  // --- end rfAH ---
