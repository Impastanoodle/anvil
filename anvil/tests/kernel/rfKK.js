  // --- rfKK (2026-11-09, lane mitrefid: mitres that are not 90° on a square corner, report 2026-11-02 row 5d) --- the
  // row's three parts are SolidWorks' already (rfIS edge flanges, rfIZ Miter Flange L: flats to the digit, folded within
  // 1e-5 of SolidWorks' own folded volume, which is 2.6e-4 to 4.5e-4 UNDER its blank × T: the bend's end is a helicoid
  // from the base's corner, the flat's line runs on past it). What this lane fixed: a free end of an Edge Flange at an
  // acute corner of the sheet (a trapezoid's) with a placement that moves the bend in off the edge (Material Inside /
  // Outside, Bend from Virtual Sharp, Tangent to Bend): the overlap strip [shift, shift + T] stuck out past the sheet's
  // side (in the part and in the flat) and the cut meant for it notched the bend's own end instead (up to 22 outline
  // corners). Now the bend ends square (the flange is its edge's width), the base steps to the side at the bend line,
  // folded = blank × T exactly, 8 outline corners. 16 ga, R = T, K .5, inches.
  (function () {
    group('rfKK: Edge Flange at an acute corner with the bend moved in (no overlap-strip sliver), mitres at non-90° corners vs their blank');
    var T = 0.0598, R = 0.0598, HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\n';
    // 6 × 3 trapezoid: top edge (0, 0)–(6, 0) with 71.6° corners at both ends (sides x = −y/3 and x = 6 + y/3)
    var TZ = HEAD + 'p.sketch("Top").polyline([[0, 0], [6, 0], [5, -3], [1, -3]], true).end().baseFlange();\n';
    var TOP = '[[3, ' + T + ', 0]]', SL = '[[5.5, ' + T + ', 1.5]]', BOTH = '[[3, ' + T + ', 0], [5.5, ' + T + ', 1.5]]';
    function eq(a, b, label) { assert(a === b, label + ': ' + a + ', want ' + b); }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    function make(code) {
      var r = build(code); noErrors(r);
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!c.openEdges.length && !c.nonManifoldEdges.length, 'closed solid: ' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold');
      r.flat = K.flatPattern(r.model, r.build, r.mesh);
      r.blank = blankArea(r.flat) * T;
      return r;
    }
    function shiftOf(pos, A) {
      var a = A * Math.PI / 180;
      if (pos === 'inside') return A === 90 ? R + T : ((R + T) - R * Math.cos(a)) / Math.sin(a);
      if (pos === 'outside') return A === 90 ? R : R * Math.tan(a / 2);
      if (pos === 'virtualSharp') return (R + T) * Math.tan(a / 2);
      return R + T;   // tangentToBend at 90°
    }
    function fl(edges, pos, A, extra) { return 'p.flange(1, ' + edges + ', { angle: ' + A + ', position: "' + pos + '", lengthRef: "outer"' + (extra || '') + ' });\n'; }
    [['inside', 90], ['inside', 120], ['inside', 60], ['outside', 90], ['outside', 120], ['virtualSharp', 90], ['virtualSharp', 120], ['tangentToBend', 90]].forEach(function (c) {
      test('rfKK: top edge of the trapezoid, ' + c[0] + ' ' + c[1] + '°: both 71.6° free ends end square, no overlap strip past the sides; folded = blank × T, 8 outline corners at the bend line', function () {
        var r = make(TZ + fl(TOP, c[0], c[1])), s = shiftOf(c[0], c[1]), k = s / 3;
        nearRel(r.mp.volume, r.blank, 1e-9, 'folded vs blank × T');
        var L = r.flat.loops[0];
        eq(r.flat.loops.length, 1, 'one loop');
        eq(L.length, 8, 'outline corners (' + JSON.stringify(L.map(function (p) { return [+p[0].toFixed(5), +p[1].toFixed(5)]; })) + ')');
        // the flat's y is −z: the bend line at y = −s; the strip's ends x = 0 / 6 down to it, then the base's sides
        [[0, -s], [k, -s], [6 - k, -s], [6, -s], [1, -3], [5, -3]].forEach(function (q) {
          var d = Math.min.apply(null, L.map(function (p) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }));
          assert(d < 1e-6, 'corner (' + q.map(function (v) { return v.toFixed(5); }).join(', ') + ') is ' + d.toExponential(2) + ' from the nearest');
        });
        // no metal past the side x = z/3 in the overlap strip's band z ∈ [s, s + T]; the bend's square end (z < s) stays
        var ins = r.body.pointTester(), zs = s + T / 2;
        assert(!ins([zs / 3 - 0.004, T / 2, zs]) && !ins([6 - zs / 3 + 0.004, T / 2, zs]), 'no sliver past the sides at z = ' + zs.toFixed(4));
        assert(ins([zs / 3 + 0.004, T / 2, zs]), 'the sheet itself is there');
        return r.mp.volume.toFixed(9);
      });
    });
    test('rfKK: Bend Outside on the same edge is unchanged (rfIS: no strip past the sides, folded = blank × T, 6 corners)', function () {
      var r = make(TZ + fl(TOP, 'bendOutside', 90));
      nearRel(r.mp.volume, r.blank, 1e-12, 'folded vs blank × T');
      eq(r.flat.loops[0].length, 6, 'outline corners');
      near(r.mp.volume, 1.263442589, 1e-8, 'folded volume');
    });
    test('rfKK: slanted edge, Material Inside: the acute end (6, 0) steps at the bend line, folded = blank × T', function () {
      var r = make(TZ + fl(SL, 'inside', 90)), s = R + T, ux = 1 / Math.sqrt(10), q = [6 - 3 * s * ux, s * ux];   // the bend line meets the strip's end
      nearRel(r.mp.volume, r.blank, 1e-9, 'folded vs blank × T');
      eq(r.flat.loops[0].length, 7, 'outline corners');
      // the strip's end (square to the edge through (6, 0)) meets the bend line at q, then the bend line runs to the top side
      // y = 0 at x = 6 − s·√10 / 3
      [q, [6 - s * Math.sqrt(10) / 3, 0]].forEach(function (c) {
        var d = Math.min.apply(null, r.flat.loops[0].map(function (p) { return Math.hypot(p[0] - c[0], p[1] - c[1]); }));
        assert(d < 1e-6, 'corner (' + c.map(function (v) { return v.toFixed(5); }).join(', ') + ') is ' + d.toExponential(2) + ' from the nearest');
      });
      return r.mp.volume.toFixed(9);
    });
    // a mitred non-90° corner (rfJU's auto mitre for Material Inside / Outside / Virtual Sharp; miter: true for Bend
    // Outside): the free ends are exact, so folded − blank × T is the mitred corner's alone, under the blank (the bend's
    // helicoid end, SolidWorks' -2.6e-4 on its 90° trapezoid row) and the same with or without miter: true
    [['inside', 90], ['outside', 90], ['virtualSharp', 120], ['bendOutside', 120]].forEach(function (c) {
      test('rfKK: top + slanted edge (71.6° corner mitred), ' + c[0] + ' ' + c[1] + '°: closed, one loop, folded under its blank by the mitred corner only', function () {
        var r = make(TZ + fl(BOTH, c[0], c[1], ', miter: true')), ex = (r.mp.volume - r.blank) / r.blank;
        eq(r.flat.loops.length, 1, 'one loop');
        assert(ex < 0 && ex > -1e-3, 'folded − blank × T, relative: ' + ex.toExponential(3));
        if (c[0] !== 'bendOutside') {
          var p = make(TZ + fl(BOTH, c[0], c[1]));
          near(p.mp.volume, r.mp.volume, 1e-12, 'auto mitre = miter: true');
          // the acute free end (0, 0) of the top edge steps at the bend line as above
          var s = shiftOf(c[0], c[1]);
          assert(r.flat.loops[0].some(function (q) { return Math.hypot(q[0] - s / 3, q[1] + s) < 1e-6; }), 'step corner (' + (s / 3).toFixed(5) + ', ' + (-s).toFixed(5) + ')');
        }
        return ex.toExponential(3);
      });
    });
  })();
