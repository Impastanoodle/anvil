  // --- rfPO (2026-11-18, lane stepsnap: imported sheet metal and STEP leftovers) ---
  // 1. exchange.js splitCrossings: a Miter Flange whose lip is folded less than 90 deg off the riser (a lip flaring
  //    out) has its two lips' bends crossing at the mitre: their outer cylinders overlap and meet in an ellipse, and
  //    the seam ends where both bends' ends (fans of planar chords) meet. Those four surfaces have no common point (the
  //    chords on the two sides are split by different diagonals, 2e-5 apart), so the vertex sat where the four facets
  //    meet, 2e-4 inside both cylinders; both lip bends went to STEP as facets and Insert Bends on the re-read part
  //    found 2 of 4 bends (blank 20 % short). The vertex is now two, joined by a short edge (the plane between on both
  //    cylinders; the planes' line where it reaches the first cylinder): every bend is a cylinder in the file.
  (function () {
    group('rfPO: imported sheet metal and STEP leftovers: a flared Miter Flange lip\'s bends whole in STEP');
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    function rfPOwith(obj, key, value, fn) { var was = obj[key]; obj[key] = value; try { return fn(); } finally { obj[key] = was; } }
    function rfPOcount(re, s) { return (s.match(re) || []).length; }
    function rfPOarea(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i ? -1 : 1) * Math.abs(K.signedArea(l)); }, 0); }
    // a 4 x 2 base, a Miter Flange round its corner on an L profile: riser 1, lip .5 at deg above level (0: the plain L)
    function rfPOlip(deg) {
      var a = deg * Math.PI / 180;
      return 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n' +
        'p.sketch("Right").line(0, 0.06, 0, 1.06).line(0, 1.06, ' + 0.5 * Math.cos(a) + ', ' + (1.06 + 0.5 * Math.sin(a)) + ').end();\np.miterFlange([[2, 0.06, 0], [0, 0.06, 1]], {});\n';
    }
    function rfPOtrip(deg) {
      if (!X) fail('exchange.js is not loaded');
      var r = build(rfPOlip(deg)); noErrors(r);
      var own = K.flatPattern(r.model, r.build, r.mesh), step = X.exportSTEP(r.model, r.build), splits = X.crossOptions.last ? X.crossOptions.last.splits : -1;
      var vPart = K.massProps(r.mesh, 1).volume, m2 = X.newPartFromImport(X.importFile('rfPO.step', step, { units: 'in' }));
      var vBack = K.massProps(K.meshFromBody(K.rebuild(m2).body), 1).volume;
      new K.Builder(m2).insertBends([1, 0.06, 1.3], { kFactor: 0.5 });
      var b3 = K.rebuild(m2);
      assert(!Object.keys(b3.errors).length, 'Insert Bends: ' + JSON.stringify(b3.errors));
      var ib = K.flatPattern(m2, b3, K.meshFromBody(b3.body));
      return { step: step, own: own, ib: ib, vPart: vPart, vBack: vBack, splits: splits };
    }
    [[30, 1], [37, 1], [45, 1], [60, 1], [0, 0], [120, 0]].forEach(function (c) {
      test('rfPO: Miter Flange L, lip ' + c[0] + ' deg above level: every bend a cylinder in its STEP (' + c[1] + ' crossing split), the file reads back at the part\'s volume, Insert Bends finds 4 bends' + (c[1] ? '' : ' and the part\'s own blank to 1e-9'), function () {
        var t = rfPOtrip(c[0]), cyl = rfPOcount(/=CYLINDRICAL_SURFACE\(/g, t.step);
        assert(cyl === 8, cyl + ' cylinders in the file (8: the four bends whole; 4 before: the lips\' bends were facets)');
        assert(t.splits === c[1], t.splits + ' crossings split, expected ' + c[1]);
        nearRel(t.vBack, t.vPart, 1e-9, 'read-back volume');
        assert(t.ib.bends.length === 4, t.ib.bends.length + ' bends found by Insert Bends (2 before)');
        var d = rfPOarea(t.ib) - rfPOarea(t.own);
        // a flared lip's bends overlap at the mitre (see the report): Insert Bends draws each lip bend's end straight from
        // the riser's end to the lip's (SolidWorks' rule, rfIZ), the part's own flat steps out past both at the bend lines
        if (c[1]) assert(Math.abs(d) < 5e-3, 'blank ' + rfPOarea(t.ib).toFixed(6) + ', own ' + rfPOarea(t.own).toFixed(6) + ' (was 20 % short)');
        else near(rfPOarea(t.ib), rfPOarea(t.own), 1e-9, 'blank');
        return cyl + ' cylinders, volume d ' + ((t.vBack - t.vPart) / t.vPart).toExponential(1) + ', blank - own ' + d.toExponential(2) + ' in²';
      });
    });
    test('rfPO: the 37 deg lip without the crossing split (crossOptions.on = false) still goes out with its lips\' bends as facets (the cause pinned)', function () {
      if (!X) fail('exchange.js is not loaded');
      var r = build(rfPOlip(37)); noErrors(r);
      var step = rfPOwith(X.crossOptions, 'on', false, function () { return X.exportSTEP(r.model, r.build); });
      assert(rfPOcount(/=CYLINDRICAL_SURFACE\(/g, step) === 4, rfPOcount(/=CYLINDRICAL_SURFACE\(/g, step) + ' cylinders without the split');
    });

    // 2. exchange.js snapToCones / conicEdge / conicCurve: a cone cut by planes (the Hex nut's chamfers by its flats:
    //    hyperbolas; the Moulded cap's drafted boss by its drafted rib) went to STEP as facets (-3.3e-4 / -2.8e-4 of the
    //    volume read back). The vertices where the planes cut the faceted cone move onto it (along the line of two planes,
    //    or radially in a cap square to the axis) and each plane's cut is a rational quadratic B-spline exact on the conic.
    //    The Hex nut's file reads back at its closed form to 1e-11 (the kernel's own massProps is 9.3e-8 under it).
    function rfPOnut() {
      var r = 19 / Math.cos(Math.PI / 6) / 2, a = 9.5, Ah = 6 * a * a * Math.tan(Math.PI / 6);
      function inside(c) { return c <= a ? Math.PI * c * c : c >= r ? Ah : Math.PI * c * c - 6 * (c * c * Math.acos(a / c) - a * Math.sqrt(c * c - a * a)); }
      function f(z) { return Ah - inside(r - 1.2 + (10 - z)); }
      var n = 20000, h = 1.2 / n, s = f(8.8) + f(10);
      for (var i = 1; i < n; i++) s += f(8.8 + i * h) * (i % 2 ? 4 : 2);
      return Ah * 10 - Math.PI * 5.1 * 5.1 * 10 - 2 * s * h / 3;
    }
    [['Hex nut', 21, 12, 8, rfPOnut], ['Moulded cap', 28, 2, 24, null]].forEach(function (c) {
      test('rfPO: ' + c[0] + ' to STEP: its cones whole (' + c[2] + ' CONICAL_SURFACE, ' + c[1] + ' faces; were planar facets), read back at ' + (c[4] ? 'the closed form' : 'the kernel\'s exact volume') + ' to 1e-9, no open edges', function () {
        if (!X) fail('exchange.js is not loaded');
        var ex = AnvilExamples.filter(function (e) { return e.name === c[0]; })[0];
        if (!ex) fail('no example ' + c[0]);
        var r = buildExample(ex), step = X.exportSTEP(r.model, r.build);
        assert(rfPOcount(/=ADVANCED_FACE\(/g, step) === c[1] && rfPOcount(/=CONICAL_SURFACE\(/g, step) === c[2] && rfPOcount(/=PLANE\(/g, step) === c[3], rfPOcount(/=ADVANCED_FACE\(/g, step) + ' faces, ' + rfPOcount(/=CONICAL_SURFACE\(/g, step) + ' cones, ' + rfPOcount(/=PLANE\(/g, step) + ' planes');
        assert(rfPOcount(/RATIONAL_B_SPLINE_CURVE/g, step) > 0, 'conic edges');
        var res = X.importFile(c[0] + '.step', step, { units: r.model.units });
        assert(res.stats.openEdges === 0, res.stats.openEdges + ' open edges');
        var v = K.massProps(K.meshFromBody(K.rebuild(X.newPartFromImport(res)).body), 1).volume, want = c[4] ? c[4]() : r.mp.volume;
        nearRel(v, want, 1e-9, 'read-back volume');
        var off = (v - want) / want;
        return rfPOcount(/=ADVANCED_FACE\(/g, step) + ' faces, read back d ' + off.toExponential(1) + (c[4] ? ', kernel d ' + ((r.mp.volume - want) / want).toExponential(1) : '');
      });
    });
  })();
