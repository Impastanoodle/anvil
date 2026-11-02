  // --- rfFY (2026-10-30, lane FY: fillets that are a little wrong, or refused when SolidWorks builds them) --- the
  // round fuzz of rfFT (300 stacks) refused 12 stacks where a fillet / chamfer runs tangentially round an earlier round
  // of EXACTLY its own size (R.03 along a top edge, round the R.03 vertical corner round it runs into): the section's
  // setback reached the corner round's axis and arcChainTool refused it as "too large". SolidWorks builds it: the corner
  // is a sphere (a cone for a chamfer). kernel-mesh.js: rfFFsection snaps that end onto the axis, rfFYpoly drops the
  // repeated corner on the axis. A larger radius crosses the axis: SolidWorks builds that too (rfGG). TODO rows: the open
  // findings this lane traced to other files (their detail says where Anvil is now; they pass).
  (function () {
    group('rfFY: fillets that were a little wrong or refused');
    var PI = Math.PI;
    // the spandrel of a round R between two square faces: area, and its first moment about the corner edge's axis
    // when revolved: a corner round Rc = R turned 90° about its axis sweeps ∫ρ dA = ∫0..R ρ (R − √(R² − ρ²)) dρ = R³/6
    // per radian, so the sphere corner removes (π/2) R³/6 = πR³/12 (= a quarter cylinder R × R less an eighth ball)
    function rfFYspa(R) { return (1 - PI / 4) * R * R; }
    function rfFYclosed(r, label) {
      noErrors(r);
      var ck = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!ck.openEdges.length && !ck.nonManifoldEdges.length, label + ': open ' + ck.openEdges.length + ', non-manifold ' + ck.nonManifoldEdges.length);
    }
    function rfFYkinds(r) { var k = {}; K.curveSurfaces(r.mesh).forEach(function (s) { k[s.surf.t] = (k[s.surf.t] || 0) + 1; }); return k; }
    function rfFYerr(r) { return Object.keys(r.errors).map(function (id) { return r.errors[id]; }).join(' | '); }

    // fuzz seed 42 (rfFT round fuzz), in inches: a 3.75 × 4 × .25 plate, its corner edge at (0, z = 4) R.03, then the
    // top edge along x at z = 4 R.03 with tangent propagation: round the corner arc and on along the x = 0 top edge
    var PLATE = 'p.units("in");\np.sketch("Top").rect(0, -4, 3.75, 4).end().extrude(0.25);\np.fillet(0.03, [[0,0.125,4]]);\n';
    test('rfFY: R.03 along a plate\'s top edge, round the R.03 corner round it runs into (was refused "too large for the round edge of radius 0.03"): closed, a sphere corner, removed = (1 − π/4)R²(3.72 + 3.97) + πR³/12 exactly', function () {
      var base = build(PLATE), r = build(PLATE + 'p.fillet(0.03, [[1.875,0.25,4]]);');
      rfFYclosed(r, 'R.03');
      var R = 0.03, ex = rfFYspa(R) * ((3.75 - R) + (4 - R)) + PI * R * R * R / 12;
      nearRel(base.mp.volume - r.mp.volume, ex, 1e-9, 'removed');
      assert(rfFYkinds(r).sph === 1, 'one sphere corner: ' + JSON.stringify(rfFYkinds(r)));
      return 'removed ' + (base.mp.volume - r.mp.volume).toPrecision(12) + ', exact ' + ex.toPrecision(12);
    });
    test('rfFY: chamfer .03 along the same edge round the R.03 corner: closed, a cone corner with its apex on the axis, removed = (d²/2)(3.72 + 3.97) + πd³/6 exactly (the triangle h ≤ ρ turned 90°: ∫ρ dA = d³/3)', function () {
      var base = build(PLATE), r = build(PLATE + 'p.chamfer(0.03, [[1.875,0.25,4]]);');
      rfFYclosed(r, 'chamfer .03');
      var d = 0.03, ex = d * d / 2 * ((3.75 - d) + (4 - d)) + PI * d * d * d / 6;
      nearRel(base.mp.volume - r.mp.volume, ex, 1e-9, 'removed');
      assert(rfFYkinds(r).cone === 1, 'one cone corner: ' + JSON.stringify(rfFYkinds(r)));
      return 'removed ' + (base.mp.volume - r.mp.volume).toPrecision(12) + ', exact ' + ex.toPrecision(12);
    });
    test('rfFY: a box\'s 4 vertical edges R5, then its top outline R5 (SolidWorks\' "same radius" rounded box): 4 sphere corners, V = 24000 − 4·A·20 − A·100 − 4·π·5³/12 exactly', function () {
      var r = build('p.box(40, 30, 20);\np.fillet(5, [[0, 10, 0], [40, 10, 0], [0, 10, 30], [40, 10, 30]]);\np.fillet(5, [[20, 20, 0]]);');
      rfFYclosed(r, 'R5 over R5');
      var A = rfFYspa(5), ex = 24000 - 4 * A * 20 - A * (2 * 30 + 2 * 20) - PI * 125 / 3;
      nearRel(r.mp.volume, ex, 1e-9, 'volume');
      assert(rfFYkinds(r).sph === 4, '4 spheres: ' + JSON.stringify(rfFYkinds(r)));
      return 'V ' + r.mp.volume.toFixed(9) + ', exact ' + ex.toFixed(9);
    });
    test('rfFY: a round LARGER than the round edge it runs round builds (this test pinned a refusal, "SolidWorks refuses it too": false, rfGG): R.0625 3.7434737, chamfer .0625 3.7426384 in SolidWorks', function () {
      var cases = [['p.fillet(0.0625, [[1.875,0.25,4]]);', 3.7434737], ['p.chamfer(0.0625, [[1.875,0.25,4]]);', 3.7426384]];
      cases.forEach(function (c) {
        var r = build(PLATE + c[0]);
        rfFYclosed(r, c[0]);
        nearRel(r.mp.volume, c[1], 5e-6, c[0]);
      });
    });

    // --- TODO rows: findings of this lane in files it does not own (they pass; the detail says where Anvil is now)
    test('rfFY: two equal R9 rounds mitred at a 90° box corner: removed = (1 − π/4)R²(ΣL − 8ḡ) to 1e-9 (lane FX: curveCorrection bounds a cylinder facet\'s radial columns by the mitre (bisector) plane; was 1.07e-4·R³ heavy per corner)', function () {
      // four rounds round a 40 × 30 face: (1 − π/4)R²(ΣL − 8ḡ), ḡ = R(10 − 3π)/(3(4 − π)) the spandrel's centroid
      // offset (each prism's coverage at inward offset u is L − 2u); the faceted tool removes exactly
      // A_poly(ΣL − 8 ḡ_poly) (checked: 2271.695997 both), so the 0.313 excess is the correction's, not the tool's
      var B0 = 'p.units("mm"); p.box(40, 20, 30);\n', base = build(B0), f = build(B0 + 'p.fillet(9, [[20, 30, 20], [20, 0, 20], [40, 15, 20], [0, 15, 20]]);');
      rfFYclosed(f, 'R9');
      var R = 9, ex = rfFYspa(R) * (140 - 8 * R * (10 - 3 * PI) / (3 * (4 - PI))), got = base.mp.volume - f.mp.volume;
      var per = (got - ex) / 4 / (R * R * R);
      nearRel(got, ex, 1e-9, 'removed');
      return 'removed ' + got.toFixed(9) + ', exact ' + ex.toFixed(9) + ' (' + per.toExponential(2) + '·R³ per corner)';
    });
    test('rfFY: R9 trimmed by a blind 8 × 8 × 5 pocket: removed = closed form to 1e-9 (lane FX: curveCorrection bounds the radial columns by the pocket\'s wall, parallel to the axis; was 1.7e-5 relative)', function () {
      var POCKET = 'p.units("mm"); p.box(40, 20, 30);\np.sketch("Top", 30).rect(28, -14, 8, 8).cut(5, { reverse: true });\n';
      var base = build(POCKET), f = build(POCKET + 'p.fillet(9, [[20, 30, 0]]);');
      rfFYclosed(f, 'R9');
      var ex = (1 - PI / 4) * 81 * 40 - 8 * (27 - (1.5 * Math.sqrt(72) + 40.5 * Math.asin(1 / 3))), got = base.mp.volume - f.mp.volume;
      var rel = (got - ex) / ex;
      nearRel(got, ex, 1e-9, 'removed');
      return 'removed ' + got.toFixed(9) + ', exact ' + ex.toFixed(9) + ' (' + rel.toExponential(2) + ')';
    });
    test('rfFY TODO: R2 on an extruded spline\'s END-face edge at chordTol .0005 (220 chords): refused by the open-edge guard (csg.js: the swept tool\'s facets meet at 0.3° on the face and the BSP leaves 4 open + 3 non-manifold edges along the setback); the sketch-plane face builds, 39.531889', function () {
      var SPL = 'p.units("mm"); p.sketch("Front").line(0,0,40,0).line(40,0,40,20).spline([[40,20],[25,30],[10,22],[0,20]]).line(0,20,0,0).extrude(15);\n';
      var prev = K.setTessellation(), out;
      try {
        K.setTessellation({ chordTol: 0.0005, legacy: false, maxAngle: 12 });
        var base = build(SPL), front = build(SPL + 'p.fillet(2, [[25, 30, 0]]);'), back = build(SPL + 'p.fillet(2, [[25, 30, 15]]);');
        rfFYclosed(front, 'sketch-plane face');
        var e = rfFYerr(back);
        if (e) { assert(/^Failed to create fillet\. /.test(e), 'plain refusal: ' + e); out = 'TODO end face refused: ' + e; }
        else { rfFYclosed(back, 'end face'); nearRel(base.mp.volume - back.mp.volume, base.mp.volume - front.mp.volume, 3e-8, 'same as the sketch-plane face'); out = 'end face builds, removed ' + (base.mp.volume - back.mp.volume).toFixed(6); }
      } finally { K.setTessellation(prev); }
      return out;
    });
  })();
