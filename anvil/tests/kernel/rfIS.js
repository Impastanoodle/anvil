  // --- rfIS (2026-11-05, lane rfIS: sheet-metal fidelity against SolidWorks) --- the rows of
  // test-reports/2026-11-02-unchecked-items.md that differed: 5d (edge-flange mitres: 120° on a square corner, 90° on a
  // trapezoid) and 5c (Closed Corner, wall A's end flush with wall B's inside face), plus an audit of Tear Drop / Rolled
  // hems and jogs against their own flats. SolidWorks 2022 SP5 values from
  // Output\SolidWorks Models\Anvil reference\2026-11-02\check-unmeasured\sheet\*.json (16 ga, T = R = .0598, K .5, inches).
  (function () {
    group('rfIS: edge-flange mitres and Closed Corner d = 0 against SolidWorks; hems and jogs against their flats');
    function eq(a, b, label) { assert(a === b, label + ': ' + a + ', want ' + b); }
    function ok(c, label) { assert(c, label); }
    var T = 0.0598, R = 0.0598, HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\n';
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    // every SolidWorks flat vertex (its top face, listed to 6 digits; Anvil's flat has y the other way) is one of Anvil's
    // outline's, and Anvil's outline has no others
    function sameOutline(flat, sw, label) {
      var mine = flat.loops[0].map(function (p) { return [p[0], Math.abs(p[1])]; });
      eq(mine.length, sw.length, label + ': number of outline corners');
      sw.forEach(function (q) {
        var d = Math.min.apply(null, mine.map(function (p) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }));
        ok(d < 2e-6, label + ': SolidWorks corner (' + q.join(', ') + ') is ' + d.toExponential(2) + ' from the nearest');
      });
    }
    // 5d. SolidWorks' wall lengths: its flats are 6 + BA + L wide (L .896423361, BA .187867241 at 120°; L .9402 at 90°)
    var SQ = HEAD + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(0.896423361, [[3, ' + T + ', 4], [6, ' + T + ', 2]], { angle: 120, position: "bendOutside", miter: true });\n';
    var TZ = HEAD + 'p.sketch("Top").polyline([[0, 0], [6, 0], [5, -3], [1, -3]], true).end().baseFlange();\np.flange(0.9402, [[3, ' + T + ', 0], [5.5, ' + T + ', 1.5]], { position: "bendOutside", miter: true });\n';
    var MITERS = [
      ['120° on a square corner', SQ, { vol: 2.064856472, area: 70.479757199, blank: 2.065666771, size: [7.084290602, 5.084290602],
        top: [[0, 0], [0, 5.084291], [5.596506, 5.084291], [6.092434, 4.092434], [7.084291, 0], [7.084291, 3.596506]] }],
      ['90° on a trapezoid (71.6° corner)', TZ, { vol: 1.498330489, area: 51.357478166, blank: 1.498722848, size: [7.049154588, 4.422974404],
        top: [[0, -1.0811], [0, 0], [1, 3], [5, 3], [6.025622, 3.341874], [6.074417, -1.0811], [6.074417, -0.053637], [7.049155, 0.271276]] }]
    ];
    MITERS.forEach(function (c) {
      test('rfIS: edge-flange mitre, ' + c[0] + ': SolidWorks\' flat (default gap .01, each wall\'s line run on across its bend zone to where they meet past the corner) and folded volume', function () {
        var r = flatOf(c[1]), s = c[2], f = r.flat, sz = [Math.max(f.size[0], f.size[1]), Math.min(f.size[0], f.size[1])];
        near(sz[0], s.size[0], 1e-6, 'flat width');
        near(sz[1], s.size[1], 1e-6, 'flat height');
        nearRel(blankArea(f) * T, s.blank, 1e-6, 'blank area × T (SolidWorks\' flat body volume)');
        // SolidWorks' outline (its x, z); Anvil's flat is (x, −z)
        var mine = f.loops[0];
        eq(mine.length, s.top.length, 'number of outline corners');
        s.top.forEach(function (q) {
          var dd = Math.min.apply(null, mine.map(function (p) { return Math.hypot(p[0] - q[0], -p[1] - q[1]); }));
          ok(dd < 2e-6, 'SolidWorks corner (' + q.join(', ') + ') is ' + dd.toExponential(2) + ' from the nearest');
        });
        // the folded part: the bend's end a helicoid from the base's corner to the wall's line, each wall cut square to
        // itself (SolidWorks' "other" faces); SolidWorks reads 3.9e-4 / 8.1e-4 under its own blank, Anvil within 1e-5 of it
        nearRel(r.mp.volume, s.vol, 1e-5, 'folded volume');
        nearRel(r.mp.area, s.area, 1e-3, 'folded area');
        near(r.mp.volume - blankArea(f) * T, s.vol - s.blank, 2e-5, 'folded − blank × T, as SolidWorks\'');
        return r.mp.volume.toFixed(6) + ' / SW ' + s.vol;
      });
    });
    test('rfIS: a free flange end at an acute corner of the sheet leaves no sliver of the overlap strip past the sheet\'s side (trapezoid, 71.6°)', function () {
      var r = flatOf(TZ), lo = Infinity;
      r.flat.loops[0].forEach(function (p) { if (Math.abs(p[1]) < 0.5) lo = Math.min(lo, p[0]); });
      near(lo, 0, 1e-9, 'flat reaches x = 0 only at the flange (no corner at (0.0199, 0.0598))');
      ok(!r.flat.loops[0].some(function (p) { return Math.abs(p[0] - 0.019933) < 1e-4; }), 'no corner on the sheet\'s slanted side');
    });

    // 5c. Closed Corner, Butt, Material Outside tray (both walls stop at the corner): wall A's end face (x = 4) is flush
    // with wall B's inside face. SolidWorks builds it as if wall B's end were picked: B runs on to A's inside face, A's
    // end is set back gap/√2 — the same blank as that pick (5b) to the digit; its folded part reads .822060435
    var TRAY = HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[2, ' + T + ', 2]], { position: "outside", lengthRef: "outer" });\np.flange(1, [[4, ' + T + ', 1]], { position: "outside", lengthRef: "outer" });\n';
    test('rfIS: Closed Corner Butt with wall A\'s end picked, flush with wall B\'s inside face (d = 0): builds as SolidWorks, B\'s end closed to A', function () {
      var a = flatOf(TRAY + 'p.closedCorner([[4, 0.6, 2.0299]], { cornerType: "butt", gap: 0.01 });\n');
      var b = flatOf(TRAY + 'p.closedCorner([[4.0299, 0.6, 1.9402]], { cornerType: "butt", gap: 0.01 });\n');
      nearRel(blankArea(a.flat) * T, 0.822070059, 1e-6, 'blank area × T (SolidWorks\' flat body)');
      nearRel(a.mp.volume, 0.822060435, 2e-5, 'folded volume');
      near(a.mp.volume, b.mp.volume, 1e-9, 'the same part as picking wall B\'s end');
      sameOutline(a.flat, [[0, 0], [0, 2.9615], [3.9402, 1.9402], [3.992929, 2.0811], [3.992929, 2.9615], [4.0811, 1.9402], [4.0811, 1.992929], [4.9615, 0], [4.9615, 1.992929]], 'flat');
      return a.mp.volume.toFixed(9);
    });

    // audit (QUEUE "Sheet-metal fidelity": never measured beyond rfDO's lengths): Tear Drop / Rolled hems and jogs, the
    // folded solid against its own flat (K .5: volume = blank area × T exactly) and the bend line at the middle of the
    // bend allowance, BA = (R + T/2)·A, from the bend's start (Material Inside: R + T back from the edge; Bend Outside: at it)
    var PL = HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    var AUD = [
      ['Rolled 270° inside, R = T', 'p.hem(0.5, [[2, ' + T + ', 2]], { hemType: "rolled", hemPosition: "inside", hemAngle: 270, hemRadius: ' + R + ' });', 270, R, 2 - R - T],
      ['Rolled 180° outside, R .1', 'p.hem(0.5, [[2, ' + T + ', 2]], { hemType: "rolled", hemPosition: "outside", hemAngle: 180, hemRadius: 0.1 });', 180, 0.1, 2],
      ['Tear Drop 200° inside, R = T', 'p.hem(0.5, [[2, ' + T + ', 2]], { hemType: "teardrop", hemPosition: "inside", hemAngle: 200, hemRadius: ' + R + ' });', 200, R, 2 - R - T],
      ['Tear Drop 250° outside, R .1', 'p.hem(0.5, [[2, ' + T + ', 2]], { hemType: "teardrop", hemPosition: "outside", hemAngle: 250, hemRadius: 0.1 });', 250, 0.1, 2]
    ];
    AUD.forEach(function (c) {
      test('rfIS audit: ' + c[0] + ': folded volume = blank area × T, bend line at the middle of BA', function () {
        var r = flatOf(PL + c[1] + '\n'), A = c[2] * Math.PI / 180, BA = A * (c[3] + T / 2);
        near(r.mp.volume, blankArea(r.flat) * T, 1e-9, 'folded vs blank');
        eq(r.flat.bends.length, 1, 'one bend line');
        near(Math.abs(r.flat.bends[0].a[1]), c[4] + BA / 2, 1e-6, 'bend line');
        near(r.flat.bends[0].ba, BA, 1e-6, 'bend allowance');
      });
    });
    [['Material Outside 90°, .5', '0.5, { fixed: [1, ' + T + ', 1], offsetRef: "outside", reverse: true }', 90, 3, 3 + 0.5 - 3 * T + Math.PI / 2 * (R + T / 2)],
     ['Material Inside 45°, .3', '0.3, { fixed: [1, ' + T + ', 1], angle: 45, offsetRef: "inside", reverse: true }', 45, 3, null],
     ['Fix projected length, overall .5', '0.5, { fixed: [1, ' + T + ', 1], offsetRef: "overall", reverse: true, fixLength: true }', 90, 3, null]].forEach(function (c) {
      test('rfIS audit: jog ' + c[0] + ': folded volume = blank area × T, two bend lines BA apart plus the riser', function () {
        var r = flatOf(PL + 'p.sketch("Top", ' + T + ').line(3, 0, 3, -2).jog(' + c[1] + ');\n'), A = c[2] * Math.PI / 180, BA = A * (R + T / 2);
        near(r.mp.volume, blankArea(r.flat) * T, 1e-9, 'folded vs blank');
        eq(r.flat.bends.length, 2, 'two bend lines');
        r.flat.bends.forEach(function (b) { near(b.ba, BA, 1e-6, 'bend allowance'); });
        near(r.flat.bends[0].a[0], c[3], 1e-6, 'first bend line on the sketch line');
        if (c[4] != null) near(r.flat.bends[1].a[0], c[4], 1e-6, 'second bend line: riser straight (offset − 3T) + BA past the first');
      });
    });
  })();
