  // --- rfQB (2026-11-18, lane smflange): sheet-metal flanges. Bend lines end on metal in the flat (a corner relief or a
  // bend relief that removes the end of a bend took the line on into the void), a length per edge in one Edge-Flange,
  // and the sheet thickness every sheet feature follows ---
  function rfQBinLoop(p, loop) {
    var c = false;
    for (var i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      var a = loop[i], b = loop[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  // every bend line sampled at 2 % and 98 % of its length lies inside the blank and outside every hole: the misses
  function rfQBbendsOff(flat) {
    var bad = [];
    flat.bends.forEach(function (b, k) {
      [0.02, 0.98].forEach(function (t) {
        var p = [b.a[0] + (b.b[0] - b.a[0]) * t, b.a[1] + (b.b[1] - b.a[1]) * t];
        var ok = rfQBinLoop(p, flat.loops[0]);
        for (var h = 1; h < flat.loops.length; h++) if (rfQBinLoop(p, flat.loops[h])) ok = false;
        if (!ok) bad.push('bend ' + k + ' at ' + t + ' (' + fmt(p[0]) + ', ' + fmt(p[1]) + ')');
      });
    });
    return bad;
  }
  // the flat DXF's BEND lines: one per bend, each as long as its (trimmed) bend line
  function rfQBdxfBends(flat, units) {
    var d = DWG.parseDXF(K.exportDXFFlat(flat, units, {})), got = [];
    d.entities.forEach(function (e) {
      if (e.type !== 'LINE') return;
      var g = {}; e.p.forEach(function (kv) { g[kv[0]] = kv[1]; });
      if (g[8] === 'BEND') got.push(Math.hypot(+g[11] - +g[10], +g[21] - +g[20]));
    });
    var want = flat.bends.map(function (b) { return Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]); });
    got.sort(); want.sort();
    assert(got.length === want.length, 'DXF BEND lines ' + got.length + ', bends ' + want.length);
    want.forEach(function (w, i) { near(got[i], w, 1e-6, 'DXF BEND line ' + i + ' length'); });
  }
  var rfQBtray = 'p.units("mm"); p.sheet(1.5, 1.5, 0.5); p.sketch("Top").rect(0, -113.9542, 93.5775, 113.9542).end().baseFlange();\n' +
    'p.flange(36.2558, [[46.78875, 1.5, 0]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
    'p.flange(36.2558, [[46.78875, 1.5, 113.9542]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
    'p.flange(36.2558, [[0, 1.5, 56.9771]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
    'p.flange(36.2558, [[93.5775, 1.5, 56.9771]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
    'p.cornerRelief([[90.5775, 1.5, 110.9542], [3, 1.5, 3]], null, { reliefType: "tear" });\n';
  var rfQBinch = 'p.units("in"); p.sheet(0.06, 0.06, 0.5); p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n' +
    'p.flange(1, [[4, 0.06, 0]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
    'p.flange(1, [[4, 0.06, 6]], { position: "inside", lengthRef: "outer", relief: "tear" });\n' +
    'p.flange(1, [[0, 0.06, 3]], { position: "inside", lengthRef: "outer", relief: "obround" });\n' +
    'p.flange(1, [[8, 0.06, 3]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
    'p.cornerRelief([[7.88, 0.06, 5.88], [0.12, 0.06, 0.12]], null, { reliefType: "circular" });\n';
  (function () {
    group('rfQB: sheet-metal flanges: bend lines on metal, a length per edge, the sheet thickness');
    test('rfQB: a mm tray with rect bend reliefs and a Tear corner relief on two corners: every bend line ends on metal (2 % / 98 % inside the blank), the relief takes the end of the bend (bend 0 starts at x 3 where the material starts, was 0: T + R into the void); the DXF BEND lines are the trimmed lines', function () {
      var r = build(rfQBtray); noErrors(r);
      var flat = K.flatPattern(r.model, r.build, r.mesh), bad = rfQBbendsOff(flat);
      assert(!bad.length, 'bend lines off the metal: ' + bad.join('; '));
      assert(flat.bends.length === 4, 'bends ' + flat.bends.length);
      var lens = flat.bends.map(function (b) { return Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]); }).sort(function (a, b) { return a - b; });
      near(lens[0], 93.5775 - 3, 1e-6, 'a trimmed z bend\'s length (W - (T + R))');
      near(lens[1], 93.5775 - 3, 1e-6, 'the other trimmed z bend\'s length');
      rfQBdxfBends(flat, 'mm');
      return 'bend lengths ' + lens.map(fmt).join(', ');
    });
    test('rfQB: an inch tray with rect, tear and obround bend reliefs and a Circular corner relief on two corners: every bend line ends on metal, at the relief circle; the DXF BEND lines match; with no corner relief the lines were already on metal and stay as they were', function () {
      var r = build(rfQBinch); noErrors(r);
      var flat = K.flatPattern(r.model, r.build, r.mesh), bad = rfQBbendsOff(flat);
      assert(!bad.length, 'bend lines off the metal: ' + bad.join('; '));
      rfQBdxfBends(flat, 'in');
      var r0 = build(rfQBinch.split('\n').slice(0, 5).join('\n')), f0 = K.flatPattern(r0.model, r0.build, r0.mesh);
      assert(!rfQBbendsOff(f0).length, 'no corner relief: ' + rfQBbendsOff(f0).join('; '));
      // a bend line that ends on metal: its end is not moved
      var b0 = f0.bends.map(function (b) { return Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]); });
      return 'bend lengths with circles ' + flat.bends.map(function (b) { return fmt(Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1])); }).join(', ') + '; without ' + b0.map(fmt).join(', ');
    });

    // ---- a length per edge in one Edge-Flange (f.lengths)
    var HEAD = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    test('rfQB: one Edge-Flange on three edges with lengths 1.0 / 1.5 / 0.75 (lengths: { 1: 1.5, 2: 0.75 }) builds the same part as three Edge-Flanges: volume and flat size to 1e-9, three bends; the generated script carries lengths and rebuilds the same', function () {
      var one = build(HEAD + 'p.flange(1, [[3, 0.06, 0], [6, 0.06, 2], [3, 0.06, 4]], { lengths: { 1: 1.5, 2: 0.75 } });\n');
      var three = build(HEAD + 'p.flange(1, [[3, 0.06, 0]]);\np.flange(1.5, [[6, 0.06, 2]]);\np.flange(0.75, [[3, 0.06, 4]]);\n');
      noErrors(one); noErrors(three);
      nearRel(one.mp.volume, three.mp.volume, 1e-9, 'volume');
      var fo = K.flatPattern(one.model, one.build, one.mesh), ft = K.flatPattern(three.model, three.build, three.mesh);
      near(fo.size[0], ft.size[0], 1e-9, 'flat x'); near(fo.size[1], ft.size[1], 1e-9, 'flat y');
      assert(fo.bends.length === 3, 'bends ' + fo.bends.length);
      var bb = one.body.getBounds();
      near(bb.max[1], 1.5 + 0.12, 1e-9, 'the tallest wall (1.5 on the x = 6 edge, Bend Outside: wall top at y = R + T + L)');
      var fl = one.model.features.filter(function (f) { return f.type === 'flange'; })[0];
      assert(fl.lengths && fl.lengths[1] === 1.5 && fl.lengths[2] === 0.75, 'feature lengths ' + JSON.stringify(fl.lengths));
      var scr = K.generateScript(one.model);
      assert(/lengths: \{"1":1\.5,"2":0\.75\}/.test(scr), 'script: ' + (scr.match(/p\.flange\([^\n]*/) || [''])[0]);
      var again = build(scr); noErrors(again);
      nearRel(again.mp.volume, one.mp.volume, 1e-12, 'rebuilt from the generated script');
      return 'volume ' + fmt(one.mp.volume) + ', flat ' + fo.size.map(fmt).join(' x ');
    });
    test('rfQB: lengths with Material Inside (butt corners between unequal neighbours, lengthRef outer): the part is closed and every wall has its own height; the flat keeps its bend lines on metal, and folded volume - flat area x T is the same as with one length (the butt corners\' tapers), to 1e-9', function () {
      var r = build(HEAD + 'p.flange(1, [[3, 0.06, 0], [6, 0.06, 2], [3, 0.06, 4]], { position: "inside", lengthRef: "outer", lengths: { 1: 1.5, 2: 0.75 } });\n');
      noErrors(r); consistentVolume(r);
      var bb = r.body.getBounds();
      near(bb.max[1], 1.5, 1e-9, 'tallest wall: outer 1.5 from the base\'s underside');
      var flat = K.flatPattern(r.model, r.build, r.mesh), bad = rfQBbendsOff(flat);
      assert(!bad.length, 'bend lines off: ' + bad.join('; '));
      var area = flat.loops.reduce(function (s, l, i) { return s + Math.abs(K.signedArea(l)) * (i ? -1 : 1); }, 0);
      // the butt corners' tapered bend ends are not the strip wrapped (flangeLayout, rfIS): the same gap as with equal lengths
      var eq = build(HEAD + 'p.flange(1, [[3, 0.06, 0], [6, 0.06, 2], [3, 0.06, 4]], { position: "inside", lengthRef: "outer" });\n');
      var feq = K.flatPattern(eq.model, eq.build, eq.mesh), aeq = feq.loops.reduce(function (s, l, i) { return s + Math.abs(K.signedArea(l)) * (i ? -1 : 1); }, 0);
      var gapU = r.mp.volume - area * 0.06, gapE = eq.mp.volume - aeq * 0.06;
      near(gapU, gapE, 1e-9, 'folded volume - area x T with lengths (' + gapU + ') vs with one length (' + gapE + ')');
      // each wall's own height: the outer faces of the z = 0 and z = 4 walls reach y = 1 and 0.75
      var inside = r.body.pointTester();
      assert(inside([3, 0.98, 0.03]) && !inside([3, 1.02, 0.03]), 'the z = 0 wall ends at y = 1');
      assert(inside([3, 0.73, 3.97]) && !inside([3, 0.77, 3.97]), 'the z = 4 wall ends at y = .75');
      assert(inside([5.97, 1.48, 2]) && !inside([5.97, 1.52, 2]), 'the x = 6 wall ends at y = 1.5');
      return 'volume ' + r.mp.volume.toFixed(6) + ', area x T ' + (area * 0.06).toFixed(6);
    });
    test('rfQB: Mirror of an Edge-Flange with a length per edge is that flange built on the mirrored edges (lengths kept), to 1e-9; a length per edge is refused on a hem and for an index past the edges', function () {
      var base = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").polyline([[-3, 0], [-1, 0], [-1, -1], [1, -1], [1, 0], [3, 0], [3, -4], [-3, -4], [-3, 0]]).end().baseFlange();\n';
      var fl = function (s) { return 'p.flange(1, [[' + (-2 * s) + ', 0.06, 0], [' + (-3 * s) + ', 0.06, 2]], { lengths: { 1: 1.5 } });\n'; };
      var m = build(base + fl(1) + 'p.mirror("Right", { feature: 3 });\n'), d = build(base + fl(1) + fl(-1));
      noErrors(m); noErrors(d);
      nearRel(m.mp.volume, d.mp.volume, 1e-9, 'mirror = both built');
      var fm = K.flatPattern(m.model, m.build, m.mesh), fd = K.flatPattern(d.model, d.build, d.mesh);
      near(fm.size[0], fd.size[0], 1e-9, 'blank x'); near(fm.size[1], fd.size[1], 1e-9, 'blank y');
      assert(fm.bends.length === 4, fm.bends.length + ' bends');
      var hm = K.newModel('T'); K.runScript(hm, HEAD + 'p.flange(0.5, [[3, 0.06, 0]], { relief: "none" });\n');
      var hf = hm.features.filter(function (f) { return f.type === 'flange'; })[0]; hf.hem = true; hf.lengths = { 0: 0.4 };
      var hb = K.rebuild(hm), hemErr = Object.keys(hb.errors).map(function (k) { return hb.errors[k]; }).join(' | ');
      assert(/length per edge/.test(hemErr), 'a hem with lengths: ' + hemErr);
      var threw = '';
      try { K.runScript(K.newModel('T'), HEAD + 'p.flange(1, [[3, 0.06, 0]], { lengths: { 3: 2 } });'); } catch (e) { threw = e.message; }
      assert(/not the index of an edge/.test(threw), 'index past the edges: ' + threw);
      return 'volume ' + m.mp.volume.toFixed(6);
    });

    // ---- the sheet thickness: the Base Flange follows it as every flange does
    test('rfQB: a new sheet thickness (model.sheet set, or p.sheet run again after the Base Flange) rebuilds the Base Flange at it as well as the Edge-Flange (was: the base kept its .06 while the flange took .075): the part equals one built at .075 from the start, to 1e-9', function () {
      var FL = 'p.flange(1, [[3, 0.06, 0]], { position: "inside", lengthRef: "outer" });\n';
      var want = build('p.units("in");\np.sheet(0.075, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' + FL.replace('0.06, 0', '0.075, 0'));
      noErrors(want);
      var r = build(HEAD + FL); noErrors(r);
      r.model.sheet = K.makeSheet(Object.assign({}, r.model.sheet, { thickness: 0.075 }));
      var b = K.rebuild(r.model); assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      var mp = K.massProps(K.meshFromBody(b.body), 1);
      nearRel(mp.volume, want.mp.volume, 1e-9, 'model.sheet.thickness = .075');
      var inside = b.body.pointTester();
      assert(inside([3, 0.07, 2]) && !inside([3, 0.08, 2]), 'the base is .075 thick');
      var s = build(HEAD + FL + 'p.sheet(0.075, 0.06, 0.5);\n'); noErrors(s);
      nearRel(s.mp.volume, want.mp.volume, 1e-9, 'p.sheet(.075) after the features');
      return 'volume at .075 ' + want.mp.volume.toFixed(6);
    });
  })();
