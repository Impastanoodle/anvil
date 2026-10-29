  // --- rfFK (2026-10-29, lane FK: fillets between a revolved torus / sphere face and a plane) --- a round where a plane
  // square to the axis meets a revolved arc (a dish wall cut with an arc, a ball dimple, a dome on a plate) is a torus
  // tangent to the plane and to the tube circle (kernel-mesh.js rfFKcircInfo / rfFKsection): it carries a 'tor' record,
  // the step left between the wall's facets and the round a 'cone' record, so the volume is the exact one (Green /
  // Pappus on the section) and does not move with the Image Quality angular limit. Before, the edge took the straight
  // edgeTool against one facet: no record, 1e-4 off and 5e-4 apart between maxAngle 0 and 12 (rfFG GROOVE).
  (function () {
    group('rfFK: fillets between a torus / sphere face and a plane are exact tori');
    var PI = Math.PI;
    // 2π ∮ ρ²/2 dz over a section given as segments: ['l', a, b] lines, ['a', c, r, t0, t1] arcs (closed form)
    function rfFKvol(segs) {
      var I = 0;
      segs.forEach(function (s) {
        if (s[0] === 'l') { var a = s[1], b = s[2]; I += (a[0] * a[0] + a[0] * b[0] + b[0] * b[0]) / 6 * (b[1] - a[1]); return; }
        var c = s[1][0], r = s[2];
        function F(t) { var sn = Math.sin(t); return (c * c * r * sn + c * r * r * (t + Math.sin(2 * t) / 2) + r * r * r * (sn - sn * sn * sn / 3)) / 2; }
        I += F(s[4]) - F(s[3]);
      });
      return 2 * PI * I;
    }
    function rfFKbuild(code, maxAngle) {
      var prev = K.setTessellation();
      try {
        K.setTessellation({ chordTol: 0.002, minSegs: 16, maxSegs: 128, legacy: false, maxAngle: maxAngle });
        var r = build(code), q = K.meshQuality(r.mesh);
        // a tangent chord nearly in the plane cracked that face (BSP 1e-5): rfFKfirst keeps the first chord off it
        assert(q.openEdges === 0, 'open edges: ' + q.openEdges);
        return r;
      } finally { K.setTessellation(prev); }
    }
    function rfFKtori(r) { return K.curveSurfaces(r.mesh).filter(function (s) { return s.surf.t === 'tor'; }).map(function (s) { return s.surf; }); }
    var BASE = 'p.units("in");\np.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);\n' +
      'p.sketch("Front").line(0,1.0,1.9,1.0).arc(1.9,1.6,0.6,-90,0).line(2.5,1.6,0,1.6).line(0,1.6,0,1.0).revolveCut(360);\n';

    test('rfFK: R0.15 round where a torus dish wall meets the top: a torus R 1.9+√0.5, r 0.15, exact volume at maxAngle 0 and 12', function () {
      var code = BASE + 'p.fillet(0.15,[[2.5,1.5,0]]);\n';
      var fx = 1.9 + Math.sqrt(0.5), tp = [1.9 + 0.6 * (fx - 1.9) / 0.75, 1.6 - 0.6 * 0.25 / 0.75];
      var exact = rfFKvol([['l', [0, 0], [3, 0]], ['l', [3, 0], [3, 1.5]], ['l', [3, 1.5], [fx, 1.5]],
        ['a', [fx, 1.35], 0.15, PI / 2, Math.atan2(tp[1] - 1.35, tp[0] - fx)], ['a', [1.9, 1.6], 0.6, Math.atan2(tp[1] - 1.6, tp[0] - 1.9), -PI / 2],
        ['l', [1.9, 1], [0, 1]]]);
      var r0 = rfFKbuild(code, 0), r12 = rfFKbuild(code, 12);
      noErrors(r12);
      // the residual (≈ 8e-9) is the dish wall's own: where its facets meet the top plane the columns from the tube
      // centre are not square to the plane (the bare dish without the round is off by as much)
      nearRel(r0.mp.volume, exact, 2e-8, 'volume at maxAngle 0');
      nearRel(r12.mp.volume, exact, 2e-8, 'volume at maxAngle 12');
      var T = rfFKtori(r12).filter(function (s) { return Math.abs(s.r - 0.15) < 1e-9; });
      assert(T.length === 1, 'one R0.15 torus record: ' + T.length);
      near(T[0].R, fx, 1e-9, 'round torus major radius');
      return 'exact ' + exact.toFixed(9) + ', Anvil ' + r0.mp.volume.toFixed(9) + ' / ' + r12.mp.volume.toFixed(9);
    });

    test('rfFK: R0.1 round on a ball dimple (sphere meets plane, convex): torus R √0.35, exact', function () {
      var code = 'p.units("in");\np.sketch("Front").line(0,0,2,0).line(2,0,2,1).line(2,1,0,1).line(0,1,0,0).revolve(360);\n' +
        'p.sketch("Front").arc(0,1,0.5,-90,90).line(0,1.5,0,0.5).revolveCut(360);\np.fillet(0.1,[[0.5,1,0]]);\n';
      var fx = Math.sqrt(0.35), pB = [fx * 0.5 / 0.6, 1 - 0.1 * 0.5 / 0.6];
      var exact = rfFKvol([['l', [0, 0], [2, 0]], ['l', [2, 0], [2, 1]], ['l', [2, 1], [fx, 1]],
        ['a', [fx, 0.9], 0.1, PI / 2, Math.atan2(pB[1] - 0.9, pB[0] - fx)], ['a', [0, 1], 0.5, Math.atan2(pB[1] - 1, pB[0]), -PI / 2],
        ['l', [0, 0.5], [0, 0]]]);
      var r = rfFKbuild(code, 12);
      noErrors(r);
      nearRel(r.mp.volume, exact, 1e-9, 'volume');
      var T = rfFKtori(r).filter(function (s) { return Math.abs(s.r - 0.1) < 1e-9; });
      assert(T.length === 1 && Math.abs(T[0].R - fx) < 1e-9, 'one R0.1 torus at R √0.35: ' + JSON.stringify(T.map(function (s) { return [s.R, s.r]; })));
      return 'exact ' + exact.toFixed(9) + ', Anvil ' + r.mp.volume.toFixed(9);
    });

    test('rfFK: R0.2 round at the root of a dome on a plate (sphere meets plane, concave: material added): exact', function () {
      var code = 'p.units("in");\np.sketch("Front").line(0,0,2,0).line(2,0,2,1).line(2,1,0,1).line(0,1,0,0).revolve(360);\n' +
        'p.sketch("Front").line(0,1,1,1).arc(0,1,1,0,90).line(0,2,0,1).revolve(360);\np.fillet(0.2,[[1,1,0]]);\n';
      var fx = Math.sqrt(1.44 - 0.04), pB = [fx / 1.2, 1 + 0.2 / 1.2];
      var exact = rfFKvol([['l', [0, 0], [2, 0]], ['l', [2, 0], [2, 1]], ['l', [2, 1], [fx, 1]],
        ['a', [fx, 1.2], 0.2, -PI / 2, Math.atan2(pB[1] - 1.2, pB[0] - fx)], ['a', [0, 1], 1, Math.atan2(pB[1] - 1, pB[0]), PI / 2],
        ['l', [0, 2], [0, 0]]]);
      var r = rfFKbuild(code, 12);
      noErrors(r);
      nearRel(r.mp.volume, exact, 1e-9, 'volume');
      var T = rfFKtori(r).filter(function (s) { return Math.abs(s.r - 0.2) < 1e-9; });
      assert(T.length === 1 && Math.abs(T[0].R - fx) < 1e-9, 'one R0.2 torus at R √1.4: ' + JSON.stringify(T.map(function (s) { return [s.R, s.r]; })));
      return 'exact ' + exact.toFixed(9) + ', Anvil ' + r.mp.volume.toFixed(9);
    });

    test('rfFK: R0.15 round on a shallow spherical dish (wall 31° to the top, a 31° round): closed mesh, exact torus', function () {
      var a = Math.asin(-3.5 / 4.1), x1 = 4.1 * Math.cos(a);
      var code = 'p.units("in");\np.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);\n' +
        'p.sketch("Front").arc(0,5,4.1,-90,' + a * 180 / PI + ').line(' + x1 + ',1.5,' + x1 + ',2).line(' + x1 + ',2,0,2).line(0,2,0,0.9).revolveCut(360);\n' +
        'p.fillet(0.15,[[' + x1 + ',1.5,0]]);\n';
      var fy = 1.35, fx = Math.sqrt(4.25 * 4.25 - 3.65 * 3.65), pB = [fx * 4.1 / 4.25, 5 - 3.65 * 4.1 / 4.25];
      var exact = rfFKvol([['l', [0, 0], [3, 0]], ['l', [3, 0], [3, 1.5]], ['l', [3, 1.5], [fx, 1.5]],
        ['a', [fx, fy], 0.15, PI / 2, Math.atan2(pB[1] - fy, pB[0] - fx)], ['a', [0, 5], 4.1, Math.atan2(pB[1] - 5, pB[0]), -PI / 2],
        ['l', [0, 0.9], [0, 0]]]);
      var r = rfFKbuild(code, 12);
      noErrors(r);
      nearRel(r.mp.volume, exact, 1e-9, 'volume');
      return 'exact ' + exact.toFixed(9) + ', Anvil ' + r.mp.volume.toFixed(9);
    });
  })();
