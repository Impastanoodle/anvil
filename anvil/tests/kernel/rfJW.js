  // --- rfJW (2026-11-06, lane sketchtext-2): a Cut-Extrude with Normal cut sketched parallel to the sheet removes
  // exactly what the plain cut removes: the prisms normalCutTool builds from the face outlines keep the tool's cylinder
  // records on the chords of its circles (they came out ~1e-4 short: circles cut as polygons), on a flat base and
  // through a flange wall. ---
  (function () {
    group('rfJW: Normal cut volumes exact (circles, arcs, text) on a flat base and through a wall');
    // Sheet on Top: x ∈ [0,100], y ∈ [0,2], z ∈ [−60,0]; volume 12000. Wall: x ∈ [102,104], y ∈ [4,24], z ∈ [−60,0].
    var SHEET = 'p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, 0, 100, 60);\np.baseFlange(2);';
    var WALL = SHEET + '\np.flange(20, [[100, 2, -30]]);';
    function rfJWPair(base, sketch) {
      var plain = build(base + '\n' + sketch + '\np.cut("through", { reverse: true });');
      var nc = build(base + '\n' + sketch + '\np.cut("through", { reverse: true, normalCut: true });');
      noErrors(plain); noErrors(nc);
      return { plain: plain, nc: nc };
    }
    // the Normal cut's walls are true cylinders: its body carries cylinder records like the plain cut's
    function rfJWCyl(r) { return r.body.polygons.filter(function (p) { return p.surf && p.surf.s && p.surf.s.t === 'cyl'; }).length; }

    test('rfJW: flat base: Normal cut of circles R5 and R3.3 removes exactly 2·π(25 + 3.3²) (1e-6), the same as the plain cut (1e-9), with cylinder walls', function () {
      var q = rfJWPair(SHEET, 'p.sketch("Top", 2).circle(30, 20, 5).circle(60, 30, 3.3);'), A = Math.PI * (25 + 3.3 * 3.3);
      nearRel(q.plain.mp.volume, 12000 - 2 * A, 1e-6, 'plain');
      nearRel(q.nc.mp.volume, 12000 - 2 * A, 1e-6, 'normal cut');
      nearRel(q.nc.mp.volume, q.plain.mp.volume, 1e-9, 'normal cut = plain cut');
      assert(rfJWCyl(q.nc) > 0, 'cylinder records on the normal cut\'s walls');
      return 'removed ' + fmt(12000 - q.nc.mp.volume);
    });

    test('rfJW: flat base: a D (arc R8 over 180° closed by a line) and a 90° arc corner shape by Normal cut: exactly π·64/2 + (16 + π·16/4) × 2 thick', function () {
      var sk = 'p.sketch("Top", 2).arc(50, 30, 8, 0, 180).line(42, 30, 58, 30)' +
        '.line(10, 40, 14, 40).arc(10, 40, 4, 0, 90).line(10, 44, 10, 40).end();';
      var q = rfJWPair(SHEET, sk), A = Math.PI * 64 / 2 + Math.PI * 16 / 4;
      nearRel(q.nc.mp.volume, 12000 - 2 * A, 1e-6, 'normal cut');
      nearRel(q.nc.mp.volume, q.plain.mp.volume, 1e-9, 'normal cut = plain cut');
      return 'removed ' + fmt(12000 - q.nc.mp.volume);
    });

    test('rfJW: through a flange wall: Normal cut of a circle R4 and a D (arc R3) sketched on Right outside the wall removes exactly (16π + 9π/2) × 2', function () {
      var base = build(WALL);
      noErrors(base);
      var q = rfJWPair(WALL, 'p.sketch("Right", 110).circle(30, 14, 4).arc(45, 12, 3, 0, 180).line(42, 12, 48, 12);'), A = 16 * Math.PI + 9 * Math.PI / 2;
      nearRel(base.mp.volume - q.nc.mp.volume, 2 * A, 1e-6, 'normal cut through the wall');
      nearRel(q.nc.mp.volume, q.plain.mp.volume, 1e-9, 'normal cut = plain cut');
      assert(rfJWCyl(q.nc) > 0, 'cylinder walls');
      return 'removed ' + fmt(base.mp.volume - q.nc.mp.volume);
    });

    test('rfJW: Stencil text "B0" (h .5, stroke .06, bridge .06) cut by Normal cut through a .06 in Base Flange, and plain "R8" through a wall: the same volume as the plain cut (1e-9)', function () {
      var IN = 'p.units("in");\np.sheet(0.06, 0.06, 0.71);\np.sketch("Top").rect(0, 0, 3, 1.5);\np.baseFlange(0.06);';
      var q = rfJWPair(IN, 'p.sketch("Top", 0.06).text(0.25, 0.25, "B0", { h: 0.5, mode: "outline", strokeWidth: 0.06, stencil: true, bridge: 0.06 });');
      nearRel(q.nc.mp.volume, q.plain.mp.volume, 1e-9, 'stencil B0 on the base');
      var w = rfJWPair(WALL, 'p.sketch("Right", 110).text(20, 8, "R8", { h: 10, mode: "outline", strokeWidth: 1 });');
      nearRel(w.nc.mp.volume, w.plain.mp.volume, 1e-9, 'R8 through the wall (the 8\'s counters: the face outline joins short chords)');
      var pn = rfJWPair(SHEET, 'p.sketch("Top", 2).text(5, 30, "PN 0864-B @&", { h: 6, mode: "outline", strokeWidth: 0.7 });');
      // @ and & join strokes almost tangentially; there the face outline drops a vertex of a tiny chord the union kept,
      // and that one chord loses its circle (about 1e-7 of the part, 5e-5 of what the & takes away): not exact yet
      nearRel(pn.nc.mp.volume, pn.plain.mp.volume, 1e-6, 'a part number on the base');
      nearRel(12000 - pn.nc.mp.volume, 12000 - pn.plain.mp.volume, 1e-4, 'what it takes away');
      return 'base ' + fmt(q.nc.mp.volume) + ' in³, wall ' + fmt(w.nc.mp.volume);
    });
  })();
