  // --- rfKQ (2026-11-09, lane stepout3) --- The last two customer-STEP shortfalls of test-reports/2026-11-09-step-import.md:
  // (1) a round hole through a bend in Anvil's own STEP: the hole's points sit on the bend's facets' chords (Unfold, cut,
  // Fold), so the bend was written as facets and Insert Bends on the file found only the other bend. Now each radial wall
  // strip of the hole is a ruled rational B-spline face between two rational cubic rails that lie exactly on the bend's
  // cylinders (exchange.js radialWalls / railOf / wallFace), the hole's points moved onto the cylinders in the file; the
  // reader keeps the rails' samples at the cylinder's own step (cylSubsample) and joins the rails point to point
  // (ruledFace). (2) An R .5 mitred tray through Anvil's STEP: Insert Bends' rounded records met at the corners with a
  // tapered bend end, which bendSurfaceNotches took for nobody's corner (the neighbour probed in the middle of its end:
  // air) and notched both strips: 2 % short. Rounded Insert Bends records (ibRound) probe the neighbour across its end.
  // T .06, K .44, inches. OpenCascade reading the same files: rows "rfKQ" of tests/occt-tests.html.
  (function () {
    group('rfKQ: customer STEP: a round hole through a bend written whole; a mitred R .5 tray\'s Insert Bends flat');
    var T = 0.06, KF = 0.44, R = 0.25, BA = Math.PI / 2 * (R + KF * T), MID = R + T - BA / 2;
    function rfKQarea(loops) { return loops.reduce(function (s, l, i) { var a = Math.abs(K.signedArea(l)); return s + (i ? -a : a); }, 0); }
    function rfKQu(cut) {
      return 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + KF + ');\np.sketch("Top").rect(0, -4, 2, 4).end().baseFlange();\n' +
        'p.flange(2, [[0, ' + T + ', 2], [2, ' + T + ', 2]], { position: "inside" });\np.unfold([1, ' + T + ', 2], null);\n' +
        (cut ? 'p.sketch("Top")' + cut + '.end().extrude(1, { cut: true, through: true, both: true });\n' : '') + 'p.fold(null);\n';
    }
    // the U channel's exact volume less its holes: a hole's part in the bend zone (x ∈ [MID ± BA / 2] of the unfolded
    // part) wraps to radial walls, so it takes area / (R + K·T) × ((R + T)² − R²) / 2; the rest takes area × T
    function rfKQclip(poly, x, less) {
      var out = [];
      for (var i = 0; i < poly.length; i++) {
        var a = poly[i], b = poly[(i + 1) % poly.length], ia = less ? a[0] <= x : a[0] >= x, ib = less ? b[0] <= x : b[0] >= x;
        if (ia) out.push(a);
        if (ia !== ib) out.push([x, a[1] + (x - a[0]) / (b[0] - a[0]) * (b[1] - a[1])]);
      }
      return out;
    }
    var plainVol = null;
    function rfKQexact(own) {
      if (plainVol == null) { var pl = build(rfKQu('')); noErrors(pl); plainVol = pl.mp.volume; }
      var v = plainVol;
      own.loops.slice(1).forEach(function (h) {
        var bz = rfKQclip(rfKQclip(h, MID - BA / 2, false), MID + BA / 2, true), A = Math.abs(K.signedArea(h)), Ab = bz.length > 2 ? Math.abs(K.signedArea(bz)) : 0;
        v -= Ab / (R + KF * T) * ((R + T) * (R + T) - R * R) / 2 + (A - Ab) * T;
      });
      return v;
    }
    // Anvil's STEP of the part, read back, Insert Bends at the base (K .44)
    function rfKQtrip(cut) {
      var src = build(rfKQu(cut)); noErrors(src);
      var own = K.flatPattern(src.model, src.build, src.mesh), step = Exchange.exportSTEP(src.model, src.build, { faceted: true });
      var imp = Exchange.importFile('customer.step', step, { units: 'in' }), m = Exchange.newPartFromImport(imp);
      assert(!imp.stats.openEdges && !imp.warnings.length, 'read back closed: ' + imp.stats.openEdges + ' open edges ' + imp.warnings.join('; '));
      var back = K.massProps(K.meshFromBody(K.rebuild(m).body)).volume;
      new K.Builder(m).insertBends([1, 0, 2], { kFactor: KF });
      var b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, 'Insert Bends: ' + JSON.stringify(b.errors));
      return { src: src, own: own, step: step, back: back, flat: K.flatPattern(m, b, K.meshFromBody(b.body)), tris: b.body.polygons.length };
    }
    function rfKQcount(s, re) { return (s.match(re) || []).length; }

    test('rfKQ: a Ø.25 hole through the middle of an R .25 bend: Anvil\'s STEP writes both bends whole (4 cylinders, the hole\'s walls ruled B-splines on rational rails), read back = the exact volume within 1e-9, Insert Bends finds both bends, flat hole = the developed hole within 1e-6, no warning (was: one bend, the flat 39 % short)', function () {
      var r = rfKQtrip('.circle(' + MID + ', -2, 0.125)');
      assert(rfKQcount(r.step, /=CYLINDRICAL_SURFACE\(/g) === 4, 'both bends whole: ' + rfKQcount(r.step, /=CYLINDRICAL_SURFACE\(/g) + ' cylinders');
      assert(rfKQcount(r.step, /RATIONAL_B_SPLINE_SURFACE/g) >= 32 && rfKQcount(r.step, /RATIONAL_B_SPLINE_CURVE/g) >= 64, 'the walls and rails: ' + rfKQcount(r.step, /RATIONAL_B_SPLINE_SURFACE/g) + ' / ' + rfKQcount(r.step, /RATIONAL_B_SPLINE_CURVE/g));
      var ex = rfKQexact(r.own);
      nearRel(r.back, ex, 1e-9, 'read-back volume = the exact U less the wrapped hole');
      nearRel(r.src.mp.volume, ex, 1e-9, 'the part\'s own volume (curve-corrected facets) agrees');
      assert(r.tris < 4000, 'read in ' + r.tris + ' triangles (the rails kept at the cylinder\'s own step)');
      var fl = r.flat;
      assert(fl.bends.length === 2 && fl.bends.every(function (b) { return Math.abs(b.R - R) < 1e-9; }), 'two bends R .25: ' + fl.bends.map(function (b) { return b.label; }).join('; '));
      assert(!fl.warnings.length, 'no warning: ' + fl.warnings.join('; '));
      assert(fl.loops.length === 2, 'outline + hole: ' + fl.loops.length);
      near(Math.abs(K.signedArea(fl.loops[1])), Math.abs(K.signedArea(r.own.loops[1])), 1e-6, 'hole area = the developed 32-gon');
      near(rfKQarea(fl.loops), rfKQarea(r.own.loops), 1e-6, 'blank area');
      near(Math.max(fl.size[0], fl.size[1]), Math.max(r.own.size[0], r.own.size[1]), 1e-9, 'flat length');
      return 'hole ' + Math.abs(K.signedArea(fl.loops[1])).toFixed(9) + ' in², volume d ' + ((r.back - ex) / ex).toExponential(1);
    });

    test('rfKQ: holes across a bend\'s tangent line (either side), past both, and two in one bend: read back exact (1e-9), both bends found, blank = the part\'s own flat within 1e-6', function () {
      var out = [];
      [['.circle(0.3, -2, 0.1)', 'across the wall side'], ['.circle(-0.1, -2, 0.1)', 'across the base side'], ['.circle(' + MID + ', -2, 0.3)', 'past both tangent lines'],
        ['.circle(' + MID + ', -1, 0.1).circle(' + MID + ', -3, 0.1)', 'two holes']].forEach(function (c) {
        var r = rfKQtrip(c[0]), ex = rfKQexact(r.own);
        assert(rfKQcount(r.step, /=CYLINDRICAL_SURFACE\(/g) >= 4, c[1] + ': bends whole');
        nearRel(r.back, ex, 1e-9, c[1] + ': read-back volume');
        assert(r.flat.bends.length === 2 && !r.flat.warnings.length, c[1] + ': bends ' + r.flat.bends.length + ' ' + r.flat.warnings.join('; '));
        assert(r.flat.loops.length === r.own.loops.length, c[1] + ': loops ' + r.flat.loops.length + ' / ' + r.own.loops.length);
        near(rfKQarea(r.flat.loops), rfKQarea(r.own.loops), 1e-6, c[1] + ': blank area');
        out.push(c[1] + ' ' + ((r.back - ex) / ex).toExponential(1));
      });
      return out.join('; ');
    });

    test('rfKQ: a mitred tray 4 × 3 × 1 with R .5 (and R .25, Material Outside) through Anvil\'s STEP: Insert Bends\' flat = the tray\'s own flat point for point within 1e-6, no warning (was 27.80 of 29.04 in², warned)', function () {
      var out = [];
      [[0.5, 'inside'], [0.25, 'inside'], [0.5, 'outside']].forEach(function (c) {
        var src = build('p.units("in");\np.sheet(' + T + ', ' + c[0] + ', ' + KF + ');\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
          'p.flange(1, [[2, ' + T + ', 0], [4, ' + T + ', 1.5], [2, ' + T + ', 3], [0, ' + T + ', 1.5]], { position: "' + c[1] + '" });\n');
        noErrors(src);
        var own = K.flatPattern(src.model, src.build, src.mesh), step = Exchange.exportSTEP(src.model, src.build, { faceted: true });
        var m = Exchange.newPartFromImport(Exchange.importFile('tray.step', step, { units: 'in' }));
        new K.Builder(m).insertBends([2, 0, 1.5], { kFactor: KF });
        var b = K.rebuild(m), fl = K.flatPattern(m, b, K.meshFromBody(b.body)), tag = 'R ' + c[0] + ' ' + c[1];
        assert(!Object.keys(b.errors).length, tag + ': ' + JSON.stringify(b.errors));
        assert(fl.bends.length === 4 && !fl.warnings.length, tag + ': bends ' + fl.bends.length + '; ' + fl.warnings.join('; '));
        assert(fl.loops.length === 1 && fl.loops[0].length === own.loops[0].length, tag + ': outline points ' + fl.loops[0].length + ' / ' + own.loops[0].length);
        function rel(l) { var mx = Infinity, my = Infinity; l.forEach(function (p) { mx = Math.min(mx, p[0]); my = Math.min(my, p[1]); }); return l.map(function (p) { return [p[0] - mx, p[1] - my]; }); }
        var A = rel(own.loops[0]), B = rel(fl.loops[0]), worst = 0;
        A.forEach(function (p) { worst = Math.max(worst, Math.min.apply(null, B.map(function (q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }))); });
        assert(worst < 1e-6, tag + ': outline off the tray\'s own by ' + worst);
        near(rfKQarea(fl.loops), rfKQarea(own.loops), 1e-6, tag + ': blank area');
        out.push(tag + ' ' + rfKQarea(fl.loops).toFixed(6) + ' in²');
      });
      return out.join('; ');
    });

    test('rfKQ: unchanged where Anvil\'s writer already wrote the bend whole: the slot through a bend keeps its planes (no B-spline wall), a hole in the base (no bend) writes no B-spline', function () {
      var r = rfKQtrip('.rect(' + (MID - 0.125) + ', -2.375, 0.25, 0.75)');
      assert(!/B_SPLINE/.test(r.step), 'the slot: lines, circles and planes only');
      nearRel(r.back, r.src.mp.volume, 1e-9, 'slot round trip');
      var p = rfKQtrip('.circle(1, -1, 0.1)');
      assert(!/B_SPLINE/.test(p.step), 'a hole in the base');
      assert(p.flat.bends.length === 2 && !p.flat.warnings.length, 'base hole: both bends');
    });
  })();
  // --- end rfKQ ---
