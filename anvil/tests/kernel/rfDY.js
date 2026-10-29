  // --- rfDY (2026-10-29, lane DY: Rib and Intersect) --- Rib: an open sketch line thickened and grown until it meets
  // the part (parallel to the sketch toward the material, or normal to it), ends extended linearly to the part; exact
  // volumes on planar parts. Intersect: the regions selected solids (and planes) make, kept / excluded per region,
  // merged or separate, internal voids with mode 'internal'. Script round trips. OpenCascade: occt-tests.html rows "rfDY".
  (function () {
    group('rfDY: Rib and Intersect');
    var rfDYL = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 0.25).end().extrude(4, { midplane: true });\np.sketch("Front").rect(0, 0, 0.25, 4).end().extrude(4, { midplane: true });\n';
    var rfDYBox = 'p.units("in");\np.sketch("Top").rect(0, -4, 4, 4).end().extrude(2);\np.sketch("Top", 0.25).rect(0.25, -3.75, 3.5, 3.5).end().cut(2);\n';
    var rfDYTwo = 'p.sketch("Front").rect(0, 0, 10, 10).end().extrude(10, { merge: false });\np.sketch("Front").rect(5, 5, 10, 10).end().extrude(10, { merge: false });\n';
    var rfDYGusset = 2.75 * 2.75 / 2 * 0.25;
    function rfDYVol(r) { return K.massProps(r.mesh).volume; }
    function rfDYLast(r) { return r.model.features[r.model.features.length - 1]; }

    test('rfDY: L bracket gusset — a diagonal line on the mid-plane, rib .25 both sides / first side / second side: added volume = triangle area × .25 exactly; Rib1 in the tree', function () {
      var v0 = rfDYVol(build(rfDYL));
      near(v0, 7.75, 1e-12, 'bracket');
      ['both', 'one', 'other'].forEach(function (side) {
        var r = build(rfDYL + 'p.sketch("Front").line(0.25, 3, 3, 0.25).end();\np.rib(0.25, { side: "' + side + '" });');
        noErrors(r);
        nearRel(rfDYVol(r) - v0, rfDYGusset, 1e-9, side);
        assert(r.build.bodies.length === 1, 'one body');
        var bb = K.massProps(r.mesh).bbox, z0 = side === 'one' ? 0 : side === 'other' ? -0.25 : -0.125;
        assert(Math.abs(bb.min[2] + 2) < 1e-9 && Math.abs(bb.max[2] - 2) < 1e-9, 'bbox z ' + JSON.stringify(bb));
        var tb = r.build.tools[rfDYLast(r).id].getBounds();
        near(tb.min[2], z0, 1e-9, side + ' rib z min'); near(tb.max[2], z0 + 0.25, 1e-9, side + ' rib z max');
        assert(rfDYLast(r).name === 'Rib1', 'name ' + rfDYLast(r).name);
        assert(!r.build.warnings[r.model.features[3].id], 'no open-contour warning on the rib sketch: ' + r.build.warnings[r.model.features[3].id]);
      });
      return 'gusset ' + fmt(rfDYGusset);
    });

    test('rfDY: a short line in the middle is extended linearly to both plates (same gusset); Flip material side grows away from the part: error; Normal to Sketch on the mid-plane meets nothing: error', function () {
      var v0 = rfDYVol(build(rfDYL));
      var r = build(rfDYL + 'p.sketch("Front").line(1, 2.25, 2.25, 1).end();\np.rib(0.25);');
      noErrors(r);
      nearRel(rfDYVol(r) - v0, rfDYGusset, 1e-9, 'extended');
      var rf = build(rfDYL + 'p.sketch("Front").line(0.25, 3, 3, 0.25).end();\np.rib(0.25, { flip: true });');
      assert(/does not meet the body/.test(rf.build.errors[rfDYLast(rf).id] || ''), 'flip error: ' + rf.build.errors[rfDYLast(rf).id]);
      near(rfDYVol(rf), v0, 1e-12, 'no change on error');
      var rn = build(rfDYL + 'p.sketch("Front").line(0.25, 3, 3, 0.25).end();\np.rib(0.25, { direction: "normal" });');
      assert(rn.build.errors[rfDYLast(rn).id], 'normal error');
      return rf.build.errors[rfDYLast(rf).id];
    });

    test('rfDY: Normal to Sketch — a line on a plane at the wall tops of an open box grows down to the floor and its ends run out to the walls (3.5 × 1.75 × .25); a two-line chain gives the same volume as its two ribs with the joint filled', function () {
      var b0 = build(rfDYBox), v0 = rfDYVol(b0);
      near(v0, 4 * 4 * 2 - 3.5 * 3.5 * 1.75, 1e-9, 'box');
      var r = build(rfDYBox + 'p.sketch("Top", 2).line(1, -2, 3, -2).end();\np.rib(0.25, { direction: "normal" });');
      noErrors(r);
      nearRel(rfDYVol(r) - v0, 3.5 * 1.75 * 0.25, 1e-9, 'normal rib');
      var tb = r.build.tools[rfDYLast(r).id].getBounds();
      nearVec(tb.min, [0.25, 0.25, 1.875], 1e-9, 'rib min'); nearVec(tb.max, [3.75, 2, 2.125], 1e-9, 'rib max');
      var r1 = build(rfDYBox + 'p.sketch("Top", 2).line(1, -2, 3, -2).end();\np.rib(0.25, { direction: "normal", side: "one" });');
      var tb1 = r1.build.tools[rfDYLast(r1).id].getBounds();
      near(tb1.min[2], 1.75, 1e-9, 'first side: across the line to its left (sketch +v = −z)'); near(tb1.max[2], 2, 1e-9, 'first side max');
      var rc = build(rfDYBox + 'p.sketch("Top", 2).line(2, -1, 2, -2).line(2, -2, 3, -2).end();\np.rib(0.25, { direction: "normal" });');
      noErrors(rc);
      consistentVolume(rc);
      // an L of two ribs: the leg to the back wall (z 0.25..2) and the leg to the right wall (x 2..3.75), the corner square shared
      var legs = (2 - 0.25 + 0.125) * 0.25 + (3.75 - 2 - 0.125) * 0.25;
      nearRel(rfDYVol(rc) - v0, legs * 1.75, 1e-9, 'chain');
      return 'normal ' + fmt(rfDYVol(r) - v0);
    });

    test('rfDY: Intersect two overlapping blocks — regions in a fixed order (A only, B only, common); keep the common region: 250; keep the outer two: union − common; Merge result off: two bodies', function () {
      var r0 = build(rfDYTwo);
      var regs = K.intersectRegions(r0.build.bodies, { type: 'intersect' }, r0.model, r0.build.planes);
      assert(regs.length === 3, 'three regions');
      [750, 750, 250].forEach(function (v, i) { nearRel(regs[i].volume, v, 1e-12, 'region ' + i); });
      assert(regs[0].centroid[0] < regs[1].centroid[0], 'A first');
      var c = build(rfDYTwo + 'p.intersect({ regions: [false, false, true] });');
      noErrors(c);
      nearRel(rfDYVol(c), 250, 1e-12, 'common');
      assert(c.build.bodies.length === 1 && rfDYLast(c).name === 'Intersect1', 'one body, Intersect1');
      var o = build(rfDYTwo + 'p.intersect({ exclude: [2] });');
      nearRel(rfDYVol(o), 2000 - 500, 1e-12, 'outer two');
      assert(o.build.bodies.length === 1, 'merged');
      var s = build(rfDYTwo + 'p.intersect({ regions: [true, true, false], merge: false });');
      assert(s.build.bodies.length === 2, 'two bodies: ' + s.build.bodies.length);
      var all = build(rfDYTwo + 'p.intersect({});');
      nearRel(rfDYVol(all), 1750, 1e-12, 'all kept = union');
      var none = build(rfDYTwo + 'p.intersect({ regions: [false, false, false] });');
      assert(/excluded/.test(none.build.errors[rfDYLast(none).id] || ''), 'all excluded: error');
      return 'regions 750 / 750 / 250';
    });

    test('rfDY: Intersect with a plane splits the regions (6 bodies, Merge off); a closed void between a tube and two caps is a region with Create internal regions (filled when kept)', function () {
      var r = build(rfDYTwo + 'var pl = p.plane("Right", 7);\np.intersect({ planes: [pl], merge: false });');
      noErrors(r);
      assert(r.build.bodies.length === 6, 'six bodies: ' + r.build.bodies.length);
      nearRel(rfDYVol(r), 1750, 1e-12, 'volume unchanged');
      var tube = 'p.sketch("Front").rect(0, 0, 10, 10).end().extrude(10, { merge: false });\np.sketch("Front").rect(2, 2, 6, 6).end().cut(10);\n' +
        'p.sketch("Front", 10).rect(-1, -1, 12, 12).end().extrude(2, { merge: false });\np.sketch("Front").rect(-1, -1, 12, 12).end().extrude(2, { merge: false, reverse: true });\n';
      var t0 = build(tube);
      var regs = K.intersectRegions(t0.build.bodies, { type: 'intersect', mode: 'internal' }, t0.model, t0.build.planes);
      assert(regs.length === 4 && regs[3].void, 'three bodies and the void: ' + regs.length);
      nearRel(regs[3].volume, 360, 1e-12, 'void');
      var t1 = build(tube + 'p.intersect({ mode: "internal" });');
      noErrors(t1);
      nearRel(rfDYVol(t1), 640 + 2 * 288 + 360, 1e-12, 'filled');
      var t2 = build(tube + 'p.intersect({ mode: "internal", exclude: [3] });');
      nearRel(rfDYVol(t2), 640 + 2 * 288, 1e-12, 'void left out');
      return 'void 360';
    });

    test('rfDY: script round trip (rib options, thickness as an equation, intersect with a plane variable and keep flags) rebuilds the same volumes', function () {
      var codes = [
        rfDYL + 'p.equations({ T: 0.25 });\np.sketch("Front").line(0.25, 3, 3, 0.25).end();\np.rib("=T", { side: "other", extension: "natural" });',
        rfDYBox + 'p.sketch("Top", 2).line(1, -2, 3, -2).end();\np.rib(0.25, { direction: "normal", side: "one" });',
        rfDYTwo + 'var pl = p.plane("Right", 7);\np.intersect({ planes: [pl, "Top"], regions: [true, false, true], merge: false, mode: "internal" });'
      ];
      codes.forEach(function (code, i) {
        var r = build(code);
        noErrors(r);
        var s = K.generateScript(r.model), r2 = build(s);
        noErrors(r2);
        nearRel(rfDYVol(r2), rfDYVol(r), 1e-12, 'round trip ' + i);
        assert(JSON.stringify(rfDYLast(r2), function (k, v) { return k === 'id' || k === 'profile' || k === 'planes' ? undefined : v; }) === JSON.stringify(rfDYLast(r), function (k, v) { return k === 'id' || k === 'profile' || k === 'planes' ? undefined : v; }), 'feature ' + i + ': ' + s.split('\n').slice(-1)[0]);
      });
      var s3 = K.generateScript(build(codes[2]).model);
      assert(/p\.intersect\(\{ planes: \[f\d+, "Top"\]/.test(s3), 'plane variable: ' + s3.split('\n').slice(-1)[0]);
      return 'round trips';
    });
  })();
