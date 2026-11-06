  // --- rfJJ (2026-11-06, lane dxfout-2: test-reports/2026-11-05-sheetmetal-pm-audit.md row 12) --- Jog Offset end
  // conditions as in SolidWorks 2024's Jog PM: Blind, Up To Vertex, Up To Surface, Offset From Surface (offsetEnd,
  // offsetTarget, offsetDistance, offsetFlip). The target takes the dimension's end: Inside Offset puts the jogged
  // flange's near face on it, Outside Offset / Overall Dimension its far face. 16 ga, T = R = .0598, K .5, inches: the
  // folded volume is the flat's area × T.
  (function () {
    group('rfJJ: Jog Offset end conditions (Up To Vertex, Up To Surface, Offset From Surface), with every Dimension position, Jog Position, angle, Fix projected length');
    var T = 0.0598, R = 0.0598;
    var PLATE = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    var FIX = 'fixed: [0.5, ' + T + ', 1.5]';
    function rfJJJog(opts, pre) { return PLATE + (pre || '') + 'p.sketch("Top", ' + T + ').line(2, 0, 2, -3).jog(' + opts + ');\n'; }
    function rfJJBuild(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function rfJJErr(r) { var ids = Object.keys(r.errors || {}); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    function rfJJArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    // y range of the jogged flange (vertices with x beyond x0)
    function rfJJY(r, x0) {
      var lo = Infinity, hi = -Infinity;
      r.body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { if (v.pos.x > x0) { lo = Math.min(lo, v.pos.y); hi = Math.max(hi, v.pos.y); } }); });
      return { lo: lo, hi: hi };
    }
    function rfJJExact(r, label) { nearRel(r.mp.volume, rfJJArea(r.flat) * T, 1e-6, label + ': folded volume = flat area × T'); }

    test('rfJJ: Up To Vertex at y .8: Outside Offset and Overall Dimension put the jogged flange\'s far face there, Inside Offset its near face; each = the Blind jog of the equivalent offset; volume = flat × T', function () {
      var V = '[3.5, 0.8, 1]';
      [['outside', 0.8 - T, 0.8, 0.8 - T], ['inside', 0.8, 0.8 + T, 0.8 - T], ['overall', 0.8 - T, 0.8, 0.8 + T - T]].forEach(function (c) {
        var r = rfJJBuild(rfJJJog('null, { ' + FIX + ', offsetRef: "' + c[0] + '", offsetEnd: "upToVertex", offsetTarget: ' + V + ' }'));
        var y = rfJJY(r, 2.6);
        near(y.lo, c[1], 1e-9, c[0] + ': flange bottom'); near(y.hi, c[2], 1e-9, c[0] + ': flange top');
        rfJJExact(r, c[0]);
        // the Blind jog with the offset as this reference measures it (outside: bottom to bottom; inside: base top to
        // flange bottom; overall: base bottom to flange top)
        var D = c[0] === 'outside' ? c[1] : c[0] === 'inside' ? c[1] - T : c[2];
        var b = rfJJBuild(rfJJJog(D + ', { ' + FIX + ', offsetRef: "' + c[0] + '" }'));
        near(b.mp.volume, r.mp.volume, 1e-12, c[0] + ': = Blind ' + fmt(D));
        near(b.flat.bends[1].a[0], r.flat.bends[1].a[0], 1e-9, c[0] + ': second bend line where Blind puts it');
      });
    });

    test('rfJJ: Up To Surface: a reference plane .8 above Top (Outside: far face on it); height 0 (Top jogging down, the sketch face) and surfaces not parallel to the sheet are refused', function () {
      var pl = 'var pl = p.plane("Top", 0.8);\n';
      var r = rfJJBuild(rfJJJog('null, { ' + FIX + ', offsetEnd: "upToSurface", offsetTarget: pl }', pl));
      near(rfJJY(r, 2.6).hi, 0.8, 1e-9, 'plane: flange top on it'); rfJJExact(r, 'plane');
      var named = build(rfJJJog('null, { ' + FIX + ', offsetEnd: "upToSurface", offsetTarget: "Top", reverse: true, offsetRef: "inside" }'));
      // jogging down, the height is measured from the base's bottom face, which lies on Top itself: nothing to jog to
      assert(/other side/.test(rfJJErr(named)), 'Top from the base (height 0) refused: ' + rfJJErr(named));
      // a point on a face parallel to the sheet: the base's own top face is height 0 on the jog side, refused the same way
      var own = build(rfJJJog('null, { ' + FIX + ', offsetEnd: "upToSurface", offsetTarget: [1, ' + T + ', 1] }'));
      assert(/other side/.test(rfJJErr(own)), 'the sketch face itself: ' + rfJJErr(own));
      var side = build(rfJJJog('null, { ' + FIX + ', offsetEnd: "upToSurface", offsetTarget: [4, ' + (T / 2) + ', 1.5] }'));
      assert(/parallel/.test(rfJJErr(side)), 'the plate\'s end face is refused: ' + rfJJErr(side));
      var front = build(rfJJJog('null, { ' + FIX + ', offsetEnd: "upToSurface", offsetTarget: "Front" }'));
      assert(/parallel/.test(rfJJErr(front)), 'Front plane refused: ' + rfJJErr(front));
    });

    test('rfJJ: Offset From Surface: plane .6 + .2 and plane 1.0 − .2 (Reverse offset) both give the flange top at .8; Up To Vertex with Reverse direction jogs down to the vertex', function () {
      var a = 'var pa = p.plane("Top", 0.6);\n', b = 'var pb = p.plane("Top", 1.0);\n';
      var ra = rfJJBuild(rfJJJog('null, { ' + FIX + ', offsetEnd: "offsetFromSurface", offsetTarget: pa, offsetDistance: 0.2 }', a));
      var rb = rfJJBuild(rfJJJog('null, { ' + FIX + ', offsetEnd: "offsetFromSurface", offsetTarget: pb, offsetDistance: 0.2, offsetFlip: true }', b));
      near(rfJJY(ra, 2.6).hi, 0.8, 1e-9, '.6 + .2'); near(rfJJY(rb, 2.6).hi, 0.8, 1e-9, '1.0 − .2');
      rfJJExact(ra, '.6 + .2'); rfJJExact(rb, '1.0 − .2');
      var dn = rfJJBuild(rfJJJog('null, { ' + FIX + ', reverse: true, offsetEnd: "upToVertex", offsetTarget: [3.5, -0.5, 1] }'));
      near(rfJJY(dn, 2.6).lo, -0.5, 1e-9, 'reversed: the far face (bottom) at the vertex'); rfJJExact(dn, 'reversed');
    });

    test('rfJJ: Up To Vertex with Jog Position Material Inside / Outside / Bend Outside, a 45° jog and Fix projected length: the flange lands on the vertex, volume = flat × T', function () {
      ['inside', 'outside', 'bendOutside', 'centerline'].forEach(function (pos) {
        var r = rfJJBuild(rfJJJog('null, { ' + FIX + ', position: "' + pos + '", offsetEnd: "upToVertex", offsetTarget: [3.5, 0.6, 1] }'));
        near(rfJJY(r, 2.8).hi, 0.6, 1e-9, pos + ': far face on the vertex'); rfJJExact(r, pos);
      });
      var a45 = rfJJBuild(rfJJJog('null, { ' + FIX + ', angle: 45, offsetEnd: "upToVertex", offsetTarget: [3.5, 0.6, 1] }'));
      near(rfJJY(a45, 3.0).hi, 0.6, 1e-9, '45°'); rfJJExact(a45, '45°');
      var fl = rfJJBuild(rfJJJog('null, { ' + FIX + ', fixLength: true, offsetEnd: "upToVertex", offsetTarget: [3.5, 0.6, 1] }'));
      near(rfJJY(fl, 3.0).hi, 0.6, 1e-9, 'Fix projected length'); rfJJExact(fl, 'Fix projected length');
      near(fl.mp.bbox.max[0], 4, 1e-9, 'Fix projected length: the far end stays at x 4');
    });

    test('rfJJ: errors — no target, a vertex on the far side of the sheet, a vertex too close for the bends, an unknown end condition', function () {
      var none = build(rfJJJog('null, { ' + FIX + ', offsetEnd: "upToVertex" }'));
      assert(/pick the vertex/.test(rfJJErr(none)), 'no target: ' + rfJJErr(none));
      var below = build(rfJJJog('null, { ' + FIX + ', offsetEnd: "upToVertex", offsetTarget: [3.5, -0.4, 1] }'));
      assert(/other side/.test(rfJJErr(below)), 'below the sheet: ' + rfJJErr(below));
      var close = build(rfJJJog('null, { ' + FIX + ', offsetEnd: "upToVertex", offsetTarget: [3.5, 0.1, 1] }'));
      assert(/too small/.test(rfJJErr(close)), 'too close: ' + rfJJErr(close));
      var bad = false;
      try { build(rfJJJog('0.5, { ' + FIX + ', offsetEnd: "upTo" }')); } catch (e) { bad = /offsetEnd/.test(e.message); }
      assert(bad, 'Builder refuses an unknown end condition');
    });

    test('rfJJ: script round trip keeps the end condition, target (a point or a reference plane), offset distance and flip', function () {
      [rfJJJog('null, { ' + FIX + ', offsetRef: "inside", offsetEnd: "upToVertex", offsetTarget: [3.5, 0.8, 1] }'),
        rfJJJog('null, { ' + FIX + ', offsetEnd: "offsetFromSurface", offsetTarget: pb, offsetDistance: 0.2, offsetFlip: true }', 'var pb = p.plane("Top", 1.0);\n')].forEach(function (code, i) {
        var r = build(code);
        noErrors(r);
        var s = K.generateScript(r.model), r2 = build(s);
        noErrors(r2);
        near(r2.mp.volume, r.mp.volume, 1e-12, 'case ' + i + ': same volume');
        var j1 = r.model.features.filter(function (f) { return f.type === 'jog'; })[0], j2 = r2.model.features.filter(function (f) { return f.type === 'jog'; })[0];
        ['offsetEnd', 'offsetDistance', 'offsetFlip', 'offsetRef'].forEach(function (k) { assert(JSON.stringify(j1[k]) === JSON.stringify(j2[k]), 'case ' + i + ' ' + k + ': ' + j1[k] + ' / ' + j2[k]); });
        assert(/offsetEnd/.test(s), 'script names the end condition');
      });
    });
  })();
