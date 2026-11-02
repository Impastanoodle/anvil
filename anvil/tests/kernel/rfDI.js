  // --- rfDI (2026-10-27, lane DI: sheet metal Rip and Tab) --- Rip (a slot `gap` wide along a corner edge where two
  // walls meet, through the thickness: side1 / side2 / both) on a shelled 2 × 2 × 1 in box (0.06 wall, open top) and on
  // a Base Flange tray with a Closed Corner; Tab (Base Flange/Tab on a part that already has a sheet: T into the face it
  // is sketched on, merged, thickness linked) on a 4 × 2 × 0.06 Base Flange. Exact volumes, flats, errors, round trips.
  (function () {
    group('rfDI: Rip (shelled box, closed corner, directions, errors) and Tab (into / away, flat, linked thickness)');
    // SolidWorks 2022 (2026-11-02, rfGD rows corner rip_*): the rip runs the corner's whole length, through the box's
    // bottom too: one side removes G·W·1 (four corners 0.670464 of 0.677664); both walls stop square S = T + g/√2 from
    // the outer corner, the bottom's corner goes with them (four corners 0.652974). Was a 45° slit stopping at the bottom.
    var W = 0.06, G = 0.03, LEN = 1, S = W + G / Math.SQRT2, BOTH = S * S * W + (S * S - (S - W) * (S - W)) * (1 - W);
    var BOX = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(' + W + ', [[1, 1, -1]]);\n';
    var OUT = [2, 0.5, 0], IN = [2 - W, 0.5, -W];   // the corner at x = 2, z = 0: outside and inside edges
    function rip(edges, gap, opts) { return 'p.rip(' + JSON.stringify(edges) + ', ' + gap + (opts ? ', ' + JSON.stringify(opts) : '') + ');\n'; }
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function errOf(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[ids.length - 1]] : ''; }
    var box0 = null;
    function box() { if (!box0) { box0 = build(BOX); noErrors(box0); } return box0; }

    test('rfDI: the shelled 2 × 2 × 1 box, wall .06: volume 4 − 1.88² × .94', function () {
      near(box().mp.volume, 4 - 1.88 * 1.88 * 0.94, 1e-9, 'box volume');
    });

    test('rfDI: Rip side1 / side2 on the outside corner edge, gap .03: volume − 1 × .03 × .06 exactly (through the bottom, SolidWorks), named Rip1', function () {
      ['side1', 'side2'].forEach(function (d) {
        var r = build(BOX + rip([OUT], G, { direction: d }));
        noErrors(r);
        near(box().mp.volume - r.mp.volume, LEN * G * W, 1e-9, d + ' removed');
        consistentVolume(r);
        assert(r.model.features[r.model.features.length - 1].name === 'Rip1', 'name ' + r.model.features[r.model.features.length - 1].name);
      });
      var a = build(BOX + rip([OUT], G, { direction: 'side1' })).build.body.pointTester(), b = build(BOX + rip([OUT], G, { direction: 'side2' })).build.body.pointTester();
      // side1: wall 1 (here the z = 0 wall: (n1 × n2)·d > 0 with d = +y) keeps the corner square, the x = 2 wall is cut back
      assert(b([2 - W / 2, 0.5, -W / 2]) && !b([2 - W - G / 2, 0.5, -W / 2]) && b([2 - W - G - 0.005, 0.5, -W / 2]), 'side2: z = 0 wall cut back from the x = 2 wall');
      assert(a([2 - W / 2, 0.5, -W / 2]) && !a([2 - W / 2, 0.5, -W - G / 2]) && a([2 - W / 2, 0.5, -W - G - 0.005]), 'side1: x = 2 wall cut back from the z = 0 wall');
      assert(!a([2 - W / 2, W / 2, -W - G / 2]) && a([2 - W - 0.005, W / 2, -W - G / 2]) && a([2 - W / 2, W / 2, -W / 2]), 'the slot goes through the bottom, as wide as the wall, and no further');
    });

    test('rfDI: Rip both directions: both walls and the bottom stop square at T + g/√2 from the outer corner (SolidWorks 0.652974 for four corners); the inside edge gives the same', function () {
      var r = build(BOX + rip([OUT], G)), q = build(BOX + rip([IN], G)), s = build(BOX + rip([IN], G, { direction: 'side1' }));
      noErrors(r); noErrors(q); noErrors(s);
      near(box().mp.volume - r.mp.volume, BOTH, 1e-9, 'both removed');
      near(q.mp.volume, r.mp.volume, 1e-9, 'inside edge = outside edge');
      near(box().mp.volume - s.mp.volume, LEN * G * W, 1e-9, 'inside edge side1');
      consistentVolume(r);
      var t = r.build.body.pointTester();
      assert(!t([2 - W / 2, 0.5, -W / 2]) && !t([2 - W / 2, 0.5, -S + 0.005]) && t([2 - W / 2, 0.5, -S - 0.005]) && t([2 - S - 0.005, 0.5, -W / 2]), 'the corner square is gone, both walls stop square at S');
    });

    test('rfDI: Rip all four corners (side1) of the box: 4 × the slot, still one body; per-edge direction', function () {
      var C = [[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]];
      var r = build(BOX + rip(C, G, { direction: 'side1' }));
      noErrors(r);
      near(box().mp.volume - r.mp.volume, 4 * LEN * G * W, 1e-9, 'four slots');
      assert(r.build.bodies.length === 1, 'one body: ' + r.build.bodies.length);
      var m = build(BOX + rip([{ at: OUT, direction: 'side2' }, [0, 0.5, -2]], G));
      noErrors(m);
      near(box().mp.volume - m.mp.volume, LEN * G * W + BOTH, 1e-9, 'one side2 edge + one both edge');
    });

    test('rfDI: Rip on a part with a sheet uses the sheet\'s T; script round trip keeps edges, gap, directions', function () {
      var code = 'p.units("in");\np.sheet(' + W + ', ' + W + ', 0.5);\n' + BOX.split('\n').slice(1).join('\n') + rip([{ at: OUT, direction: 'side2' }, [0, 0.5, -2]], G);
      var r = build(code);
      noErrors(r);
      near(box().mp.volume - r.mp.volume, LEN * G * W + BOTH, 1e-9, 'removed');
      var s = K.generateScript(r.model);
      assert(/p\.rip\(\[\{"at":\[2,0\.5,0\],"direction":"side2"\},\[0,0\.5,-2\]\], 0\.03/.test(s), 'script line: ' + s.split('\n').filter(function (l) { return /rip/.test(l); }).join(' '));
      var r2 = build(s);
      noErrors(r2);
      near(r2.mp.volume, r.mp.volume, 1e-12, 'round trip volume');
      assert(r2.model.features.filter(function (f) { return f.type === 'rip'; })[0].name === 'Rip1', 'name kept');
    });

    test('rfDI: Rip errors: an edge that is not two walls\' corner, a missing edge, a zero gap, no edges', function () {
      var e1 = build(BOX + rip([[1, 1, 0]], G));
      assert(/not a corner where two walls meet/.test(errOf(e1)), 'rim edge: ' + errOf(e1));
      var e2 = build(BOX + rip([[1, 0.5, -1]], G));
      assert(/no edge at/.test(errOf(e2)), 'no edge: ' + errOf(e2));
      var e3 = build(BOX + rip([OUT], 0));
      assert(/gap must be a positive number/.test(errOf(e3)), 'gap: ' + errOf(e3));
      var e4 = build(BOX + rip([], G));
      assert(/pick the corner edges/.test(errOf(e4)), 'no edges: ' + errOf(e4));
      var msg = '';
      try { build(BOX + rip([OUT], G, { direction: 'up' })); } catch (e) { msg = e.message; }
      assert(/direction must be/.test(msg), 'bad direction refused: ' + msg);
      var m = K.newModel('t'); K.runScript(m, BOX + rip([OUT], G)); m.features[m.features.length - 1].direction = 'up';
      assert(/direction must be/.test(K.rebuild(m).errors[m.features[m.features.length - 1].id] || ''), 'bad direction in the feature');
    });

    // a 4 × 3 tray, 16 ga, four 1 in Material Inside flanges (rfCS) with an Underlap Closed Corner (gap .010; SolidWorks' Underlap is the shape Anvil's Butt had before lane DV) at front-left:
    // the front wall covers the corner, the left wall stops .010 short. Rip there widens the gap to the rip gap.
    var T = 0.0598, R = 0.0598, H = 1 - (R + T);
    var TRAY = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('') +
      'p.closedCorner([[' + T / 2 + ', 0.6, ' + (R + T) + ']], { cornerType: "underlap", gap: 0.01, coplanar: false });\n';
    test('rfDI: Rip at a Closed Corner (front-left of a 16 ga tray): the gap widens to .03 (volume − H × .02 × T exactly), any direction; the flat is still one blank, same size, both walls with the wider gap', function () {
      var b = flatOf(TRAY);
      ['both', 'side1', 'side2'].forEach(function (d) {
        var r = flatOf(TRAY + rip([[0, 0.6, 0]], G, { direction: d }));
        near(b.mp.volume - r.mp.volume, H * (G - 0.01) * T, 1e-9, d + ' removed');
        assert(r.flat.loops.length === 1, 'one loop: ' + r.flat.loops.length);
        near(r.flat.size[0], b.flat.size[0], 1e-9, 'flat width'); near(r.flat.size[1], b.flat.size[1], 1e-9, 'flat height');
        nearRel(blankArea(b.flat) - blankArea(r.flat), H * (G - 0.01), 1e-6, d + ' blank area');
        var t = r.build.body.pointTester();
        assert(t([T + G / 2, 0.6, T / 2]) && !t([T / 2, 0.6, T + G - 0.002]) && t([T / 2, 0.6, T + G + 0.002]), d + ': the front wall keeps the corner, the left wall stops .03 short');
      });
    });

    // Tab: a 4 × 2 Base Flange .06 thick (Top plane, so its top face is at y = .06)
    var PLATE = 'p.units("in");\np.sheet(' + W + ', ' + W + ', 0.5);\np.sketch("Top").rect(0, 0, 4, 2).end().baseFlange();\n';
    test('rfDI: Tab 1 × 1 sketched on the top face beside the plate: + 1 × 1 × .06 exactly, flush (y 0 … .06), named Tab1; the flat is 5 × 2, one loop, area 9', function () {
      var b = build(PLATE), r = flatOf(PLATE + 'p.sketch("Top", ' + W + ').rect(4, 0, 1, 1).end().tab();\n');
      near(r.mp.volume - b.mp.volume, 1 * 1 * W, 1e-12, 'added');
      var bb = r.build.body.getBounds();
      near(bb.min[1], 0, 1e-12, 'bottom'); near(bb.max[1], W, 1e-12, 'top'); near(bb.max[0], 5, 1e-12, 'tab end');
      var f = r.model.features[r.model.features.length - 1];
      assert(f.name === 'Tab1' && f.tab && f.sheetBase && f.linkT, 'feature ' + JSON.stringify(f));
      near(r.flat.size[0], 5, 1e-9, 'flat width'); near(r.flat.size[1], 2, 1e-9, 'flat height');
      assert(r.flat.loops.length === 1, 'one loop'); near(blankArea(r.flat), 9, 1e-9, 'blank area');
      consistentVolume(r);
    });

    test('rfDI: Tab from the bottom face\'s plane goes into the sheet too; Reverse goes away from the face; a plane off the sheet is refused', function () {
      var b = build(PLATE);
      var r = build(PLATE + 'p.sketch("Top").rect(4, 0, 1, 1).end().tab();\n');
      noErrors(r); near(r.mp.volume - b.mp.volume, W, 1e-12, 'added'); near(r.build.body.getBounds().max[1], W, 1e-12, 'flush');
      var a = build(PLATE + 'p.sketch("Top", ' + W + ').rect(1, 0.5, 1, 1).end().tab({ reverse: true });\n');
      noErrors(a); near(a.mp.volume - b.mp.volume, W, 1e-12, 'stacked tab'); near(a.build.body.getBounds().max[1], 2 * W, 1e-12, 'away from the face');
      var e = build(PLATE + 'p.sketch("Top", 0.5).rect(4, 0, 1, 1).end().tab();\n');
      assert(/sketch the tab on a flat face of the sheet/.test(errOf(e)), 'off the sheet: ' + errOf(e));
    });

    test('rfDI: Tab thickness is linked: the sheet goes to .075 and the tab follows; script round trip writes p.tab', function () {
      var code = PLATE + 'p.sketch("Top", ' + W + ').rect(4, 0, 1, 1).end().tab();\n';
      var r = build(code), s = K.generateScript(r.model);
      assert(/p\.tab\(\{ sketch: f\d+, name: "Tab1" \}\)/.test(s), 'script: ' + s.split('\n').filter(function (l) { return /tab/.test(l); }).join(' '));
      var r2 = build(s); noErrors(r2); near(r2.mp.volume, r.mp.volume, 1e-12, 'round trip');
      var m = JSON.parse(JSON.stringify(r.model));
      m.sheet = K.makeSheet(Object.assign({}, m.sheet, { thickness: 0.075 }));
      m.features.forEach(function (f) { if (f.sheetBase && !f.tab) f.depth = 0.075; });
      m.features[m.features.length - 2].plane = { ref: 'Top', offset: 0.075 };
      var bt = K.rebuild(m), mp = K.massProps(K.meshFromBody(bt.body));
      assert(!Object.keys(bt.errors).length, JSON.stringify(bt.errors));
      near(mp.volume, 9 * 0.075, 1e-12, 'plate + tab at .075');
    });
  })();
