  // --- rfNQ (2026-11-16, lane NQ smbends) --- Insert Bends on sheet-metal parts read back from Anvil's STEP: hems,
  // slanted / relieved corners and forming tools give the part's own blank (or say why they cannot).
  // Each part: built, its own flat; exportSTEP, importFile, newPartFromImport, Insert Bends (thickness found, K given),
  // flat; compared by outline area, net area, hole count and each bend line's place (mid point from the outline's
  // centroid, length, angle). Lane NO's report (test-reports/2026-11-16-step-sheetmetal.md) has the defects.
  (function () {
    group('rfNQ: Insert Bends on imported parts: hems, mitred / closed / relieved corners and forming tools give the part\'s own blank');
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    var G16 = 0.0598, G11 = 0.1196;
    function rfNQhead(T, R, KF) { return 'p.units("in");\np.sheet(' + T + ', ' + (R == null ? T : R) + ', ' + (KF == null ? 0.5 : KF) + ');\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n'; }
    function rfNQarea(l) { return Math.abs(K.signedArea(l)); }
    function rfNQcen(l) { var a = 0, cx = 0, cy = 0; for (var i = 0; i < l.length; i++) { var p = l[i], q = l[(i + 1) % l.length], c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; } return [cx / (3 * a), cy / (3 * a)]; }
    function rfNQsig(fl) {
      var o = fl.loops[0], n = rfNQarea(o), C = rfNQcen(o);
      fl.loops.slice(1).forEach(function (h) { n -= rfNQarea(h); });
      var bl = fl.bends.map(function (b) { var m = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2]; return [Math.hypot(m[0] - C[0], m[1] - C[1]), Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), b.angle]; })
        .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      return { outer: rfNQarea(o), net: n, holes: fl.loops.length - 1, bends: bl };
    }
    // -> { own, ib (flat signatures), fl (the Insert Bends flat), b3 }
    function rfNQtrip(code, fixed) {
      if (!X) fail('exchange.js is not loaded');
      var r = build(code); noErrors(r);
      var fl0 = K.flatPattern(r.model, r.build, r.mesh), m2 = X.newPartFromImport(X.importFile('rfNQ.step', X.exportSTEP(r.model, r.build), { units: 'in' }));
      new K.Builder(m2).insertBends(fixed, { kFactor: r.model.sheet.kFactor });
      var b3 = K.rebuild(m2);
      assert(!Object.keys(b3.errors).length, 'Insert Bends: ' + JSON.stringify(b3.errors));
      var fl = K.flatPattern(m2, b3, K.meshFromBody(b3.body));
      return { own: rfNQsig(fl0), ib: rfNQsig(fl), fl: fl, fl0: fl0 };
    }
    function rfNQsame(t, tag, noPlace) {
      near(t.ib.outer, t.own.outer, 1e-6 * t.own.outer, tag + ': blank outline area');
      near(t.ib.net, t.own.net, 1e-6 * t.own.net, tag + ': blank net area');
      assert(t.ib.holes === t.own.holes, tag + ': holes ' + t.ib.holes + ', own ' + t.own.holes);
      assert(t.ib.bends.length === t.own.bends.length, tag + ': bends ' + t.ib.bends.length + ', own ' + t.own.bends.length);
      if (!noPlace) t.own.bends.forEach(function (b, i) { var q = t.ib.bends[i]; near(q[0], b[0], 1e-6, tag + ': bend ' + i + ' place'); near(q[1], b[1], 1e-6, tag + ': bend ' + i + ' length'); near(q[2], b[2], 1e-6, tag + ': bend ' + i + ' angle'); });
    }
    function rfNQnoWarn(t, tag) { assert(!t.fl.warnings.length, tag + ': ' + t.fl.warnings.join('; ')); }

    test('rfNQ: open, closed, teardrop and rolled hems on 16 ga and 11 ga (R .125 K .45) through STEP: Insert Bends takes each hem as its bend (was refused: "no sharp corner"), the blank and the bend line are the part\'s own to 1e-6', function () {
      var out = [];
      [[G16, G16, 0.5], [G11, 0.125, 0.45]].forEach(function (g) {
        K.HEM_TYPES.forEach(function (ht) {
          var tag = g[0] + ' ' + ht, t = rfNQtrip(rfNQhead(g[0], g[1], g[2]) + 'p.hem(0.5, [[2, ' + g[0] + ', 0]], { hemType: "' + ht + '" });\n', [1, g[0], 1.3]);
          rfNQsame(t, tag); rfNQnoWarn(t, tag);
          out.push(tag + ' ' + t.ib.outer.toFixed(4));
        });
      });
      return out.join(', ');
    });
    test('rfNQ: an open hem beside a 90 deg flange (2 bends; was the flange only, the blank 12 % short), a rolled hem on the right edge, a closed hem on the back edge (the arc seen from its other end): the part\'s own blank', function () {
      var T = G16, a = rfNQtrip(rfNQhead(T) + 'p.hem(0.5, [[2, ' + T + ', 0]], { hemType: "open" });\np.flange(1, [[2, ' + T + ', 3]]);\n', [1, T, 1.3]);
      rfNQsame(a, 'open + flange'); rfNQnoWarn(a, 'open + flange');
      var b = rfNQtrip(rfNQhead(T) + 'p.hem(0.4, [[4, ' + T + ', 1.5]], { hemType: "rolled" });\n', [1, T, 1.3]);
      rfNQsame(b, 'rolled right'); rfNQnoWarn(b, 'rolled right');
      var c = rfNQtrip(rfNQhead(T) + 'p.hem(0.5, [[2, ' + T + ', 3]], { hemType: "closed" });\n', [1, T, 1.3]);
      rfNQsame(c, 'closed back'); rfNQnoWarn(c, 'closed back');
      return [a, b, c].map(function (t) { return t.ib.outer.toFixed(4); }).join(' / ') + ' in²';
    });
    test('rfNQ: a Ø.25 hole in the base under an open hem\'s return stays a hole of the blank (a hole with metal over it that runs on past it is no form)', function () {
      var T = G16, t = rfNQtrip(rfNQhead(T) + 'p.sketch("Top", ' + T + ').circle(2, -0.25, 0.125).end().extrude(1, { cut: true, through: true, both: true });\np.hem(0.5, [[2, ' + T + ', 0]], { hemType: "open" });\n', [1, T, 1.3]);
      rfNQsame(t, 'hole under hem'); rfNQnoWarn(t, 'hole under hem');
      assert(t.ib.holes === 1, 'holes ' + t.ib.holes);
      return 'net ' + t.ib.net.toFixed(4) + ' in²';
    });

    // a 16 ga tray, four inside flanges, R = T
    var T = G16, R = G16, TRAY = rfNQhead(T, R) + [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    var F4 = [[T / 2, 0.6, R + T], [4 - T / 2, 0.6, R + T], [4 - R - T, 0.6, 3 - T / 2], [T / 2, 0.6, 3 - R - T]];
    test('rfNQ: Closed Corner butt / overlap / underlap at the four corners of a 16 ga tray through STEP: the slanted bend ends are drawn from the part (ibEnds), the blank is the part\'s own (was 0.014 to 0.034 in² big, no warning)', function () {
      var out = [];
      ['butt', 'overlap', 'underlap'].forEach(function (ct) {
        var t = rfNQtrip(TRAY + 'p.closedCorner(' + JSON.stringify(F4) + ', { cornerType: "' + ct + '", gap: 0.01 });\n', [1, T, 1.3]);
        rfNQsame(t, ct); rfNQnoWarn(t, ct);
        out.push(ct + ' ' + t.ib.outer.toFixed(4));
      });
      return out.join(', ');
    });
    test('rfNQ: circular, obround, constant-width and rectangular Corner Relief R .25 between two inside flanges (16 ga) through STEP: the relief\'s cut through the bends is in the blank (was 0.003 to 0.020 in² big)', function () {
      var out = [];
      ['circular', 'obround', 'constantWidth', 'rect'].forEach(function (rt) {
        var t = rfNQtrip(rfNQhead(T) + 'p.flange(1, [[4, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[2, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });\np.cornerRelief([[' + (4 - 2 * T) + ', ' + T + ', ' + (3 - 2 * T) + ']], 0.25, { reliefType: "' + rt + '" });\n', [1, T, 1.3]);
        rfNQsame(t, rt, true); rfNQnoWarn(t, rt);   // (the part's own bend lines run on into the relief; Insert Bends' stop where the bend's metal does)
        out.push(rt + ' ' + t.ib.outer.toFixed(4));
      });
      return out.join(', ');
    });
    test('rfNQ: a Miter Flange round a corner (L profile) through STEP: its mitre-cut bend ends cannot say whether the CAD squared that corner, so the flat warns (was silent: the blank 0.017 in² over Anvil\'s own square-notch flat)', function () {
      var t = rfNQtrip('p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.sketch("Right").line(0, 0.06, 0, 1.06).line(0, 1.06, 0.5, 1.06).end();\np.miterFlange([[2, 0.06, 0], [0, 0.06, 1]], {});\n', [1, 0.06, 1.3]);
      assert(t.ib.bends.length === 4, 'bends ' + t.ib.bends.length);
      near(t.ib.outer, t.own.outer, 0.02, 'blank outline area');
      assert(t.fl.warnings.some(function (w) { return /ends on a mitre/.test(w); }), 'mitre warning: ' + t.fl.warnings.join('; '));
      return 'blank ' + (t.ib.outer - t.own.outer).toExponential(2) + ' in² off, warned';
    });

    test('rfNQ: a dimple and a rib (16 ga) through STEP: Insert Bends leaves each form on its wall (was a hole where the dimple was / "the bends close a ring"), one bend, the part\'s own blank, the footprint a FORM mark', function () {
      var out = [];
      ['dimple', 'rib'].forEach(function (ft) {
        var t = rfNQtrip(rfNQhead(T) + 'p.formingTool("' + ft + '", [2, ' + T + ', 1.5]);\np.flange(1, [[2, ' + T + ', 3]]);\n', [0.5, T, 0.5]);
        rfNQsame(t, ft); rfNQnoWarn(t, ft);
        var marks = (t.fl.etch || []).filter(function (it) { return it.form != null && it.kind === 'mark'; });
        assert(marks.length === 1, ft + ': FORM marks ' + marks.length);
        var dx = K.exportDXFFlat(t.fl, 'in');
        assert(/\nFORM\n/.test(dx), ft + ': a FORM layer in the DXF');
        out.push(ft + ' ' + t.ib.outer.toFixed(4));
      });
      return out.join(', ');
    });
    test('rfNQ: a louver, a lance and an extruded hole through STEP: no bogus bend, the outline is the part\'s own, and the flat says what the solid cannot carry (the slits\' width; the collar\'s pre-pierce hole)', function () {
      var out = [];
      [['louver', /cut open along 1 edge/], ['lance', /cut open along 2 edges/], ['extrudedHole', /pre-pierce hole/]].forEach(function (c) {
        var t = rfNQtrip(rfNQhead(T) + 'p.formingTool("' + c[0] + '", [2, ' + T + ', 1.5]);\np.flange(1, [[2, ' + T + ', 3]]);\n', [0.5, T, 0.5]);
        assert(t.ib.bends.length === 1, c[0] + ': bends ' + t.ib.bends.length);
        near(t.ib.outer, t.own.outer, 1e-6 * t.own.outer, c[0] + ': blank outline area');
        assert(t.fl.warnings.some(function (w) { return c[1].test(w); }), c[0] + ': warning ' + t.fl.warnings.join('; '));
        assert(!t.fl.warnings.some(function (w) { return /less metal/.test(w); }), c[0] + ': no metal warning');
        out.push(c[0] + ' net ' + (t.ib.net - t.own.net).toExponential(1));
      });
      return out.join(', ');
    });
  })();
