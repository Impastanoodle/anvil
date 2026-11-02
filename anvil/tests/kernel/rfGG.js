  // --- rfGG (2026-11-02, lane rounds: fillets and chamfers SolidWorks builds and Anvil refused) --- the second SolidWorks
  // reference (test-reports/2026-11-02-solidworks-reference-2.md section 1) found the fit probe's refusals false. What
  // SolidWorks does, measured here row by row (kernel-mesh.js, block rfGG and buildEdgeFeature):
  // - a round larger than the corner round its chain runs round: the two straight rounds run on past it until they meet;
  //   a chamfer stops there, its plane running on through the corner round (rfGGcrosses, rfGGrun, capFor);
  // - a convex round on a rim narrower than its setback keeps the tangent ball, cut through the wall (body − tool);
  // - a concave round with no plane under it rests on the hole's rim or the plate's edge, a convex one on the root of a
  //   boss (rfGGstations, rfGGring: per-station rings);
  // - a convex round on a wall shorter than the round rests on the wall's far rim (rfGGshortWall);
  // - a saddle between two curved faces: a ball swept along the true curve, a chamfer the chord between its contacts
  //   (rfGGsaddleTool).
  (function () {
    group('rfGG: fillets and chamfers SolidWorks builds');
    function rfGGerr(r) { return Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(' | '); }
    function rfGGclosed(r, label) {
      assert(!rfGGerr(r), label + ': ' + rfGGerr(r));
      var ck = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!ck.openEdges.length && !ck.nonManifoldEdges.length, label + ': open ' + ck.openEdges.length + ', non-manifold ' + ck.nonManifoldEdges.length);
    }
    // a row: script, SolidWorks' volume, the relative tolerance it is held to
    function rfGGrow(name, code, sw, tol, note) {
      test('rfGG: ' + name + ': closed, = SolidWorks ' + sw + ' to ' + tol + (note ? ' (' + note + ')' : ''), function () {
        var r = build(code);
        rfGGclosed(r, name);
        nearRel(r.mp.volume, sw, tol, name);
        return 'volume ' + r.mp.volume.toFixed(6) + ', off by ' + ((r.mp.volume - sw) / sw).toExponential(2);
      });
    }
    var PI6 = Math.PI / 6, IN = 'p.units("in");\n', PLATE = IN + 'p.sketch("Top").rect(0, -4, 3.75, 4).end().extrude(0.25);\np.fillet(0.03, [[0, 0.125, 4]]);\n';
    var SHELL = 'p.units("mm");\np.box(40, 20, 30);\np.shell(2, [[20, 30, 10]]);\n', RIM = '[[40, 30, 10], [20, 30, 0], [0, 30, 10], [20, 30, 20]]';
    var BOSSH = 'p.units("mm");\np.box(60, 60, 10);\np.sketch("Top", 10).circle(30, -30, 10).extrude(15);\np.sketch("Top", 10).circle(45, -30, 3).end().cut("through", { reverse: true });\n';
    var TEE = 'p.units("mm");\np.cylinder(15, 80, { axis: "x", at: [-40, 0, 0] });\np.cylinder(10, 40, { at: [0, 0, 0] });\n';
    var TEEIN = IN + 'p.cylinder(1, 6, { axis: "x", at: [-3, 0, 0] });\np.cylinder(0.5, 3, { at: [0, 0, 0] });\n';

    // 1. larger than the corner round
    rfGGrow('R.0625 round a R.03 corner', PLATE + 'p.fillet(0.0625, [[1.875, 0.25, 4]]);', 3.7434737, 5e-6);
    rfGGrow('chamfer .0625 at a R.03 corner: the chamfer stops, its plane runs on through the round', PLATE + 'p.chamfer(0.0625, [[1.875, 0.25, 4]]);', 3.7426384, 1e-6);
    rfGGrow('rfFT 104', IN + 'p.sketch("Top").rect(0, -2, 5.5, 2).end().extrude(0.5);\np.sketch("Top", 1.5).circle(2.5294, -1.3929, 0.25).end().cut("through", { reverse: true });\np.fillet(0.03, [[0, 0.25, 0]]);\np.fillet(0.125, [[0, 0.5, 1]]);', 5.376772, 5e-6);
    rfGGrow('rfFT 136', IN + 'p.sketch("Top").rect(0, -3.75, 5.5, 3.75).end().extrude(0.25);\np.sketch("Top", 0.25).circle(4.5614, -1.5015, 0.25).end().extrude(1);\np.fillet(0.03, [[5.5, 0.125, 0]]);\np.fillet(0.0625, [[5.5, 0.25, 1.875]]);', 5.3448172, 5e-6);
    rfGGrow('rfFT 198', IN + 'p.sketch("Top").rect(0, -4, 6, 4).end().extrude(0.75);\np.chamfer(0.25, [[0, 0.75, 2]]);\np.fillet(0.0625, [[3, 0.75, 0]]);\np.chamfer(0.125, [[6, 0.75, 2]]);', 17.8389986, 1e-6);
    rfGGrow('rfGA 82, its chamfer', IN + 'p.sketch("Top").centerRect(0, 0, 4.75, 2.25).end().extrude(0.375);\np.fillet(0.03, [[0, 0.375, 1.125]]);\np.chamfer(0.25, [[-2.375, 0.1875, 1.125]]);', 3.9952317, 3e-6);

    // 2. the shelled rim
    rfGGrow('R7.2 on the 2 mm shelled rim', SHELL + 'p.fillet(7.2, ' + RIM + ');', 7015.9280023, 5e-6);
    rfGGrow('R2.5 on the 2 mm shelled rim', SHELL + 'p.fillet(2.5, ' + RIM + ');', 7717.8062078, 1.5e-5, 'the four corners; R1.9, under the wall, is 2.1e-5 off too');
    test('rfGG: the rim\'s height is the arc\'s trace on the inner wall, as SolidWorks: 27.77996 for R7.2, 29.94949 for R2.5, to the facets\' sagitta', function () {
      near(build(SHELL + 'p.fillet(7.2, ' + RIM + ');').mp.bbox.max[1], 27.77996, 0.03, 'R7.2');   // the facets' chord, not the arc: 27.759
      near(build(SHELL + 'p.fillet(2.5, ' + RIM + ');').mp.bbox.max[1], 29.94949, 0.06, 'R2.5');
    });

    // 3. no plane under the ball
    rfGGrow('concave R.4 over a hole', IN + 'p.sketch("Top").centerRect(0, 0, 4, 4).end().extrude(0.5);\np.sketch("Top", 0.5).circle(0, 0, 0.5).end().extrude(1);\np.sketch("Top", 0.5).circle(1, 0, 0.25).end().cut("through", { reverse: true });\np.fillet(0.4, [[0.5, 0.5, 0]]);', 8.8128518, 3e-5, 'the ball rests on the rim');
    rfGGrow('concave R.4 off the plate', IN + 'p.sketch("Top").centerRect(0, 0, 4, 4).end().extrude(0.5);\np.sketch("Top", 0.5).circle(1.25, 0, 0.5).end().extrude(1);\np.fillet(0.4, [[1.75, 0.5, 0]]);', 8.9086579, 2e-5, 'the ball rests on the plate\'s edge');
    rfGGrow('R3.981 on a hole rim, its setback under a boss', BOSSH + 'p.fillet(3.981, [[47.971178, 10, 29.707365]]);', 40351.1211501, 1e-5, 'the ball rests on the boss root; 8.6e-5 before');
    rfGGrow('R16 on that hole rim, off the plate and past the 10 mm wall', BOSSH + 'p.fillet(16, [[47.971178, 10, 29.707365]]);', 39019.5607681, 2e-4, 'the ball rests on the hole\'s bottom rim; a torus cut by the plate side: curveCorrection is the 1.5e-4');
    test('rfGG: the hole stays open through a round that rests on its rim, and no material hangs off the plate', function () {
      var r = build(IN + 'p.sketch("Top").centerRect(0, 0, 4, 4).end().extrude(0.5);\np.sketch("Top", 0.5).circle(0, 0, 0.5).end().extrude(1);\np.sketch("Top", 0.5).circle(1, 0, 0.25).end().cut("through", { reverse: true });\np.fillet(0.4, [[0.5, 0.5, 0]]);');
      var inside = r.body.pointTester();
      for (var a = 0; a < 12; a++) [0.05, 0.2].forEach(function (rr) { [0.45, 0.505, 0.55].forEach(function (y) { assert(!inside([1 + rr * Math.cos(a * PI6), y, rr * Math.sin(a * PI6)]), 'material in the hole at ' + a + ', ' + y); }); });
      var o = build(IN + 'p.sketch("Top").centerRect(0, 0, 4, 4).end().extrude(0.5);\np.sketch("Top", 0.5).circle(1.25, 0, 0.5).end().extrude(1);\np.fillet(0.4, [[1.75, 0.5, 0]]);');
      near(o.mp.bbox.max[0], 2, 1e-9, 'plate edge');
    });

    // 4. fuzz stacks
    rfGGrow('rfFT 55', IN + 'p.sketch("Top").rect(0, -4.25, 5.5, 4.25).end().extrude(0.375);\np.sketch("Top", 0.375).circle(1.7055, -3.5111, 0.5).end().extrude(0.5);\np.sketch("Top", 1.375).circle(5.0897, -3.5948, 0.1).circle(4.6745, -2.4393, 0.25).end().cut("through", { reverse: true });\np.fillet(0.125, [[2.2055, 0.875, 3.5111]]);\np.fillet(0.25, [[2.2055, 0.375, 3.5111]]);', 9.1098022, 1e-5);
    rfGGrow('rfFT 388', IN + 'p.sketch("Top").rect(0, -2.25, 3.75, 2.25).end().extrude(0.75);\np.sketch("Top", 0.75).circle(0.7124, -1.3513, 0.375).end().extrude(0.25);\np.sketch("Top", 1.75).circle(0.4299, -0.9034, 0.1).circle(1.2434, -1.4918, 0.1).circle(2.5171, -1.4792, 0.133).end().cut("through", { reverse: true });\np.fillet(0.03, [[1.0874, 1, 1.3513]]);\np.fillet(0.125, [[1.0874, 0.75, 1.3513]]);', 6.3575643, 1e-5);
    rfGGrow('rfFT 303', IN + 'p.sketch("Top").rect(0, -4.25, 4.5, 4.25).end().extrude(0.5);\np.sketch("Top", 0.5).circle(3.0783, -0.8758, 0.25).end().extrude(0.5);\np.sketch("Top", 0.5).circle(1.242, -0.8622, 0.5).end().extrude(0.25);\np.sketch("Top", 1.5).circle(2.3657, -1.1248, 0.25).circle(0.8503, -0.84, 0.25).end().cut("through", { reverse: true });\np.chamfer(0.125, [[1.742, 0.75, 0.8622]]);', 9.6069997, 1e-6);
    rfGGrow('rfFT 82', IN + 'p.sketch("Top").rect(0, -2.25, 3.75, 2.25).end().extrude(0.75);\np.sketch("Top", 1.75).circle(0.8958, -1.8468, 0.25).end().cut("through", { reverse: true });\np.chamfer(0.125, [[0, 0.375, 0]]);\np.chamfer(0.225, [[1.1458, 0.75, 1.8468]]);\np.fillet(0.25, [[0, 0.375, 2.25]]);', 6.1139474, 1e-6);
    rfGGrow('rfFT 160', IN + 'p.sketch("Top").rect(0, -3.5, 4.5, 3.5).end().extrude(0.5);\np.sketch("Top", 0.5).circle(2.4084, -0.8699, 0.25).end().extrude(0.5);\np.sketch("Top", 1.5).circle(1.6909, -2.8776, 0.1).circle(3.449, -2.4514, 0.1).circle(2.4225, -1.3474, 0.25).end().cut("through", { reverse: true });\np.fillet(0.225, [[4.5, 0.5, 1.75]]);\np.fillet(0.0625, [[2.6725, 0.5, 1.3474]]);', 7.8032278, 1e-5);

    // 5. the saddle
    rfGGrow('pipe tee saddle R3', TEE + 'p.fillet(3, [[0, Math.sqrt(125), 10]]);', 64744.2641485, 3e-5, 'the swept ball is the true rolling ball: an integral of its volume gives 64742.25, Anvil 64742.46; SolidWorks is 2 mm³ over it');
    rfGGrow('pipe tee saddle chamfer 3: the chord between the R3 ball\'s contacts', TEE + 'p.chamfer(3, [[0, Math.sqrt(125), 10]]);', 64833.7329951, 1e-5);
    rfGGrow('Ø2 × Ø1 inch saddle R.0625', TEEIN + 'p.fillet(0.0625, [[0, Math.sqrt(0.75), 0.5]]);', 20.4472665, 2e-6);
    test('rfGG: a saddle is one edge: a lone chord picked with chain off rounds the whole curve, as in SolidWorks', function () {
      var a = build(TEE + 'p.fillet(3, [[0, Math.sqrt(125), 10]]);'), b = build(TEE + 'p.fillet(3, [[0, Math.sqrt(125), 10]], { chain: false });');
      rfGGclosed(b, 'chain off');
      nearRel(b.mp.volume, a.mp.volume, 1e-9, 'same round');
    });
    test('rfGG: every size of round and chamfer on the tee is closed, each adding more than the last', function () {
      var last = build(TEE).mp.volume;
      [0.5, 2, 5, 8, 12].forEach(function (R) {
        var r = build(TEE + 'p.fillet(' + R + ', [[0, Math.sqrt(125), 10]]);');
        rfGGclosed(r, 'R' + R);
        assert(r.mp.volume > last, 'R' + R + ' ' + r.mp.volume);
        last = r.mp.volume;
      });
    });
    test('rfGG: a convex saddle (a Ø10 hole through a Ø30 bar): round and chamfer closed, the chamfer taking more', function () {
      var XD = 'p.units("mm");\np.cylinder(15, 80, { axis: "x", at: [-40, 0, 0] });\np.sketch("Top", 20).circle(0, 0, 5).end().cut("through");\n';
      var b = build(XD), f = build(XD + 'p.fillet(1, [[0, Math.sqrt(200), 5]]);'), c = build(XD + 'p.chamfer(1, [[0, Math.sqrt(200), 5]]);');
      rfGGclosed(f, 'round'); rfGGclosed(c, 'chamfer');
      assert(f.mp.volume < b.mp.volume && c.mp.volume < f.mp.volume, [b.mp.volume, f.mp.volume, c.mp.volume].join(' '));
    });

    // what stays refused
    test('rfGG: R9 on the shelled box\'s outer edge stays refused (SolidWorks\' body is faulted), so does R7.2 on both rims at once and a round off the plate all the way round; the body is kept, in a plain sentence', function () {
      [[SHELL + 'p.fillet(9, [[0, 0, 10]]);', SHELL],
        [SHELL + 'p.fillet(7.2, [[40, 30, 10], [20, 30, 0], [0, 30, 10], [20, 30, 20], [38, 30, 10], [20, 30, 18], [2, 30, 10], [20, 30, 2]]);', SHELL],
        ['p.units("mm");\np.box(60, 60, 10);\np.sketch("Top", 10).circle(30, -30, 3).end().cut("through", { reverse: true });\np.fillet(100, [[33, 10, 30]]);', 'p.units("mm");\np.box(60, 60, 10);\np.sketch("Top", 10).circle(30, -30, 3).end().cut("through", { reverse: true });\n']].forEach(function (c, i) {
        var r = build(c[0]), msg = rfGGerr(r);
        assert(/^Failed to create fillet\. The radius may be too large for the selected edges\.$/.test(msg), 'case ' + i + ': ' + msg);
        nearRel(r.mp.volume, build(c[1]).mp.volume, 1e-12, 'case ' + i + ' keeps the body');
      });
    });
  })();
