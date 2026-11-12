  // --- rfLU (2026-11-11, lane flatperf) --- a big perforated panel is quick after the build: Flat-Pattern
  // (kernel-sheetmetal.js mergeFlatRegions' inside test and unfold's far-side hole match, through flatPolyGrid: 307 s
  // → 1.8 s at 1800 holes), the drawing (drawing.js closeFreeEnds through boxGrid, drawing-hlr.js occluders largest
  // first + an early exit, endOk's circles by centre, drawing-curves.js near: 24.5 s → about 4 s at 600) and Geometry
  // Nesting (nest.js: an orientation that cannot fit is dropped before its raster, rows test only their own edges).
  // The outputs are unchanged (hash-checked on every example before / after); these tests count the work, so a
  // quadratic step coming back fails without depending on the machine's speed, and keep generous time bounds.
  (function () {
    group('rfLU: big perforated panels: Flat-Pattern, drawing and nesting near-linear in the holes');
    var T = 0.0598, R = 0.125, D = Drawing._;
    function rfLUcode(n, flanges, extra) {
      var cols = 30, rows = n / cols, sx = 22 / cols, sy = 46 / rows;
      var s = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, 0, 24, 48).end().baseFlange(' + T + ');\n';
      if (flanges) s += 'p.flange(1, ' + JSON.stringify(flanges) + ');\n';
      return s + 'p.sketch("Top", ' + T + ').circle(' + (1 + sx / 2) + ', ' + (1 + sy / 2) + ', ' + R + ').end().cut("through", { reverse: true });\n' +
        'p.linearPattern({ dir: "x", spacing: ' + sx + ', count: ' + cols + ', dir2: "z", spacing2: ' + sy + ', count2: ' + rows + ', reverse2: true });\n' + (extra || '');
    }
    var E4 = [[0, T, -24], [24, T, -24], [12, T, 0], [12, T, -48]];
    function rfLUflat(r) { var t0 = performance.now(), fl = K.flatPattern(r.model, r.build, r.mesh); fl.ms = performance.now() - t0; return fl; }
    function rfLUholes(fl) { return fl.loops.filter(function (l) { return K._.signedArea(l) < 0; }); }
    function rfLUops(n) { var r = build(rfLUcode(n)); noErrors(r); var g = K._.flatPolyGrid, o0 = g.ops; var fl = rfLUflat(r); return { ops: g.ops - o0, fl: fl }; }

    test('rfLU: Flat-Pattern of a 1800-hole 24 x 48 panel: 1800 round holes, blank 24 x 48, quick (was 307 s)', function () {
      var r = build(rfLUcode(1800));
      noErrors(r);
      var fl = rfLUflat(r), holes = rfLUholes(fl);
      assert(fl.loops.length === 1801 && holes.length === 1800, fl.loops.length + ' loops, ' + holes.length + ' holes');
      near(fl.size[0] * fl.size[1], 24 * 48, 1e-6, 'blank area');
      holes.forEach(function (h, i) { if (i % 97) return; nearRel(Math.abs(K._.signedArea(h)), Math.PI * R * R, 0.01, 'hole ' + i + ' area'); });
      var dxf = K.exportDXFFlat(fl, 'in'), circles = (dxf.match(/\nCIRCLE\r?\n/g) || []).length;
      assert(circles === 1800, circles + ' CIRCLEs in the flat DXF');
      assert(fl.ms < 30000, (fl.ms / 1000).toFixed(1) + ' s');
    });

    test('rfLU: the flat\'s inside tests grow linearly with the holes (flatPolyGrid.ops 150 → 600 holes under 6x; all-pairs is 16x)', function () {
      var a = rfLUops(150), b = rfLUops(600);
      assert(a.ops > 0 && b.ops > 0, 'the grid was used: ' + a.ops + ' / ' + b.ops);
      assert(b.ops / a.ops < 6, 'ops ' + a.ops + ' → ' + b.ops + ' (' + (b.ops / a.ops).toFixed(1) + 'x)');
      assert(rfLUholes(a.fl).length === 150 && rfLUholes(b.fl).length === 600, 'holes');
    });

    test('rfLU: perforated panels with one, two and four bends and holes across the bend lines unfold whole (bends, holes, notches)', function () {
      var across = 'p.sketch("Top", ' + T + ').circle(0.02, 10, 0.2).circle(23.98, 20, 0.2).circle(12, 0.03, 0.15).circle(6, 47.97, 0.3).end().cut("through", { reverse: true });\n';
      [[[E4[0]], 1], [[E4[0], E4[1]], 2], [E4, 4]].forEach(function (c) {
        var r = build(rfLUcode(90, c[0], across));
        noErrors(r);
        var fl = rfLUflat(r), holes = rfLUholes(fl);
        assert(fl.bends.length === c[1], c[1] + ' bends: ' + fl.bends.length);
        // the 90 pattern holes stay round holes; a hole across a bend line is a hole or a notch, never lost
        var round = holes.filter(function (h) { return Math.abs(Math.abs(K._.signedArea(h)) - Math.PI * R * R) < 0.01 * Math.PI * R * R; });
        assert(round.length === 90, c[1] + ' bends: ' + round.length + ' pattern holes');
        assert(fl.loops.length >= 91 && fl.loops.length <= 95, c[1] + ' bends: ' + fl.loops.length + ' loops');
        assert(K._.signedArea(fl.loops[0]) > 0, 'outline first');
      });
    });

    test('rfLU: mergeFlatRegions with many holes over two regions and a notch = outline + every hole (the grid path)', function () {
      var A = [[0, 0], [10, 0], [10, 10], [0, 10]], B = [[10, 0], [20, 0], [20, 10], [10, 10]], ra = [A], rb = [B], n = 0;
      for (var i = 0; i < 9; i++) for (var j = 0; j < 9; j++) {
        var cx = 1 + i * 2.1, cy = 1 + j * 1.05, h = [];
        if (Math.abs(cx - 10) < 0.6) continue;
        for (var k = 0; k < 16; k++) { var t = -2 * Math.PI * k / 16; h.push([cx + 0.3 * Math.cos(t), cy + 0.3 * Math.sin(t)]); }
        (cx < 10 ? ra : rb).push(h); n++;
      }
      var notch = [[19, 4], [21, 4], [21, 6], [19, 6]];
      var out = K._.mergeFlatRegions([ra, rb], [notch], 1e-4);
      assert(out && out.length === n + 1, (out && out.length) + ' loops, want ' + (n + 1));
      var area = out.reduce(function (s, l) { return s + K._.signedArea(l); }, 0), holeA = Math.abs(K._.signedArea(ra[1]));
      near(area, 200 - 2 - n * holeA, 1e-9, 'blank area');
    });

    test('rfLU: closeFreeEnds visits near-linear work (boxGrid.ops 1000 → 4000 short lines under 8x) and joins ends as before', function () {
      function lines(n) {
        var out = [], s = Math.ceil(Math.sqrt(n));
        for (var i = 0; i < n; i++) { var x = (i % s) * 1.0, y = Math.floor(i / s) * 1.0; out.push([x, y, x + 0.5, y], [x + 0.5 + 2e-4, y + 1e-4, x + 0.9, y]); }
        return out;
      }
      var g = D.boxGrid, o0 = g.ops, a = lines(500); D.closeFreeEnds(a, [], [], 1e-4);
      var o1 = g.ops, b = lines(2000); D.closeFreeEnds(b, [], [], 1e-4);
      var oa = o1 - o0, ob = g.ops - o1;
      assert(ob / oa < 8, 'ops ' + oa + ' → ' + ob);
      // each gap of 2.2e-4 (< 3 tol) is closed: the first piece's end carried onto the second piece
      var bad = a.filter(function (l, i) { return i % 2 === 0 && Math.hypot(l[2] - a[i + 1][0], l[3] - a[i + 1][1]) > 1e-12 && Math.abs(l[3] - a[i + 1][1]) > 1e-3; });
      assert(!bad.length, bad.length + ' gaps left');
    });

    test('rfLU: three-view drawing of a 600-hole panel in a generous bound (was 24.5 s), every hole a circle in the Top view', function () {
      var r = build(rfLUcode(600));
      noErrors(r);
      var t0 = performance.now(), doc = Drawing.newDrawing(r.model, {});
      Drawing.standard3View(doc, r.mesh, 'in');
      var sh = Drawing.compute(doc, r.mesh, r.model), ms = performance.now() - t0;
      var dxf = Drawing.toDXF(sh, { version: 'R2000' }), circles = (dxf.match(/\nCIRCLE\r?\n/g) || []).length;
      assert(circles >= 600, circles + ' circles');
      assert(ms < 40000, (ms / 1000).toFixed(1) + ' s');
    });

    test('rfLU: Geometry Nesting: a perforated part larger than the sheet is refused at once at 5° steps (no raster), one that fits is rastered row by row', function () {
      var r = build(rfLUcode(300));
      noErrors(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh), parts = Nest.partsFromLoops(fl.loops, 'Panel');
      assert(parts.length === 1, parts.length + ' parts');
      parts[0].qty = 2;
      var s = Nest.stats, r0 = s.rasters, t0 = performance.now();
      var no = Nest.run(parts, { width: 20, height: 40, spacing: 0.1, margin: 0.25, rotation: 5 }), ms = performance.now() - t0;
      assert(no.placed === 0 && no.unplaced.length === 2, 'unplaced: ' + no.placed);
      assert(s.rasters === r0, (s.rasters - r0) + ' rasters for a part that fits nowhere');
      assert(ms < 5000, ms.toFixed(0) + ' ms');
      var r1 = s.rasters, w0 = s.rowTests, yes = Nest.run(parts, { width: 96, height: 48, spacing: 0.1, margin: 0.25, rotation: 90 });
      assert(yes.placed === 2 && Nest.check(yes).ok, 'placed ' + yes.placed);
      var nr = s.rasters - r1, edges = parts[0].loops.reduce(function (t, L) { return t + Nest.loopPoly(L, yes.opts.tol).length; }, 0);
      assert(nr >= 1 && (s.rowTests - w0) < nr * edges * 8, 'row tests ' + (s.rowTests - w0) + ' for ' + nr + ' rasters of ' + edges + ' edges');
    });
  })();
