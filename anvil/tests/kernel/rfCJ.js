  // --- rfCJ (2026-10-14, lane CJ: flat-pattern fixes) --- every piece of a base face split by a cut is laid with the
  // base map (a window across a channel bottom running into both bends lost the far half and whatever hung on it), and
  // the Sketched Bend anchor pass picks the base face by the same side rule as the plain pass (a pocket on the sketch
  // side flipped every UP note to DOWN). 2 mm steel, T = R = 2, K = 0.5, a 120 × 60 base.
  (function () {
    group('rfCJ: split base face laid whole, Sketched Bend side rule');
    var T = 2, R = 2, BA90 = Math.PI / 2 * (R + 0.5 * T);
    var HEAD = 'p.units("mm");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -60, 120, 60).end().baseFlange();\n';
    var CHANNEL = HEAD + 'p.flange(40, [[0, ' + T + ', 30]]);\np.flange(40, [[120, ' + T + ', 30]]);\n';
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function box(l) { var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity]; l.forEach(function (p) { for (var k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }); return { lo: lo, hi: hi }; }
    test('rfCJ: a 120 × 10 window cut across a channel bottom after both flanges, running 1 mm into each bend, splits the base face in two: the flat keeps both halves (outline 4 corners, one 120 × 10 hole, area = the uncut channel − 1200) and a third flange on the far half still unfolds (3 bends, its strip adds what it adds to the uncut channel) (was: the far half and the window gone, one 8-corner loop, area −4200)', function () {
      var c0 = flatOf(CHANNEL), c1 = flatOf(CHANNEL + 'p.sketch("Top", ' + T + ').rect(-1, -35, 122, 10).cut("through", { reverse: true });');
      assert(c0.flat.loops.length === 1, 'uncut channel: one loop');
      near(c0.flat.size[0], 120 + 2 * (BA90 + 40), 1e-9, 'uncut channel width');
      assert(c1.flat.loops.length === 2, 'outline + the window, got ' + c1.flat.loops.length + ' loops');
      assert(c1.flat.loops[0].length === 4, 'outline has 4 corners, got ' + c1.flat.loops[0].length);
      near(c1.flat.size[0], c0.flat.size[0], 1e-9, 'same width as the uncut channel'); near(c1.flat.size[1], 60, 1e-9, 'same height');
      // The window's ends sit within the bend strips' weld overlap of the bend lines: flatPattern lays each strip from
      // −eps to BA + eps (eps = 1e-3) so it welds to the base, and this cut (from the top face down) leaves the bend's
      // inside surface whole, so the strip stays whole and its overlap shows through a hole that reaches the bend line
      // (119.998 today; exactly 120 if the overlap is ever clipped to the base's holes).
      var WELD = 1e-3, w = box(c1.flat.loops[1]);
      near(w.hi[0] - w.lo[0], 120, 2 * WELD + 1e-6, 'window 120 wide (the base between the bends, less the strips\' weld overlap)'); near(w.hi[1] - w.lo[1], 10, 1e-6, 'window 10 tall');
      near(blankArea(c1.flat), blankArea(c0.flat) - 1200, 10 * 2 * WELD + 1e-6, 'blank area = uncut − the window');
      // blank × T against the solid: the uncut channel's shortfall is the faceted bends' alone; the cut part shows that
      // plus the two 1 mm bites the window took out of the bends below the sheet's top (the inside surface is whole
      // there, so the strips are not notched: known, see bendSurfaceNotches), at most 1 × 10 × T each
      nearRel(blankArea(c0.flat) * T, c0.mp.volume, 2e-3, 'uncut: blank area × T ≈ volume (K = 0.5; faceted bends)');
      var over = (blankArea(c1.flat) * T - c1.mp.volume) - (blankArea(c0.flat) * T - c0.mp.volume);
      assert(over > -1e-6 && over <= 2 * 1 * 10 * T + 1e-6, 'the cut blank shows the two 1 mm bend bites and nothing more: ' + fmt(over) + ' mm³ over the solid');
      var c3 = flatOf(CHANNEL + 'p.flange(20, [[60, ' + T + ', 0]]);'), c4 = flatOf(CHANNEL + 'p.sketch("Top", ' + T + ').rect(-1, -35, 122, 10).cut("through", { reverse: true });\np.flange(20, [[60, ' + T + ', 0]]);');
      assert(c4.flat.bends.length === 3, 'three bends with the flange on the far half, got ' + c4.flat.bends.length);
      assert(c4.flat.loops.length === 2, 'outline + the window with the third flange, got ' + c4.flat.loops.length);
      near(blankArea(c4.flat) - blankArea(c1.flat), blankArea(c3.flat) - blankArea(c0.flat), 1e-6, 'the third flange adds the same strip + wall as on the uncut channel');
      near(c4.flat.size[1], c3.flat.size[1], 1e-9, 'same height as the uncut channel with the third flange');
      return 'area ' + fmt(blankArea(c1.flat)) + ', with the far flange ' + fmt(blankArea(c4.flat));
    });
    test('rfCJ: a 10 × 10 × 1 pocket on the sketch side (2 % of the face) then a Sketched Bend: the flat is still drawn from the sketch side, the bend reads UP (was: the anchor pass kept the old 1e-6 tie-break, the far face won and the note read DOWN); the same part without the pocket reads UP', function () {
      var BEND = 'p.sketch("Top", ' + T + ').line(80, 0, 80, -60).sketchedBend(90, {});';
      var plain = flatOf(HEAD + BEND), pocket = flatOf(HEAD + 'p.sketch("Top", ' + T + ').rect(10, -40, 10, 10).cut(1, { reverse: true });\n' + BEND);
      var top = pocket.mesh.faces.filter(function (f) { return Math.abs(f.normal[1] - 1) < 1e-6 && Math.abs(f.w - T) < 1e-6; })[0], bot = pocket.mesh.faces.filter(function (f) { return Math.abs(f.normal[1] + 1) < 1e-6 && Math.abs(f.w) < 1e-6; })[0];
      assert(top && bot && bot.area > top.area + 50, 'the pocket made the sketch-side face smaller: ' + fmt(top && top.area) + ' vs ' + fmt(bot && bot.area));
      assert(plain.flat.bends.length === 1 && plain.flat.bends[0].up && plain.flat.bends[0].label.indexOf('UP') === 0, 'no pocket: UP, got ' + plain.flat.bends.map(function (b) { return b.label; }).join(', '));
      assert(pocket.flat.bends.length === 1 && pocket.flat.bends[0].up && pocket.flat.bends[0].label.indexOf('UP') === 0, 'pocket: UP, got ' + pocket.flat.bends.map(function (b) { return b.label; }).join(', '));
      near(pocket.flat.size[0], plain.flat.size[0], 1e-9, 'same flat width'); near(pocket.flat.size[1], plain.flat.size[1], 1e-9, 'same flat height');
      assert(pocket.flat.loops.length === 1, 'a blind pocket leaves no hole in the blank, got ' + pocket.flat.loops.length + ' loops');
      return plain.flat.bends[0].label + ' / ' + pocket.flat.bends[0].label;
    });
    test('rfCJ: a corner notch cut after the flange (30 × 6 through the z = 0 corner: base corner, the bend\'s end and the wall corner) leaves no bend-strip tab: one 6-corner loop, the blank loses exactly 10 × 5 of base + BA × 5 of strip + 40 × 5 of wall, no point of the outline between the base and the wall at that end (was: a BA × 5 tab of strip where the part has no metal, a 10-corner loop); the same notch mid-edge is cut through base, strip and wall as before', function () {
      var ONE = HEAD + 'p.flange(40, [[120, ' + T + ', 30]]);\n';
      var plain = flatOf(ONE), notch = flatOf(ONE + 'p.sketch("Top", 50).rect(110, -5, 30, 6).cut("through", { reverse: true });'), mid = flatOf(ONE + 'p.sketch("Top", 50).rect(110, -35, 30, 10).cut("through", { reverse: true });');
      near(plain.flat.size[0], 120 + BA90 + 40, 1e-9, 'uncut width'); assert(plain.flat.loops.length === 1 && plain.flat.loops[0].length === 4, 'uncut: one 4-corner loop');
      assert(notch.flat.loops.length === 1, 'notch: one loop, got ' + notch.flat.loops.length);
      assert(notch.flat.loops[0].length === 6, 'notch: 6 corners, got ' + notch.flat.loops[0].length + ': ' + notch.flat.loops[0].map(function (p) { return '(' + fmt(p[0]) + ',' + fmt(p[1]) + ')'; }).join(' '));
      near(blankArea(notch.flat), blankArea(plain.flat) - 5 * (10 + BA90 + 40), 1e-6, 'blank area = uncut − the notch through base, strip and wall');
      var y0 = Math.min.apply(null, plain.flat.loops[0].map(function (p) { return p[1]; })), yTop = y0 + 60;   // the z = 0 edge of the flat
      var tab = notch.flat.loops[0].filter(function (p) { return p[0] > 120 + 1e-6 && p[0] < 120 + BA90 - 1e-6 && p[1] > yTop - 5 - 1e-6; });
      assert(!tab.length, 'no outline point on the bend strip at the notched end: ' + tab.map(function (p) { return '(' + fmt(p[0]) + ',' + fmt(p[1]) + ')'; }).join(' '));
      nearRel(blankArea(notch.flat) * T, notch.mp.volume, 2e-3, 'blank area × T ≈ volume');
      assert(mid.flat.loops.length === 1 && mid.flat.loops[0].length === 8, 'mid-edge notch: one 8-corner loop, got ' + mid.flat.loops.map(function (l) { return l.length; }).join('/'));
      near(blankArea(mid.flat), blankArea(plain.flat) - 10 * (10 + BA90 + 40), 1e-6, 'mid-edge notch area');
      return 'notched area ' + fmt(blankArea(notch.flat)) + ' (' + notch.flat.loops[0].length + ' corners)';
    });
    test('rfCJ: a flange meeting that end still owns it: with a second flange on the z = 0 edge and rect reliefs at the shared corner, the relief\'s bite out of the neighbouring bend\'s start is no notch of its own (the relief notch draws it), so the blank has no hair cut into the base corner and the same outline as before the fix', function () {
      var two = flatOf(HEAD + 'p.flange(40, [[120, ' + T + ', 30]], { relief: "rect" });\np.flange(40, [[60, ' + T + ', 0]], { relief: "rect" });');
      var y0 = Math.min.apply(null, two.flat.loops[0].map(function (p) { return p[1]; }));
      // every outline point near the shared corner (120, z = 0) lies on the base's own edges or the reliefs' rims: on
      // x = 120 (the base edge), on the z = 0 edge, or at least a relief width from both; nothing a hair inside the base
      var hair = two.flat.loops[0].filter(function (p) { return p[0] > 120 - 0.01 && p[0] < 120 - 1e-6 && Math.abs(p[1] - y0) < 0.01; });
      assert(!hair.length, 'no outline point a hair inside the base corner: ' + hair.map(function (p) { return '(' + fmt(p[0]) + ',' + fmt(p[1]) + ')'; }).join(' '));
      assert(two.flat.loops.length === 1, 'one loop, got ' + two.flat.loops.length);
      nearRel(blankArea(two.flat) * T, two.mp.volume, 2e-3, 'blank area × T ≈ volume');
      return 'corners ' + two.flat.loops[0].length + ', area ' + fmt(blankArea(two.flat));
    });
  })();
