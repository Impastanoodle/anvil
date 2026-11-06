  // --- rfJE (2026-11-05, lane flatopts) --- Flat-Pattern1's Merge faces / Simplify bends / Show slit / Corner
  // treatment (model.flatOptions, Kernel.flatOptionsOf / FLAT_OPTION_DEFAULTS): defaults leave every flat as it was,
  // each switch changes the flat (loops, areas or entity counts), the DXF stays laser-clean, Builder / generateScript
  // round trip. 16 ga steel (T = R = 0.0598, K = 0.5) and the rfDQ ripped box (wall .06, rip gap .03).
  (function () {
    group('rfJE: Flat-Pattern options (Merge faces, Simplify bends, Show slit, Corner treatment)');
    var T = 0.0598, R = 0.0598, BA = Math.PI / 2 * (R + 0.5 * T);
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\n';
    var L42 = HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1.5, [[4, ' + T + ', 1]], { position: "inside", lengthRef: "outer" });\n';
    var TRAY = HEAD + 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "bendOutside", lengthRef: "outer" });\n'; }).join('');
    var HEM = HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.hem(0.5, [[2, ' + T + ', 2], [4, ' + T + ', 1]], { hemType: "closed", hemPosition: "inside", miter: true, miterGap: 0.02 });\n';
    var M60 = HEAD + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1, [[3, ' + T + ', 4], [6, ' + T + ', 2]], { angle: 60, position: "bendOutside", miter: true });\n';
    var BOXW = 0.06, BOXG = 0.03;
    var IB = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(' + BOXW + ', [[1, 1, -1]]);\n' +
      'p.rip([[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]], ' + BOXG + ');\np.insertBends([1, 0, -1], { radius: 0.06 });\n';
    function rfJEbuild(code) {
      var model = K.newModel('Test');
      K.runScript(model, code);
      var b = K.rebuild(model), mesh = K.meshFromBody(b.body);
      return { model: model, build: b, mesh: mesh, errors: b.errors, vol: K.massProps(mesh, model.density).volume };
    }
    function rfJEflat(r, fo) {
      var m = r.model, keep = m.flatOptions;
      if (fo) m.flatOptions = fo; else delete m.flatOptions;
      try { return K.flatPattern(m, r.build, r.mesh); } finally { if (keep) m.flatOptions = keep; else delete m.flatOptions; }
    }
    function rfJEarea(f) { return f.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function rfJEeq(a, b, msg) { assert(a === b, (msg || 'value') + ': ' + a + ', expected ' + b); }
    function rfJEpts(f) { return f.loops.reduce(function (s, l) { return s + l.length; }, 0); }
    function rfJEok(r) { var ids = Object.keys(r.errors); assert(!ids.length, 'build errors: ' + ids.map(function (k) { return r.errors[k]; }).join('; ')); }
    function rfJEdxf(f) { var d = K.exportDXFFlat(f, 'in', { version: 'R2000', style: 'entities' }), c = DxfCheck.check(d, { units: 'in' }); assert(c.ok, 'dxf-check: ' + c.errors.join('; ')); return d; }

    test('rfJE: defaults: flatOptionsOf({}) = Merge faces, Simplify bends, Corner treatment on, Show slit off; a part with the defaults spelled out flattens exactly as one without flatOptions (L, tray, mitred hem, 60° mitre, ripped box)', function () {
      var d = K.flatOptionsOf({});
      assert(d.mergeFaces === true && d.simplifyBends === true && d.showSlit === false && d.cornerTreatment === true, 'defaults: ' + JSON.stringify(d));
      rfJEeq(JSON.stringify(K.flatOptionsOf({ flatOptions: { showSlit: 1, mergeFaces: 0 } })), JSON.stringify({ mergeFaces: false, simplifyBends: true, showSlit: true, cornerTreatment: true }), 'coerced to booleans');
      [L42, TRAY, HEM, M60, IB].forEach(function (code, i) {
        var r = rfJEbuild(code);
        rfJEok(r);
        var f0 = rfJEflat(r), f1 = rfJEflat(r, { mergeFaces: true, simplifyBends: true, showSlit: false, cornerTreatment: true });
        assert(JSON.stringify(f0) === JSON.stringify(f1), 'part ' + i + ': the flat with the defaults spelled out is the same');
        assert(!('regionLines' in f0) && !('bendRegions' in f0), 'part ' + i + ': no region data by default');
      });
      return 'ok';
    });

    test('rfJE: Merge faces cleared (L bracket): the outline and the DXF are unchanged; the bend region is its own face, BA × 2, with two tangent lines 2 long, BA apart, either side of the bend line', function () {
      var r = rfJEbuild(L42), f0 = rfJEflat(r), f1 = rfJEflat(r, { mergeFaces: false });
      assert(JSON.stringify(f0.loops) === JSON.stringify(f1.loops), 'outline unchanged');
      rfJEeq(rfJEdxf(f1), rfJEdxf(f0), 'DXF unchanged (a laser would cut tangent lines)');
      rfJEeq(f1.bendRegions.length, 1, 'one bend region');
      near(Math.abs(K.signedArea(f1.bendRegions[0])), BA * 2, 1e-9, 'bend region area BA × 2');
      rfJEeq(f1.regionLines.length, 2, 'two tangent lines');
      var b = f1.bends[0], xs = f1.regionLines.map(function (l) { near(Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]), 2, 1e-9, 'tangent line length'); near(l.a[0], l.b[0], 1e-9, 'along Y'); rfJEeq(l.bend, 0, 'bend index'); return l.a[0]; });
      near(Math.abs(xs[0] - xs[1]), BA, 1e-9, 'BA apart');
      near((xs[0] + xs[1]) / 2, b.a[0], 1e-9, 'centred on the bend line');
      // Grain direction turns them with the flat
      r.model.flatGrain = { at: [0, T, 1], dir: [0, 0, 1] };
      var f2 = rfJEflat(r, { mergeFaces: false });
      f2.regionLines.forEach(function (l) { near(l.a[1], l.b[1], 1e-9, 'grain: the tangent lines run along X'); });
      delete r.model.flatGrain;
      return 'ok';
    });

    test('rfJE: Merge faces cleared (tray, four separate flanges): eight tangent lines, each inside the blank, four bend regions', function () {
      var r = rfJEbuild(TRAY), f = rfJEflat(r, { mergeFaces: false });
      rfJEeq(f.bendRegions.length, 4, 'bend regions');
      rfJEeq(f.regionLines.length, 8, 'tangent lines: ' + f.regionLines.length);
      function pip(p, l) { var c = false; for (var i = 0, j = l.length - 1; i < l.length; j = i++) { var a = l[i], q = l[j]; if ((a[1] > p[1]) !== (q[1] > p[1]) && p[0] < (q[0] - a[0]) * (p[1] - a[1]) / (q[1] - a[1]) + a[0]) c = !c; } return c; }
      var lens = f.regionLines.map(function (l) {
        var m = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2], L = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
        assert(pip(m, f.loops[0]), 'midpoint inside the blank');
        return Math.round(L * 1e6) / 1e6;
      }).sort();
      rfJEeq(lens.join(' '), '3 3 3 3 4 4 4 4', 'each runs its edge\'s length');
      return 'ok';
    });

    test('rfJE: Simplify bends cleared (closed hems mitred at a corner): each mitre end of the bend strip is its developed curve, not the chord: more outline points, more blank area (closer to the folded volume / T), same size; DXF clean', function () {
      var r = rfJEbuild(HEM);
      rfJEok(r);
      var f0 = rfJEflat(r), f1 = rfJEflat(r, { simplifyBends: false });
      assert(rfJEpts(f1) >= rfJEpts(f0) + 2 * 31, 'outline points: ' + rfJEpts(f0) + ' -> ' + rfJEpts(f1));
      var a0 = rfJEarea(f0), a1 = rfJEarea(f1);
      assert(a1 > a0 + 1e-5, 'blank area: ' + a0 + ' -> ' + a1);
      assert(Math.abs(r.vol / T - a1) < Math.abs(r.vol / T - a0), 'closer to the folded volume / T: ' + r.vol / T + ' (' + a0 + ' -> ' + a1 + ')');
      near(f1.size[0], f0.size[0], 1e-9, 'width'); near(f1.size[1], f0.size[1], 1e-9, 'height');
      rfJEeq(f1.bends.length, f0.bends.length, 'bends');
      rfJEdxf(f1);
      // a part with no mitre-plane strip end is unchanged
      var r2 = rfJEbuild(L42);
      assert(JSON.stringify(rfJEflat(r2, { simplifyBends: false })) === JSON.stringify(rfJEflat(r2)), 'L bracket: unchanged');
      return 'ok';
    });

    test('rfJE: Show slit (ripped box, Insert Bends): a slit the rip gap (.03) wide and R + T (.12) long into each of the four corners where two bend regions meet: blank area − 4 (g·(R + T) + g²/4) exactly, 3 more outline points per corner; the tray (no Rip) takes the 0.004 in default gap', function () {
      var r = rfJEbuild(IB);
      rfJEok(r);
      var f0 = rfJEflat(r), f1 = rfJEflat(r, { showSlit: true }), g = BOXG, Ls = 0.06 + BOXW;
      near(rfJEarea(f0) - rfJEarea(f1), 4 * (g * Ls + g * g / 4), 1e-9, 'four slits');
      rfJEeq(f1.loops.length, f0.loops.length, 'no new hole (the slits open on the outline)');
      rfJEeq(f1.loops[0].length, f0.loops[0].length + 12, 'outline points');
      near(f1.size[0], f0.size[0], 1e-9, 'size unchanged');
      rfJEdxf(f1);
      var t = rfJEbuild(TRAY), g2 = 0.004, Ls2 = R + T;
      near(rfJEarea(rfJEflat(t)) - rfJEarea(rfJEflat(t, { showSlit: true })), 4 * (g2 * Ls2 + g2 * g2 / 4), 1e-9, 'tray: four 0.004 slits');
      var l = rfJEbuild(L42);
      assert(JSON.stringify(rfJEflat(l, { showSlit: true })) === JSON.stringify(rfJEflat(l)), 'one bend: no corner, unchanged');
      return 'ok';
    });

    test('rfJE: Corner treatment cleared (edge flanges at 60° mitred at a corner): the mitre line runs on to the edge line short of the base corner (a small step): blank area smaller, same points; a 90° part is unchanged', function () {
      var r = rfJEbuild(M60);
      rfJEok(r);
      var f0 = rfJEflat(r), f1 = rfJEflat(r, { cornerTreatment: false }), d = rfJEarea(f0) - rfJEarea(f1);
      assert(d > 1e-5 && d < 1e-2, 'blank area smaller by a corner step: ' + d);
      rfJEeq(rfJEpts(f1), rfJEpts(f0), 'same outline points');
      rfJEdxf(f1);
      var t = rfJEbuild(TRAY);
      assert(JSON.stringify(rfJEflat(t, { cornerTreatment: false })) === JSON.stringify(rfJEflat(t)), 'tray: unchanged');
      return 'ok';
    });

    test('rfJE: round trip: p.flatPattern({ mergeFaces: false, showSlit: true }) stores only the changed boxes, generateScript writes them back, defaults store and write nothing', function () {
      var r = rfJEbuild(L42 + 'p.flatPattern({ mergeFaces: false, showSlit: true, simplifyBends: true });\n');
      rfJEeq(JSON.stringify(r.model.flatOptions), JSON.stringify({ mergeFaces: false, showSlit: true }), 'model.flatOptions');
      var s = K.generateScript(r.model);
      assert(/p\.flatPattern\(\{"mergeFaces":false,"showSlit":true\}\);/.test(s), 'script: ' + s.split('\n').filter(function (x) { return /flatPattern/.test(x); }).join(' | '));
      var r2 = rfJEbuild(s);
      rfJEeq(JSON.stringify(r2.model.flatOptions), JSON.stringify(r.model.flatOptions), 'round trip');
      var r3 = rfJEbuild(L42 + 'p.flatPattern({ mergeFaces: true, cornerTreatment: true });\n');
      assert(!('flatOptions' in r3.model), 'defaults: nothing stored');
      assert(!/flatPattern/.test(K.generateScript(r3.model)), 'defaults: no p.flatPattern line');
      var r4 = rfJEbuild(L42 + 'p.flatPattern({ fixedFace: [2, ' + T + ', 1], cornerTreatment: false });\n');
      var s4 = K.generateScript(r4.model);
      assert(/p\.flatPattern\(\{"fixedFace":\[2,0\.0598,1\],"cornerTreatment":false\}\);/.test(s4), 'with a fixed face: ' + s4.split('\n').filter(function (x) { return /flatPattern/.test(x); }).join(' | '));
      return 'ok';
    });
  })();
