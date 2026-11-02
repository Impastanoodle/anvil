  // --- rfGF (2026-11-02, lane jogs-rips) --- what the SolidWorks reference (rfGD, test-reports/2026-11-02-solidworks-
  // reference-2.md, mismatches 3, 5, 6, 9) showed about jogs, rips, Miter Flange corners and hems, on Anvil's own engine.
  // Every number named SolidWorks was measured in SOLIDWORKS 2022 SP5. Volumes 1e-5 relative, positions 1e-4 in, flats exact.
  (function () {
    group('rfGF: jog past 90°, Rip, Miter Flange corner, Tear Drop default, Rolled hem past 300° (SolidWorks reference)');
    var T = 0.0598, H16 = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function errOf(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    function closed(r, label) {
      var c = Evaluate.checkBody(r.build.body, { maxPairs: 1 });
      assert(c.openEdges.length === 0 && c.nonManifoldEdges.length === 0, label + ': ' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold edges');
      assert(r.build.bodies.length === 1, label + ': bodies ' + r.build.bodies.length);
    }
    function area(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function hasVert(loop, x, y, tol) { return loop.some(function (p) { return Math.abs(Math.abs(p[0]) - x) < tol && Math.abs(Math.abs(p[1]) - y) < tol; }); }

    // ---- Jog
    function jog(H, D, o) { var t = o && o.T || T; return H + 'p.sketch("Top", ' + t + ').line(3, 0, 3, -2).end().jog(' + D + ', ' + JSON.stringify(Object.assign({ fixed: [1, t, 1], reverse: true }, o && o.o || {})) + ');\n'; }

    test('rfGF: Jog 120° on 16 ga, offset .5, each position: SolidWorks volume .4784, y to −.5… x 0 to 3.3797, flat 4 × 2 (was: bbox to x = −3.2, volume .4335)', function () {
      ['centerline', 'inside', 'outside'].forEach(function (pos) {
        var r = flatOf(jog(H16, 0.5, { o: { angle: 120, position: pos } }));
        closed(r, pos);
        nearRel(r.mp.volume, 0.4784, 1e-9, pos + ' volume');
        near(r.mp.bbox.min[0], 0, 1e-6, pos + ' x min'); near(r.mp.bbox.max[0], 3.3797, 1e-4, pos + ' x max');
        near(r.mp.bbox.max[1] - r.mp.bbox.min[1], 0.5 + T, 1e-9, pos + ' offset');
        near(Math.max.apply(null, r.flat.size), 4, 1e-9, pos + ' flat'); near(Math.min.apply(null, r.flat.size), 2, 1e-9, pos + ' flat');
        assert(r.flat.loops.length === 1 && r.flat.bends.length === 2, pos + ': one blank, two bends');
      });
    });

    test('rfGF: Jog at every obtuse angle: K .5 volume = the plate, the projected length follows the bend geometry, flat 4 × 2', function () {
      [95, 100, 110, 135, 150, 160].forEach(function (deg) {
        var H8 = H16.replace('rect(0, -2, 4, 2)', 'rect(0, -2, 8, 2)'), r = flatOf(jog(H8, 0.8, { o: { angle: deg } })), A = deg * Math.PI / 180;
        closed(r, deg + '°');
        nearRel(r.mp.volume, 0.9568, 1e-9, deg + '° volume');
        near(Math.max.apply(null, r.flat.size), 8, 1e-9, deg + '° flat');
        // along one sheet face: the first bend (radius R), the riser g, the second bend (R + T), then what is left of the plate
        var BA = A * 1.5 * T, g = (0.8 - T - 2 * T * (1 - Math.cos(A)) + T * Math.cos(A)) / Math.sin(A), x0 = 3 - BA / 2;
        near(r.mp.bbox.max[0], x0 + 3 * T * Math.sin(A) + g * Math.cos(A) + 8 - x0 - 2 * BA - g, 1e-6, deg + '° reach');
      });
    });

    test('rfGF: Overall Dimension on 11 ga, K .71, offset .5: riser g = .0216, SolidWorks volume .9379261 at every position (was .939273: the overlap strips stood proud of the other bend)', function () {
      var H = 'p.units("in");\np.sheet(0.1196, 0.1196, 0.71);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
      ['centerline', 'inside', 'outside'].forEach(function (pos) {
        var r = flatOf(jog(H, 0.5, { T: 0.1196, o: { offsetRef: 'overall', position: pos } }));
        closed(r, pos);
        nearRel(r.mp.volume, 0.9379261, 1e-6, pos + ' volume');
        near(r.mp.bbox.max[0], 3.694694, 1e-4, pos + ' x max');
      });
    });

    test('rfGF: Jog at its smallest offset (no riser between the bends): closed, exact, flat 4 × 2; a hair less is refused in a plain sentence', function () {
      var D = K.jogMinOffset(Math.PI / 2, T, T, 'outside'), r = flatOf(jog(H16, D, {}));
      closed(r, 'g = 0');
      nearRel(r.mp.volume, 0.4784, 1e-9, 'volume');
      assert(/too small for this bend radius and angle: at least /.test(errOf(build(jog(H16, D - 1e-3, {})))), errOf(build(jog(H16, D - 1e-3, {}))));
    });

    test('rfGF: Jog 120° with a flange on the fixed side and one on the jogged side, and a hole across the second bend: the flat stays one blank of the right size', function () {
      var r = flatOf(H16 + 'p.sketch("Top", ' + T + ').circle(3.45, -1, 0.1).end().cut("through", { reverse: true });\n' +
        'p.flange(1, [[0, ' + T + ', 1]], { position: "bendOutside", lengthRef: "wall" });\n' + 'p.flange(1, [[4, ' + T + ', 1]], { position: "bendOutside", lengthRef: "wall" });\n' +
        'p.sketch("Top", ' + T + ').line(3, 0, 3, -2).end().jog(0.5, { fixed: [1, ' + T + ', 1], angle: 120, reverse: true });\n');
      var BA = Math.PI / 2 * 1.5 * T;
      near(Math.max.apply(null, r.flat.size), 4 + 2 * (1 + BA), 1e-6, 'length');
      assert(r.flat.loops.length === 2, 'blank + the hole: ' + r.flat.loops.length);
      assert(r.flat.bends.length === 4, 'four bends: ' + r.flat.bends.length);
    });

    test('rfGF: Jog Fix projected length at 120°: the jogged end stays at x = 4; script round trip', function () {
      var r = flatOf(jog(H16, 0.5, { o: { angle: 120, fixLength: true } }));
      near(r.mp.bbox.max[0], 4, 1e-6, 'x max');
      var r2 = build(K.generateScript(r.model));
      noErrors(r2);
      nearRel(r2.mp.volume, r.mp.volume, 1e-12, 'round trip');
    });

    // ---- Rip
    var W = 0.06, G = 0.03, BOX = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(0.06, [[1, 1, -1]]);\n', ALL = '[[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]]';
    test('rfGF: Rip both, four corners: SolidWorks 0.652974 (gap .03) and 0.659858 (gap .01), walls and floor square at T + g/√2 from the corner; inside edges the same', function () {
      var r = build(BOX + 'p.rip(' + ALL + ', 0.03);\n'), g1 = build(BOX + 'p.rip(' + ALL + ', 0.01);\n'), S = W + G / Math.SQRT2;
      noErrors(r); noErrors(g1); closed(r, 'gap .03'); closed(g1, 'gap .01');
      nearRel(r.mp.volume, 0.6529737, 1e-6, 'gap .03'); nearRel(g1.mp.volume, 0.6598579, 1e-6, 'gap .01');
      var t = r.build.body.pointTester();
      assert(!t([2 - S + 0.002, W / 2, -S + 0.002]) && t([2 - S - 0.002, W / 2, -S + 0.002]) && t([2 - S + 0.002, W / 2, -S - 0.002]), 'the floor\'s corner square has gone');
      assert(!t([2 - W / 2, 0.5, -S + 0.002]) && t([2 - W / 2, 0.5, -S - 0.002]), 'the wall stops square at S');
      var q = build(BOX + 'p.rip([[1.94, 0.5, -0.06]], 0.03);\n'), o = build(BOX + 'p.rip([[2, 0.5, 0]], 0.03);\n');
      nearRel(q.mp.volume, o.mp.volume, 1e-12, 'inside edge = outside edge');
    });

    test('rfGF: Rip side1 / side2, four corners: SolidWorks 0.670464: gap × T along the whole corner, through the floor', function () {
      ['side1', 'side2'].forEach(function (d) {
        var r = build(BOX + 'p.rip(' + ALL + ', 0.03, { direction: "' + d + '" });\n');
        noErrors(r); closed(r, d);
        nearRel(r.mp.volume, 0.670464, 1e-9, d);
      });
    });

    test('rfGF: Insert Bends after Rip both: SolidWorks\' flat exactly: 3.802743 square less four corners, a cross with 12 corners, 0.635938 × … no corner relief needed', function () {
      var r = flatOf(BOX + 'p.rip(' + ALL + ', 0.03);\np.insertBends([1, 0, -1], { radius: 0.06 });\n');
      closed(r, 'inserted');
      near(r.flat.size[0], 3.802743, 1e-5, 'flat'); near(r.flat.size[1], 3.802743, 1e-5, 'flat');
      near(area(r.flat) * W, 0.635937886, 1e-6, 'flat volume');
      assert(r.flat.loops.length === 1 && r.flat.loops[0].length === 12, 'cross: ' + r.flat.loops[0].length);
    });

    test('rfGF: a solid block\'s edge is no corner to rip: refused in a plain sentence', function () {
      var e = errOf(build('p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.rip([[2, 0.5, 0]], 0.03);\n'));
      assert(/not a corner where two walls meet/.test(e), e);
    });

    // ---- Miter Flange corner
    var MF = 'p.sketch("Right").line(-2, ' + T + ', -2, ' + (T + 1) + ').end();\n', E = '[[2, ' + T + ', 2], [4, ' + T + ', 1]]';
    function mf(o) { return H16 + MF + 'p.miterFlange(' + E + ', ' + JSON.stringify(o) + ');\n'; }
    [{ pos: 'inside', v: 0.815259205, fv: 0.815429076, size: [4.9615, 2.9615], wx: 3.933129, wz: 1.933129 },
      { pos: 'bendOutside', v: 0.872779442, fv: 0.872950401, size: [5.0811, 3.0811], wx: 4.052729, wz: 2.052729 },
      { pos: 'outside', v: 0.843805481, fv: 0.843975891, size: [5.0213, 3.0213], wx: 3.992929, wz: 1.992929 }].forEach(function (c) {
      test('rfGF: Miter Flange ' + c.pos + ', 16 ga, gap .01: SolidWorks solid ' + c.v + ', blank ' + c.fv + ', a square notch, no 45° line, walls ending square', function () {
        var r = flatOf(mf({ position: c.pos, miterGap: 0.01, relief: 'rect' }));
        closed(r, c.pos);
        nearRel(r.mp.volume, c.v, 1e-5, 'solid');
        near(area(r.flat) * T, c.fv, 1e-6, 'blank');
        near(r.flat.size[0], c.size[0], 1e-4, 'flat X'); near(r.flat.size[1], c.size[1], 1e-4, 'flat Y');
        var L = r.flat.loops[0];
        assert(r.flat.loops.length === 1 && L.length === 6 && hasVert(L, c.wx, c.wz, 1e-4), 'six corners, the notch at (' + c.wx + ', ' + c.wz + '): ' + JSON.stringify(L));
        var t = r.build.body.pointTester(), y = 0.6;
        // the outer corner of the walls has gone: each wall stops short of it, square
        var oc = c.pos === 'inside' ? [4, 2] : c.pos === 'outside' ? [4 + T, 2 + T] : [4 + 2 * T, 2 + 2 * T];
        assert(!t([oc[0] - T / 2, y, oc[1] - T / 2]), 'nothing at the outer corner');
        assert(t([c.wx - 0.001, y, oc[1] - T / 2]) && !t([c.wx + 0.001, y, oc[1] - T / 2]), 'the wall ends at x = ' + c.wx);
        assert(r.flat.bends.length === 2, 'two bends');
      });
    });

    test('rfGF: Miter Flange 11 ga, K .71, gap .02: walls .133742 from the corner, SolidWorks flat outline; with a Start Offset .25: the relief T/2 wide, T/2 past the bend line, the base keeps its corner beyond', function () {
      var H = 'p.units("in");\np.sheet(0.1196, 0.1196, 0.71);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.sketch("Right").line(-2, 0.1196, -2, 1.1196).end();\n', Eb = '[[2, 0.1196, 2], [4, 0.1196, 1]]';
      var r = flatOf(H + 'p.miterFlange(' + Eb + ', { position: "inside", miterGap: 0.02, relief: "rect" });\n');
      closed(r, 'gap .02');
      near(area(r.flat) * 0.1196, 1.614527032, 1e-6, 'blank');
      assert(hasVert(r.flat.loops[0], 3.866258, 1.866258, 1e-4), 'notch: ' + JSON.stringify(r.flat.loops[0]));
      var s = flatOf(H + 'p.miterFlange(' + Eb + ', { position: "inside", miterGap: 0.02, relief: "rect", startOffset: 0.25 });\n');
      closed(s, 'start .25');
      near(area(s.flat) * 0.1196, 1.583611216, 1e-6, 'blank with the offset');
      assert(hasVert(s.flat.loops[0], 0.1902, 1.701, 1e-4) && hasVert(s.flat.loops[0], 0.25, 1.701, 1e-4) && hasVert(s.flat.loops[0], 0.1902, 2, 1e-4), 'relief: ' + JSON.stringify(s.flat.loops[0]));
    });

    test('rfGF: Miter Flange gap 0 at a corner is refused in a plain sentence (SolidWorks: "The miter flanges interfere with each other"); one edge needs no gap; the default gap builds (.01 in, .25 mm)', function () {
      assert(/interfere with each other at the corner: set a gap distance greater than zero/.test(errOf(build(mf({ position: 'inside', miterGap: 0 })))), errOf(build(mf({ position: 'inside', miterGap: 0 }))));
      noErrors(build(H16 + MF + 'p.miterFlange([[2, ' + T + ', 2]], { miterGap: 0 });\n'));
      var d = build(H16 + MF + 'p.miterFlange(' + E + ', {});\n'), g = build(mf({ miterGap: 0.01 }));
      noErrors(d);
      assert(+d.model.features[d.model.features.length - 1].miterGap === 0.01, 'default gap .01 in');
      nearRel(d.mp.volume, g.mp.volume, 1e-12, 'the default gap');
      var mm = build('p.units("mm");\np.sheet(1.5, 1.5, 0.5);\np.sketch("Top").rect(0, -50, 100, 50).end().baseFlange();\np.sketch("Right").line(-50, 1.5, -50, 26.5).end();\np.miterFlange([[50, 1.5, 50], [100, 1.5, 25]], {});\n');
      noErrors(mm);
      assert(+mm.model.features[mm.model.features.length - 1].miterGap === 0.25, 'default gap .25 mm');
      var s = K.generateScript(d.model), r2 = build(s);
      noErrors(r2);
      assert(/miterGap: 0\.01/.test(s), 'the gap is written');
      nearRel(r2.mp.volume, d.mp.volume, 1e-12, 'round trip');
    });

    test('rfGF: Miter Flange round three edges (G38): SolidWorks 1.333811, flat 4.9615 × 4.923001, two square notches', function () {
      var r = flatOf('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.sketch("Right", 4).line(0, ' + T + ', 0, ' + (1 + T) + ').end();\np.miterFlange([[2, ' + T + ', 0], [0, ' + T + ', 1.5], [2, ' + T + ', 3]], { miterGap: 0.01 });\n');
      closed(r, 'G38');
      nearRel(r.mp.volume, 1.3338107, 1e-5, 'solid');
      near(area(r.flat) * T, 1.334160426, 1e-6, 'blank');
      near(r.flat.size[0], 4.9615, 1e-4, 'X'); near(r.flat.size[1], 4.923001, 1e-4, 'Y');
      assert(r.flat.loops[0].length === 8, 'eight corners: ' + r.flat.loops[0].length);
    });

    // ---- Tear Drop
    function hem(o, at) { return H16 + 'p.hem(0.5, [[2, ' + T + ', 2]], ' + JSON.stringify(o) + ');\n'; }
    test('rfGF: Tear Drop: SolidWorks takes more than 180° and less than 270°: no angle = 200° (the PM\'s start), 268° builds, 180° and 270° are refused', function () {
      var d = build(hem({ hemType: 'teardrop', hemPosition: 'inside', hemRadius: T })), e = build(hem({ hemType: 'teardrop', hemPosition: 'inside', hemRadius: T, hemAngle: 200 }));
      noErrors(d); noErrors(e);
      nearRel(d.mp.volume, e.mp.volume, 1e-12, 'the default is 200°');
      nearRel(e.mp.volume, 0.603928, 1e-5, 'SolidWorks at 200°');
      noErrors(build(hem({ hemType: 'teardrop', hemPosition: 'inside', hemRadius: T, hemAngle: 268 })));
      [180, 270, 300].forEach(function (a) {
        var m = errOf(build(hem({ hemType: 'teardrop', hemPosition: 'inside', hemRadius: T, hemAngle: a })));
        assert(/more than 180° and less than 270°/.test(m), a + '°: ' + m);
      });
    });

    // ---- Rolled hem past 300°
    test('rfGF: Rolled hem 16 ga R = T: 300° (touching the sheet): SolidWorks 0.562136, flat 2.350068, one body, closed; outside 0.590745', function () {
      var r = flatOf(hem({ hemType: 'rolled', hemPosition: 'inside', hemAngle: 300, hemRadius: T }));
      closed(r, '300°');
      nearRel(r.mp.volume, 0.5621363, 1e-6, 'volume');
      near(r.flat.size[1], 2.350068, 1e-5, 'flat');
      var o = flatOf(hem({ hemType: 'rolled', hemPosition: 'outside', hemAngle: 300, hemRadius: T }));
      nearRel(o.mp.volume, 0.5907446, 1e-6, 'outside volume');
    });

    test('rfGF: Rolled hem past 300° curls into its own sheet: the blank is SolidWorks\' (2.397035, ' + 0.5733708 + ' × area, one loop, was two pieces), the solid one clean body. SolidWorks\' volume counts the metal inside the sheet twice and its own check faults that body', function () {
      var r = flatOf(hem({ hemType: 'rolled', hemPosition: 'inside', hemAngle: 330, hemRadius: T }));
      closed(r, '330°');
      near(r.flat.size[1], 2.397035, 1e-5, 'flat'); near(area(r.flat) * T, 0.573370751, 1e-6, 'blank × T');
      assert(r.flat.loops.length === 1 && r.flat.bends.length === 1, 'one blank, one bend: ' + r.flat.loops.length);
      nearRel(r.mp.volume, 0.56664998, 1e-6, 'the joined solid, = OpenCascade');
      [310, 345, 359].forEach(function (a) {
        var q = flatOf(hem({ hemType: 'rolled', hemPosition: 'outside', hemAngle: a, hemRadius: T }));
        closed(q, a + '°');
        assert(q.flat.loops.length === 1, a + '°: one blank');
      });
      return 'volume ' + r.mp.volume.toFixed(6);
    });

    test('rfGF: a rolled hem running into another wall is still refused; the Hem script round trip keeps a 330° roll', function () {
      var r = build(H16 + 'p.hem(0.5, [[2, ' + T + ', 2]], { hemType: "closed", hemPosition: "inside" });\n' + 'p.hem(0.5, [[4, ' + T + ', 1]], { hemType: "rolled", hemPosition: "inside", hemAngle: 330, hemRadius: ' + T + ' });\n');
      assert(/run into|cross/.test(errOf(r)), 'refused: ' + errOf(r));
      var q = build(hem({ hemType: 'rolled', hemPosition: 'inside', hemAngle: 330, hemRadius: T })), s = K.generateScript(q.model), q2 = build(s);
      noErrors(q2);
      nearRel(q2.mp.volume, q.mp.volume, 1e-12, 'round trip');
    });
  })();
