  // --- rfJY (2026-11-06, lane sweptflange-2) --- features after a Swept Flange or a Lofted-Bend reach the flat. A
  // Swept Flange that starts the part on a straight path is an open-profile Base Flange (the same section the path's
  // length), so cuts, holes across its bends and Edge Flanges on it unfold through Kernel.flatPattern's own records:
  // its flat equals the Base Flange twin's exactly. Along an arc the sheet's face is mapped into the development
  // (rings rigidly, cylinders on the neutral radius); a Lofted-Bend lays each hole by its facet's rigid map.
  (function () {
    group('rfJY: cuts, holes and Edge Flanges after a Swept Flange / Lofted-Bend in the flat; no flange on a curved edge');
    var T = 0.06, HEAD = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\n';
    var SW = 'var path = p.sketch("Top").line(0, 0, 0, -10).id();\nvar prof = p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).id();\np.sweptFlange(prof, path);\n';
    var BF = 'p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).end().baseFlange(null, { depth: 10 });\n';
    var RING = 'var path = p.sketch("Top").arc(0, 0, 5, 0, 90).id();\nvar prof = p.sketch("Front").line(5, 0, 7, 0).id();\np.sweptFlange(prof, path);\n';
    function rfJYB(code) { var r = build(HEAD + code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function rfJYArea(flat) { return flat.loops.reduce(function (s, l) { return s + K.signedArea(l); }, 0); }   // holes are CW
    function rfJYDxf(flat) { return DxfCheck.check(K.exportDXFFlat(flat, 'in', { style: 'entities' }), { units: 'in' }); }

    test('rfJY: straight Swept Flange + a Ø.5 hole in its plate: one CIRCLE R.25 in the flat DXF; blank = (flats + BA) × 10 − the hole; = the Base Flange twin', function () {
      var cut = 'p.sketch("Top").circle(1, -5, 0.25).cut("through");\n', a = rfJYB(SW + cut), b = rfJYB(BF + cut);
      assert(a.flat.loops.length === 2, 'blank + hole, got ' + a.flat.loops.length);
      var c = rfJYDxf(a.flat);
      assert(c.ok && c.circles.length === 1 && Math.abs(c.circles[0].r - 0.25) < 1e-9, 'one CIRCLE R.25: ' + JSON.stringify(c.circles) + ' ' + c.errors.join('; '));
      near(rfJYArea(a.flat), rfJYArea(b.flat), 1e-9, 'the Base Flange twin\'s flat');
      var W = (2 - T) + (1 - T) + Math.PI / 2 * 1.5 * T;
      near(K.signedArea(a.flat.loops[0]), W * 10, 1e-9, 'the blank');
      nearRel(a.mp.volume, (W * 10 - Math.PI * 0.0625) * T, 1e-9, 'volume = (blank − hole) × T');
    });

    test('rfJY: straight Swept Flange + a cut across its bend, + an Edge Flange on its leg (both kernels\' records): flat, bends and volume = the Base Flange twin\'s', function () {
      [['slot', 'p.sketch("Top").rect(1.8, -6, 2.1, -4).cut("through");\n', 1], ['edge flange', 'p.flange(1, [[2, 1, 5]]);\n', 2]].forEach(function (cs) {
        var a = rfJYB(SW + cs[1]), b = rfJYB(BF + cs[1]);
        near(rfJYArea(a.flat), rfJYArea(b.flat), 1e-9, cs[0] + ': flat area');
        assert(a.flat.loops.length === b.flat.loops.length && a.flat.bends.length === cs[2] && b.flat.bends.length === cs[2], cs[0] + ': loops / bends ' + a.flat.loops.length + ' / ' + a.flat.bends.length);
        near(a.mp.volume, b.mp.volume, 1e-12, cs[0] + ': volume');
        near(Math.min(a.flat.size[0], a.flat.size[1]), Math.min(b.flat.size[0], b.flat.size[1]), 1e-9, cs[0] + ': size');
      });
    });

    test('rfJY: a ring Swept Flange (R5 → 7, quarter arc) + a Ø.4 hole: one CIRCLE R.2 in the flat, at its true place (r 5.86, 20°); a cylinder + a hole through its wall: a hole of ≈ its area in the rolled flat', function () {
      var r = rfJYB(RING + 'p.sketch("Top").circle(5.5, 2, 0.2).cut("through");\n');
      assert(r.flat.loops.length === 2, 'ring + hole: ' + r.flat.loops.length);
      var c = rfJYDxf(r.flat);
      assert(c.ok && c.circles.length === 1 && Math.abs(c.circles[0].r - 0.2) < 1e-6, 'CIRCLE R.2 ' + JSON.stringify(c.circles));
      nearRel(Math.abs(K.signedArea(r.flat.loops[0])), Math.PI / 4 * 24, 2e-3, 'the ring sector');
      // its centre keeps its distances to the ring's inner corners (5, 0, 0) and (0, 0, −5): the ring lies flat as it is
      var h = r.flat.loops[1], hc = [0, 0];
      h.forEach(function (p) { hc[0] += p[0] / h.length; hc[1] += p[1] / h.length; });
      [Math.hypot(0.5, 2), Math.hypot(5.5, 3)].forEach(function (d) {
        assert(r.flat.loops[0].some(function (p) { return Math.abs(Math.hypot(p[0] - hc[0], p[1] - hc[1]) - d) < 1e-6; }), 'a corner ' + d.toFixed(4) + ' from the hole');
      });
      var cy = rfJYB('var path = p.sketch("Top").arc(0, 0, 5, 0, 90).id();\nvar prof = p.sketch("Front").line(5, 0, 5, 2).id();\np.sweptFlange(prof, path, { flatten: "path" });\np.sketch("Right", 6).circle(1, 1, 0.2).cut("through");\n');
      assert(cy.flat.loops.length === 2, 'cylinder + hole: ' + cy.flat.loops.length);
      nearRel(-K.signedArea(cy.flat.loops[1]), Math.PI * 0.04, 0.05, 'the hole ≈ its area');
      near(K.signedArea(cy.flat.loops[0]), 2 * Math.PI / 2 * (5 + T / 2), 2e-3, 'the rolled blank');
      assert(!cy.flat.warnings.length, 'no warnings: ' + cy.flat.warnings.join(' | '));
    });

    test('rfJY: Lofted-Bend square hopper 4 → 2 + a Ø.4 hole square to the Front plane through its front facet: the flat hole is the facet\'s hole, true shape (π·.04·√10/3)', function () {
      var LB = 'var a = p.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).id();\n' +
        'var b = p.sketch("Top", 3).polyline([[0, -1], [1, -1], [1, 1], [-1, 1], [-1, -1], [-0.0005, -1]], false).id();\np.loftedBend([a, b]);\n';
      var plain = rfJYB(LB), r = rfJYB(LB + 'p.sketch("Front").circle(1, 1.5, 0.2).cut("through");\n');
      assert(r.flat.loops.length === 2, 'blank + hole: ' + r.flat.loops.length);
      near(K.signedArea(r.flat.loops[0]), K.signedArea(plain.flat.loops[0]), 1e-12, 'the blank unchanged');
      var A = -K.signedArea(r.flat.loops[1]);
      nearRel(A, Math.PI * 0.04 * Math.sqrt(10) / 3, 1e-2, 'true shape on the inclined facet');
      // exactly the hole of the facet's face (a rigid map): the cut cylinder's chords seen along the facet's normal
      var nrm = [0, 1 / Math.sqrt(10), 3 / Math.sqrt(10)], A3 = 0, hole = null;
      r.mesh.faces.forEach(function (fc, i) {
        if (Math.abs(fc.normal[1] - nrm[1]) > 1e-6 || Math.abs(fc.normal[2] - nrm[2]) > 1e-6) return;
        var o = K.faceOutline(r.mesh, i);
        o.loops.forEach(function (l) { var s = K.signedArea(l); if (Math.abs(s) < 0.2) A3 = Math.max(A3, Math.abs(s)); });
      });
      near(A, A3, 1e-9, 'flat hole area = the facet face\'s hole area');
      var c = rfJYDxf(r.flat);
      assert(c.ok && c.loops.length === 2, 'DXF: blank + hole ' + c.errors.join('; '));
    });

    test('rfJY: Edge Flange on the round edge of a ring Swept Flange is refused (linear edges only); on its straight end edge it builds', function () {
      var bad = build(HEAD + RING + 'p.flange(1, [[' + 7 * Math.cos(Math.PI / 8) + ', -' + T + ', ' + (-7 * Math.sin(Math.PI / 8)) + ']]);\n');
      var ids = Object.keys(bad.errors);
      assert(ids.length === 1 && /not linear/.test(bad.errors[ids[0]]), 'refused: ' + JSON.stringify(bad.errors));
      var ok = build(HEAD + RING + 'p.flange(1, [[6, 0, 0]]);\n');
      noErrors(ok);
      assert(ok.mp.volume > Math.PI / 4 * 24 * T + 0.9 * 2 * T, 'the end flange is there: ' + ok.mp.volume);
    });
  })();
