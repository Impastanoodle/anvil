  // --- rfFP (2026-10-29, lane FP: fillet / chamfer refuse only what really cannot fit) --- every round lane FM's fit
  // probe refused in its fuzz (23 examples + 8 stock shapes; one chain / a face's edges / all edges; fillet and chamfer
  // at 5 % and 45 % of the shortest adjacent edge) was built on OpenCascade too: of 431 refusals OpenCascade failed 366;
  // of the 65 it built, 10 were rounds Anvil builds the same when let through (= OpenCascade to 1e-12 … 1.7e-3 of the
  // removed volume): a convex round whose setback leaves its face across the face's own corner at an end of the edge
  // (the mitre between two chamfers: the round runs out into air) and a concave arc ending on a rib wall across a hole
  // floor (probe points behind the wall). kernel-mesh.js: rfFPcorner, the arc chains' `walls`, K.fitProbe. The other
  // 55 stay refused: OpenCascade's "valid" solid cuts straight through a 2 mm wall (shelled box R9: the naive corner
  // volume), or Anvil's round would not match it (rounds overflowing into a hole / bore / boss, arcs on a cone pinching
  // out between hex flats, swept-tube facets, several selected edges meeting at a narrowing corner). Also (asked by
  // the head after lane FL made the BSP iterative): a saddle edge between two curved faces is refused, and no fillet /
  // chamfer result with open edges is ever returned (K.openGuard: checked in buildEdgeFeature, retried with the band
  // halved / doubled, else refused; the checked boolean is memoised for the rebuild).
  (function () {
    group('rfFP: fillet / chamfer refuse only what really cannot fit (checked against OpenCascade)');
    var REFUSE = /^Failed to create (fillet|chamfer)\. The (radius|distance) may be too large for the selected edges\.$/;
    var HANDLE = (typeof AnvilExamples !== 'undefined' ? AnvilExamples : []).filter(function (e) { return e.name === 'Rounded handle'; })[0];
    var CAP = (typeof AnvilExamples !== 'undefined' ? AnvilExamples : []).filter(function (e) { return e.name === 'Moulded cap'; })[0];
    function rfFPerr(r) { return Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(' | '); }
    function rfFPcase(code, kind, size, at, occtDelta, tol, label) {
      var base = build(code), r = build(code + '\np.' + kind + '(' + size + ', [' + JSON.stringify(at) + ']);');
      noErrors(r);
      var ck = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!ck.openEdges.length && !ck.nonManifoldEdges.length, label + ': open ' + ck.openEdges.length + ', non-manifold ' + ck.nonManifoldEdges.length);
      nearRel(r.mp.volume - base.mp.volume, occtDelta, tol, label + ' volume change vs OpenCascade');
    }

    test('rfFP: chamfers and rounds on the Rounded handle\'s base chamfer edges run out across the mitre at each corner (were refused: the setback left the chamfer face there); = OpenCascade', function () {
      assert(HANDLE, 'Rounded handle example');
      // chamfer .7794 on the edge between the base side and the 1 mm chamfer: OpenCascade removes 8.55815793074 (1e-12)
      rfFPcase(HANDLE.code, 'chamfer', 0.7794, [0, 5, -20], -8.55815793074, 1e-9, 'side / chamfer edge, chamfer .7794');
      // the diagonal mitre edge between two chamfer faces at a corner: chamfer .7794 (2e-11), R.7794 (1.7e-3: the
      // ends, where the round meets the top face and the vertical corner, are capped, not blended as OpenCascade does)
      rfFPcase(HANDLE.code, 'chamfer', 0.7794, [19.5, 5.5, -19.5], -0.528081384629, 1e-9, 'mitre edge, chamfer .7794');
      rfFPcase(HANDLE.code, 'fillet', 0.7794, [19.5, 5.5, -19.5], -0.0590890954227, 3e-3, 'mitre edge, R.7794');
    });

    test('rfFP: a small round in the Moulded cap\'s screw hole, split in two by the rib, ends on the rib wall (was refused: probe points behind the wall); = OpenCascade', function () {
      assert(CAP, 'Moulded cap example');
      // concave R.111 at the hole floor (y = 16) and chamfer .1251 at the hole bottom (y = 6), both half circles
      // ending on the rib: OpenCascade adds 0.00644573387763 / 0.0221020515983 mm³
      rfFPcase(CAP.code, 'fillet', 0.111, [0.1463, 16, 1.4856], 0.00644573387763, 5e-4, 'hole floor R.111');
      rfFPcase(CAP.code, 'chamfer', 0.1251, [-0.1463, 6, -1.4856], 0.0221020515983, 2e-4, 'hole bottom chamfer .1251');
    });

    test('rfFP: true refusals stay refused, the body before them kept: R1 in that 0.5 mm wide half hole (OpenCascade fails too), R9 on a shelled box\'s outer edge (OpenCascade\'s "valid" solid is the plain corner volume cut through the 2 mm walls)', function () {
      var cases = [
        [CAP.code, 'fillet', 0.9994, [0.1463, 16, 1.4856]],
        ['p.units("mm"); p.box(40, 20, 30); p.shell(2, [[20, 30, 10]]);', 'fillet', 9, [0, 0, 10]]
      ];
      cases.forEach(function (c, i) {
        var base = build(c[0]), r = build(c[0] + '\np.' + c[1] + '(' + c[2] + ', [' + JSON.stringify(c[3]) + ']);'), msg = rfFPerr(r);
        assert(REFUSE.test(msg), 'case ' + i + ': ' + msg);
        nearRel(r.mp.volume, base.mp.volume, 1e-12, 'case ' + i + ' keeps the body');
      });
    });

    test('rfFP: the saddle edge of a pipe tee (cylinder × cylinder) is refused cleanly, the body kept: its chord-by-chord tool was not planar (2e-3) and cracked, or added 11 % more than OpenCascade (which builds it)', function () {
      var TEE = 'p.cylinder(15, 80, { axis: "x", at: [-40, 0, 0] });\np.cylinder(10, 40, { at: [0, 0, 0] });\n';
      var base = build(TEE), r = build(TEE + 'p.fillet(3, [[0, Math.sqrt(125), 10]]);'), msg = rfFPerr(r);
      assert(/^Failed to create fillet\. Anvil's kernel cannot round an edge where two curved faces meet in a curve/.test(msg), msg);
      nearRel(r.mp.volume, base.mp.volume, 1e-12, 'body kept');
      // a straight edge along both faces' rulings still builds: two parallel cylinders' line of contact is not a saddle
    });

    test('rfFP: the guard: R.1 on the wheel\'s bottom rim after R.25 on its top rim and the dish leaves 6 open edges from the BSP (band halved or doubled too); the head\'s last retry with csg.js wide healing closes it, the same body as built in the other order; with healing off the BSP alone now closes it too (lane FV), the same body; a checked result is the one the rebuild uses', function () {
      var W = 'p.units("in");\np.sketch("Front").line(0,0,3,0).line(3,0,3,1.5).line(3,1.5,0,1.5).line(0,1.5,0,0).revolve(360);\n' +
        'var a = Math.asin((1.5-5)/4.1), x1 = 4.1*Math.cos(a);\np.sketch("Front").arc(0,5,4.1,-90,a*180/Math.PI).line(x1,1.5,x1,2).line(x1,2,0,2).line(0,2,0,0.9).revolveCut(360);\n' +
        'p.sketch("Front").arc(0,0.9,0.3,-90,90).line(0,1.2,0,0.6).revolveCut(360);\n';
      var base = build(W + 'p.fillet(0.25,[[3,1.5,0]]);'), r = build(W + 'p.fillet(0.25,[[3,1.5,0]]);\np.fillet(0.1,[[3,0,0]]);');
      noErrors(r);
      var cr = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!cr.openEdges.length && !cr.nonManifoldEdges.length, 'R.1 second: open ' + cr.openEdges.length + ', non-manifold ' + cr.nonManifoldEdges.length);
      // healing off: this used to leave the crack and be refused; since lane FV (csg.js: the classic path's far pieces go
      // through restoreWhole, so the fillet tools' own-tree pieces no longer overlap) the BSP alone closes it
      CSG.options.heal = false;
      try { var nh = build(W + 'p.fillet(0.25,[[3,1.5,0]]);\np.fillet(0.1,[[3,0,0]]);'); } finally { CSG.options.heal = true; }
      noErrors(nh);
      var cn = Evaluate.checkBody(nh.body, { maxPairs: 1 });
      assert(!cn.openEdges.length && !cn.nonManifoldEdges.length, 'healing off: open ' + cn.openEdges.length + ', non-manifold ' + cn.nonManifoldEdges.length);
      nearRel(nh.mp.volume, r.mp.volume, 1e-9, 'healing off = healing on');
      var first = build(W + 'p.fillet(0.1,[[3,0,0]]);\np.fillet(0.25,[[3,1.5,0]]);');
      noErrors(first);
      var ck = Evaluate.checkBody(first.body, { maxPairs: 1 });
      assert(!ck.openEdges.length && !ck.nonManifoldEdges.length, 'R.1 first: open ' + ck.openEdges.length);
      // the guard off gives the same body (the memo hands the checked boolean to the rebuild, it is not redone)
      Kernel.openGuard.on = false;
      try { var off = build(W + 'p.fillet(0.1,[[3,0,0]]);\np.fillet(0.25,[[3,1.5,0]]);'); } finally { Kernel.openGuard.on = true; }
      nearRel(first.mp.volume, off.mp.volume, 1e-12, 'guard on = guard off');
      nearRel(r.mp.volume, first.mp.volume, 1e-6, 'either order, one wheel');
      assert(first.body.polygons.length === off.body.polygons.length, 'same polygons: ' + first.body.polygons.length + ' vs ' + off.body.polygons.length);
    });
  })();
