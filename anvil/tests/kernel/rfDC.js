  // --- rfDC (2026-10-26, lane DC: sheet-metal fidelity #4, #9, #10) --- Jog from a sketch line (SolidWorks' Jog:
  // one line on a flat face, Outside / Inside Offset / Overall Dimension, Jog Position, angle, fixed face), the flat
  // as a solid (Kernel.flatBody, what Flatten shows) and Cut-Extrude's Link to thickness (linkT: the depth follows T).
  // 16 ga steel 4 × 3 plate, T = R = 0.0598, K = 0.5.
  (function () {
    group('rfDC: Jog from a sketch line, flatBody, Link to thickness');
    var T = 0.0598, R = 0.0598;
    var PLATE = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    function jogAt(x, opts) { return PLATE + 'p.sketch("Top", ' + T + ').line(' + x + ', 0, ' + x + ', -3).jog(' + (opts || '0.5, { fixed: [0.5, ' + T + ', 1.5] }') + ');\n'; }
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function errOf(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[0]] : ''; }
    // y range of the part's vertices beyond x0 (the jogged flange), and the largest x
    function jogged(r, x0) {
      var lo = Infinity, hi = -Infinity, xmax = -Infinity;
      r.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { if (v.pos.x > x0) { lo = Math.min(lo, v.pos.y); hi = Math.max(hi, v.pos.y); } xmax = Math.max(xmax, v.pos.x); }); });
      return { lo: lo, hi: hi, xmax: xmax };
    }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    var BA = Math.PI / 2 * (R + 0.5 * T);

    test('rfDC: Jog offset 0.5 measured three ways (Outside / Inside / Overall): the jogged flange lands exactly there, the flat keeps the 4 × 3 plate, two bends UP then DOWN BA + g apart', function () {
      [['outside', 0, T], ['inside', T, 2 * T], ['overall', -T, 0]].forEach(function (c) {
        var r = flatOf(jogAt(2, '0.5, { fixed: [0.5, ' + T + ', 1.5], offsetRef: "' + c[0] + '" }'));
        var j = jogged(r, 3.5);
        // outside: base bottom (y 0) to jog bottom = 0.5; inside: base top (T) to jog bottom; overall: base bottom to jog top
        near(j.lo, 0.5 + c[1], 1e-9, c[0] + ': jogged flange bottom');
        near(j.hi, 0.5 + c[2], 1e-9, c[0] + ': jogged flange top');
        near(r.flat.size[0], 4, 1e-9, c[0] + ': flat length'); near(r.flat.size[1], 3, 1e-9, c[0] + ': flat width');
        assert(r.flat.loops.length === 1, c[0] + ': one loop');
        assert(r.flat.bends.length === 2 && /^UP 90/.test(r.flat.bends[0].label) && /^DOWN 90/.test(r.flat.bends[1].label), c[0] + ': bends ' + r.flat.bends.map(function (b) { return b.label; }).join(', '));
        var inner = 0.5 - (c[0] === 'inside' ? 0 : c[0] === 'overall' ? 2 * T : T), g = inner - 2 * R;
        near(Math.abs(r.flat.bends[1].a[0] - r.flat.bends[0].a[0]), BA + g, 1e-9, c[0] + ': bend lines BA + g apart');
        near(Math.abs(r.flat.bends[0].a[0] - r.flat.bbox.min[0]), 2, 1e-9, c[0] + ': Bend Centerline: the first bend line on the sketch line');
      });
    });

    test('rfDC: Jog Position moves the first bend against the line (Material Inside: R + T − BA/2 back, Bend Outside: BA/2 on); 45° jog stays parallel; Reverse jogs down; the fixed face picks the side', function () {
      [['inside', -(R + T) + BA / 2], ['outside', -R + BA / 2], ['bendOutside', BA / 2]].forEach(function (c) {
        var r = flatOf(jogAt(2, '0.5, { fixed: [0.5, ' + T + ', 1.5], position: "' + c[0] + '" }'));
        near(r.flat.bends[0].a[0] - r.flat.bbox.min[0], 2 + c[1], 1e-9, c[0] + ': first bend line');
      });
      var a45 = flatOf(jogAt(2, '0.5, { fixed: [0.5, ' + T + ', 1.5], angle: 45 }'));
      var j = jogged(a45, 3.8);
      near(j.lo, 0.5, 1e-9, '45°: flange bottom'); near(j.hi, 0.5 + T, 1e-9, '45°: flange top (parallel to the sheet)');
      assert(/^UP 45/.test(a45.flat.bends[0].label) && /^DOWN 45/.test(a45.flat.bends[1].label), '45° notes: ' + a45.flat.bends.map(function (b) { return b.label; }));
      near(a45.flat.size[0], 4, 1e-9, '45°: flat length');
      var dn = jogged(build(jogAt(2, '0.5, { fixed: [0.5, ' + T + ', 1.5], reverse: true }')), 3.5);
      near(dn.lo, -0.5 + T - T, 1e-9, 'reversed: jogged down (flange bottom at −0.5)'); near(dn.hi, -0.5 + T, 1e-9, 'reversed: flange top');
      var left = build(jogAt(2, '0.5, { fixed: [3.5, ' + T + ', 1.5] }'));
      noErrors(left);
      var lo = Infinity; left.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { if (v.pos.x < 0.5) lo = Math.min(lo, v.pos.y); }); });
      near(lo, 0.5, 1e-9, 'fixed on the right: the left side jogs');
    });

    test('rfDC: Jog errors — two lines, an offset smaller than the bends allow (the message gives the smallest), an angle of 180°; the edge jog of older parts still builds', function () {
      var two = build(PLATE + 'p.sketch("Top", ' + T + ').line(1, 0, 1, -3).line(3, 0, 3, -3).jog(0.5);');
      assert(/exactly one line/.test(errOf(two)), 'two lines: ' + errOf(two));
      var small = build(jogAt(2, '0.1, { offsetRef: "inside" }'));
      var min = 2 * R;   // inside offset at 90°: 2R
      assert(/too small/.test(errOf(small)) && errOf(small).indexOf(String(Math.round(min * 1e6) / 1e6)) >= 0, 'small: ' + errOf(small));
      near(K.jogMinOffset(Math.PI / 2, R, T, 'outside'), 2 * R + T, 1e-12, 'jogMinOffset outside');
      var flat180 = build(jogAt(2, '0.5, { angle: 180 }'));
      assert(/angle/.test(errOf(flat180)), '180°: ' + errOf(flat180));
      var edge = build(PLATE + 'p.jog(0.5, 1, [[4, ' + T + ', 1.5]]);');
      noErrors(edge);
    });

    test('rfDC: Jog round trip (generateScript → runScript: same volume, same flat) and DXF out with two BEND lines', function () {
      var a = flatOf(jogAt(2, '0.6, { fixed: [0.5, ' + T + ', 1.5], offsetRef: "overall", position: "inside", angle: 60 }'));
      var s = K.generateScript(a.model);
      assert(/p\.jog\(0\.6, \{ sketch: f\d+, name: "Jog1", offsetRef: "overall", angle: 60, position: "inside", fixed: \[0\.5,0\.0598,1\.5\] \}\)/.test(s), 'script: ' + s.split('\n').filter(function (l) { return /jog/.test(l); })[0]);
      var b = flatOf(s);
      near(b.mp.volume, a.mp.volume, 1e-12, 'volume after the round trip');
      near(b.flat.size[0], a.flat.size[0], 1e-12, 'flat after the round trip');
      var dxf = K.exportDXFFlat(a.flat, 'in');
      var bends = dxf.split('\n').filter(function (l, i, arr) { return l.trim() === 'BEND' && arr[i - 1].trim() === '8'; }).length;
      assert(bends === 2, 'two entities on BEND: ' + bends);
    });

    test('rfDC: flatBody — the blank T thick on the Base Flange plane: volume = blank area × T, the box = the flat size × T, holes go through', function () {
      var r = flatOf(PLATE + 'p.flange(1.5, [[2, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });\np.sketch("Top", ' + T + ').rect(1, -2, 1, 1).end().cut(1, { normalCut: true, throughAll: true, reverse: true });');
      var fb = K.flatBody(r.model, r.build, r.flat);
      var mp = K.massProps(K.meshFromBody(fb.body));
      near(mp.volume, blankArea(r.flat) * T, 1e-9, 'flat solid volume');
      near(fb.h1 - fb.h0, T, 1e-15, 'thickness');
      assert(r.flat.loops.length === 2, 'the window is a hole in the flat');
      var bb = fb.body.getBounds ? null : null, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      fb.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { var q = [v.pos.x, v.pos.y, v.pos.z]; for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } }); });
      near(hi[1] - lo[1], T, 1e-12, 'flat lies T thick'); near(lo[1], 0, 1e-12, 'on the base plane, where the Base Flange is');
      near(hi[0] - lo[0], r.flat.size[0], 1e-9, 'flat X'); near(hi[2] - lo[2], r.flat.size[1], 1e-9, 'flat Z');
    });

    test('rfDC: Link to thickness — linkT: a blind cut T deep whatever depth it stores; a thicker sheet cuts through; round trip writes linkT', function () {
      function part(t) { return 'p.units("in");\np.sheet(' + t + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.sketch("Top").rect(1, -2, 1, 1).end().cut(0.01, { linkT: true });\n'; }
      var a = build(part(T)), b = build(part(0.1046));
      noErrors(a); noErrors(b);
      var f = a.model.features[a.model.features.length - 1];
      assert(f.linkT === true && f.end === 'blind' && Math.abs(f.depth - T) < 1e-15, 'Builder stores linkT, blind, depth T: ' + JSON.stringify(f));
      near(a.mp.volume, (12 - 1) * T, 1e-9, '16 ga: the window goes through');
      near(b.mp.volume, (12 - 1) * 0.1046, 1e-9, '12 ga: the window goes through');
      // the stored depth is stale (0.0598) on a 12 ga sheet: the kernel still cuts T deep
      var m = JSON.parse(JSON.stringify(a.model)); m.sheet.thickness = 0.1046; m.features.forEach(function (q) { if (q.sheetBase) q.depth = 0.1046; });
      var bm = K.rebuild(m);
      near(K.massProps(K.meshFromBody(bm.body)).volume, (12 - 1) * 0.1046, 1e-9, 'a thickness change: the linked cut follows');
      var s = K.generateScript(a.model);
      assert(/linkT: true/.test(s), 'script keeps linkT');
      var c = build(s); near(c.mp.volume, a.mp.volume, 1e-12, 'round trip volume');
    });
  })();
