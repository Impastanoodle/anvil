  // --- rfDJ (2026-10-27, lane DJ: Unfold / Fold limits) --- material added on the flat folds back round the bend (a
  // Tab past the part's edge across the bend line, a boss on the inside of the bend), blind pockets across a bend fold
  // back at their depth, several Unfolds open at once (folded in the opposite order, or all by one Fold), the second
  // Unfold picking its fixed face and bend on the part as shown. 16 ga steel, T = R = 0.0598, K = 0.5. Anvil's bend is
  // 8 chords per 90°, so the exact volumes here are the faceted ones (OpenCascade's true-cylinder rows are on the occt
  // test page).
  (function () {
    group('rfDJ: Unfold / Fold limits (added material folds back, blind cuts across a bend, several Unfolds open)');
    var T = 0.0598, R = 0.0598, BA = Math.PI / 2 * (R + 0.5 * T), ZB = (R + T) - BA / 2;
    var SN = Math.sin(Math.PI / 16);
    function rfDJSec(r0, r1) { return 8 * 0.5 * SN * (r1 * r1 - r0 * r0); }   // a faceted 90° bend section between two radii
    // a 4 × 2 base flange with a 1.0 edge flange on its front edge (x 0 … 4, z 0 … 2; the bend line lies at z = ZB in the flat)
    var BR = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[2, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
    var UNF = 'p.unfold([1, ' + T + ', 1], null);\n';
    var TAB = 'p.sketch("Top").rect(4, ' + (-(ZB + 0.25)) + ', 0.5, 0.5).extrude(' + T + ');\n';
    var U = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, ' + T + ', 0], [3, ' + T + ', 4]], { position: "inside", lengthRef: "outer" });\n';
    var SLOT_A = 'p.sketch("Top", 1).rect(2.5, ' + (-(ZB + 0.125)) + ', 1, 0.25).cut("through", { reverse: true });\n';
    var SLOT_B = 'p.sketch("Top", 1).rect(2.5, ' + (-(4 - ZB + 0.125)) + ', 1, 0.25).cut("through", { reverse: true });\n';
    var SLOTV = 1.0 * (rfDJSec(R, R + T) + (0.25 - BA) * T);   // a 0.25 × 1.0 slot across a bend line, folded
    var memo = {};
    function rfDJB(code) { if (!memo[code]) memo[code] = build(code); return memo[code]; }
    function rfDJFlat(r) { return K.flatPattern(r.model, r.build, r.mesh); }
    function rfDJErr(r) { var ids = Object.keys(r.errors); return ids.length ? r.errors[ids[0]] : ''; }
    function rfDJUBends() { var b = rfDJB(U), bs = K.sheetBends(b.model, b.build, b.mesh); return { A: bs.filter(function (x) { return x.at[2] < 1; })[0].at, B: bs.filter(function (x) { return x.at[2] > 1; })[0].at }; }

    test('rfDJ: the acceptance case: Unfold, a 0.5 × 0.5 × T Tab (Boss-Extrude) past the part\'s side straddling the bend line, Fold: the tab bends with the sheet, volume = bracket + 0.5·(T·(0.5 − BA) + bend section) exactly (= + 0.5·0.5·T up to the facets); the flat is the blank plus the tab, the bend line runs across it, DXF clean', function () {
      var b = rfDJB(BR), f = rfDJB(BR + UNF + TAB + 'p.fold();\n');
      noErrors(f);
      near(f.mp.volume, b.mp.volume + 0.5 * (T * (0.5 - BA) + rfDJSec(R, R + T)), 1e-12, 'folded volume (faceted bend)');
      near(f.mp.volume - b.mp.volume, 0.25 * T, 2e-3 * 0.25 * T, 'about 0.5 × 0.5 × T (neutral-axis bend, K = 0.5; the facets lose 0.5·(BA·T − section))');
      var tst = f.build.body.pointTester(), C = [4.25, R + T, R + T], rm = R + T / 2;
      assert(tst([4.25, C[1] - rm * Math.SQRT1_2, C[2] - rm * Math.SQRT1_2]), 'metal mid-bend in the tab');
      assert(tst([4.25, T / 2, R + T + 0.1]) && tst([4.25, R + T + 0.1, T / 2]), 'tab metal on the base and on the wall');
      assert(!tst([4.25, T / 2, R + T + 0.2]) && !tst([4.25, R + T + 0.2, T / 2]), 'and only 0.25 − BA/2 of it each side');
      var fl = rfDJFlat(f), fl0 = rfDJFlat(b);
      assert(fl.loops.length === 1 && fl.loops[0].length === 8, 'one outline with the tab\'s 4 corners added: ' + fl.loops.map(function (l) { return l.length; }));
      near(K.signedArea(fl.loops[0]) - K.signedArea(fl0.loops[0]), 0.25, 1e-9, 'blank + 0.5 × 0.5');
      near(fl.size[0], 4.5, 1e-9, 'blank 4.5 wide across the tab'); near(fl.size[1], fl0.size[1], 1e-9, 'length unchanged');
      assert(fl.bends.length === 1, 'one bend');
      near(Math.abs(fl.bends[0].a[0] - fl.bends[0].b[0]), 4.5, 1e-9, 'the bend line runs across the tab (4.5 long)');
      var dxf = K.exportDXFFlat(fl, 'in', { style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
      assert(c.ok, 'DXF: ' + c.errors.join('; '));
      return 'added ' + fmt(f.mp.volume - b.mp.volume) + ' (0.25·T = ' + fmt(0.25 * T) + ')';
    });

    test('rfDJ: a 0.5 × 0.5 × T boss on the flat\'s top face (the inside of the bend) straddling the bend line folds round it: base and wall pieces 0.25 − BA/2 long, the bend piece compressed to the axis (R = T): exact faceted volume; the flat blank does not change', function () {
      var b = rfDJB(BR), f = build(BR + UNF + 'p.sketch("Top", ' + T + ').rect(1, ' + (-(ZB + 0.25)) + ', 0.5, 0.5).extrude(' + T + ');\np.fold();\n');
      noErrors(f);
      near(f.mp.volume - b.mp.volume, 2 * 0.5 * (0.25 - BA / 2) * T + 0.5 * rfDJSec(0, R), 1e-12, 'boss folded');
      var tst = f.build.body.pointTester(), C = [1.25, R + T, R + T];
      assert(tst([1.25, C[1] - 0.5 * R * Math.SQRT1_2, C[2] - 0.5 * R * Math.SQRT1_2]), 'boss metal inside the bend');
      assert(tst([1.25, 1.5 * T, R + T + 0.1]) && tst([1.25, R + T + 0.1, 1.5 * T]), 'on the base top and the wall\'s inside');
      var fl = rfDJFlat(f), fl0 = rfDJFlat(b);
      assert(fl.loops.length === 1, 'no hole'); near(K.signedArea(fl.loops[0]), K.signedArea(fl0.loops[0]), 1e-9, 'same blank');
      return 'added ' + fmt(f.mp.volume - b.mp.volume);
    });

    test('rfDJ: a blind 1.0 × 0.5 pocket 0.4·T deep cut flat across the bend line folds back at its depth: from the top (inside of the bend) it takes the bend section from R to R + 0.4T, from the bottom R + 0.6T to R + T, exactly; the flat blank stays whole either way', function () {
      var b = rfDJB(BR), d = 0.4 * T;
      var top = build(BR + UNF + 'p.sketch("Top", ' + T + ').rect(1, ' + (-(ZB + 0.25)) + ', 1, 0.5).cut(' + d + ', { reverse: true });\np.fold();\n');
      var bot = build(BR + UNF + 'p.sketch("Top").rect(1, ' + (-(ZB + 0.25)) + ', 1, 0.5).cut(' + d + ');\np.fold();\n');
      noErrors(top); noErrors(bot);
      near(b.mp.volume - top.mp.volume, (0.5 - BA) * d + rfDJSec(R, R + d), 1e-12, 'top pocket');
      near(b.mp.volume - bot.mp.volume, (0.5 - BA) * d + rfDJSec(R + T - d, R + T), 1e-12, 'bottom pocket');
      var tst = top.build.body.pointTester(), C = [1.5, R + T, R + T], h = Math.PI / 4;
      assert(!tst([1.5, C[1] - (R + 0.2 * T) * Math.cos(h), C[2] - (R + 0.2 * T) * Math.sin(h)]) && tst([1.5, C[1] - (R + 0.7 * T) * Math.cos(h), C[2] - (R + 0.7 * T) * Math.sin(h)]), 'top: air in the inner 0.4T of the bend, metal below');
      var fl0 = rfDJFlat(b);
      [['top', top], ['bottom', bot]].forEach(function (q) {
        var fl = rfDJFlat(q[1]);
        assert(fl.loops.length === 1, q[0] + ' pocket: no hole in the flat (was, from the top: the notches of the face pieces closed round the strip into a hole)');
        near(K.signedArea(fl.loops[0]), K.signedArea(fl0.loops[0]), 1e-9, q[0] + ': same blank');
      });
      return 'ok';
    });

    test('rfDJ: two Unfolds open (Unfold1 the front bend about the base, Unfold2 the back bend), a slot across each bend line, Fold the back bend, then the front (the opposite order): exact volume, both holes in the flat; one Fold with none picked folds both; open, the part lies flat (blank × T)', function () {
      var bd = rfDJUBends(), A = JSON.stringify(bd.A), B = JSON.stringify(bd.B), b = rfDJB(U);
      var two = U + 'p.unfold([1, ' + T + ', 2], [' + A + ']);\np.unfold(null, [' + B + ']);\n';
      var o = build(two);
      noErrors(o);
      var bb = o.build.body.getBounds(), fl0 = rfDJFlat(b);
      near(bb.max[1] - bb.min[1], T, 1e-9, 'both walls flat');
      nearRel(o.mp.volume, K.signedArea(fl0.loops[0]) * T, 1e-9, 'volume = blank × T');
      var ub = o.build.flanges[o.model.features[o.model.features.length - 1].id].filter(function (r) { return r.kind === 'unfold'; })[0];
      assert(ub && ub.bends.length === 2 && ub.bends.every(function (x) { return x.unfolded; }), 'Unfold2\'s record: both bends unfolded');
      var h = build(two + SLOT_A + SLOT_B + 'p.fold([' + B + ']);\n');
      noErrors(h);
      var hb = h.build.body.getBounds();
      near(hb.max[1], 1.5, 1e-9, 'Fold of the back bend: the back wall stands again'); near(hb.max[2], 4, 1e-9, 'back at z = 4'); assert(hb.min[2] < -1, 'the front wall still flat');
      var f = build(two + SLOT_A + SLOT_B + 'p.fold([' + B + ']);\np.fold([' + A + ']);\n');
      noErrors(f);
      near(f.mp.volume, b.mp.volume - 2 * SLOTV, 1e-12, 'both slots wrapped round their bends');
      var fl = rfDJFlat(f);
      assert(fl.loops.length === 3 && fl.loops[1].length === 4 && fl.loops[2].length === 4 && fl.bends.length === 2, 'flat: two 4-corner holes, two bends: ' + fl.loops.map(function (l) { return l.length; }));
      var g = build(two + SLOT_A + SLOT_B + 'p.fold();\n');
      noErrors(g); near(g.mp.volume, f.mp.volume, 1e-12, 'Fold with none picked folds every open bend');
      return 'ok';
    });

    test('rfDJ: a second Unfold picks on the part as shown: Unfold1 lays the front bend flat about the front wall (the base swings down, the back wall with it); the record offers the back bend where it now is (zone), sheetBendAt finds a click there; Unfold2 of that point and a fixed face picked on the moved base unfold it: flat in the front wall\'s plane', function () {
      var bd = rfDJUBends(), A = JSON.stringify(bd.A);
      var one = build(U + 'p.unfold([1, 0.8, 0], [' + A + ']);\n');
      noErrors(one);
      var rec = one.build.flanges[one.model.features[one.model.features.length - 1].id][0], folded = rec.bends.filter(function (x) { return !x.unfolded && x.zone; });
      assert(folded.length === 1, 'one bend left folded, with its zone');
      var z = folded[0].zone.fi, Cm = K._.add(K._.scale(K._.add(z.a, z.b), 0.5), K._.scale(z.u, z.R)), rm = z.R + T / 2, P = K._.add(Cm, K._.add(K._.scale(z.u, -rm * Math.cos(z.angle / 2)), K._.scale(z.o, rm * Math.sin(z.angle / 2))));
      assert(K.sheetBendAt(folded, P, T) === 0, 'the click on the moved bend finds it');
      var bb1 = one.build.body.getBounds();
      assert(bb1.min[1] < -3, 'the base swung down below the front wall: y ' + fmt(bb1.min[1]));
      // a point on the moved base's top face: the middle of the base, 2 in from the front bend
      var two = build(U + 'p.unfold([1, 0.8, 0], [' + A + ']);\np.unfold(null, [' + JSON.stringify(P) + ']);\n');
      noErrors(two);
      var bb = two.build.body.getBounds();
      near(bb.min[2], 0, 1e-9, 'flat in the front wall\'s plane: z ≥ 0'); near(bb.max[2], T, 1e-9, 'z ≤ T');
      nearRel(two.mp.volume, K.signedArea(rfDJFlat(rfDJB(U)).loops[0]) * T, 1e-9, 'blank × T');
      // the fixed face picked on the moved base (its inside face, now in the plane z = T, 2 in down): it stays where it is shown
      var fx = build(U + 'p.unfold([1, 0.8, 0], [' + A + ']);\np.unfold([3, -2, ' + T + '], [' + JSON.stringify(P) + ']);\n');
      noErrors(fx);
      var fb = fx.build.body.getBounds();
      near(fb.min[2], 0, 1e-9, 'fixed on the moved base: still z ≥ 0'); near(fb.max[2], T, 1e-9, 'z ≤ T');
      near(fb.min[1], bb.min[1], 1e-9, 'the same place as about the front wall'); near(fb.max[1], bb.max[1], 1e-9, 'y max');
      var ff = build(U + 'p.unfold([1, 0.8, 0], [' + A + ']);\np.unfold([3, -2, ' + T + '], [' + JSON.stringify(P) + ']);\np.fold([' + JSON.stringify(bd.B) + ']);\n');
      noErrors(ff);
      var fbb = ff.build.body.getBounds();
      near(fbb.min[2], 0, 1e-9, 'a Fold of the back bend keeps the base where it is'); assert(fbb.max[2] > 1.4, 'the back wall stands out of the plane again: z max ' + fmt(fbb.max[2]));
      return 'ok';
    });

    test('rfDJ: generateScript writes the two Unfolds and the Folds; the script and the JSON rebuild to the same volume; the Tab case round-trips too', function () {
      var bd = rfDJUBends(), A = JSON.stringify(bd.A), B = JSON.stringify(bd.B);
      [U + 'p.unfold([1, ' + T + ', 2], [' + A + ']);\np.unfold(null, [' + B + ']);\n' + SLOT_A + SLOT_B + 'p.fold([' + B + ']);\np.fold([' + A + ']);\n', BR + UNF + TAB + 'p.fold();\n'].forEach(function (code, i) {
        var r = build(code), s = K.generateScript(r.model), r2 = build(s);
        noErrors(r2); near(r2.mp.volume, r.mp.volume, 1e-12, 'case ' + i + ' script round trip');
        var b4 = K.rebuild(JSON.parse(JSON.stringify(r.model)));
        near(K.massProps(K.meshFromBody(b4.body)).volume, r.mp.volume, 1e-12, 'case ' + i + ' JSON round trip');
      });
      return 'ok';
    });

    test('rfDJ: errors: a boss on the inside of a bend thicker than the bend radius cannot fold (it would reach past the axis)', function () {
      var r = build(BR + UNF + 'p.sketch("Top", ' + T + ').rect(1, ' + (-(ZB + 0.25)) + ', 0.5, 0.5).extrude(' + (2 * T) + ');\np.fold();\n');
      assert(/past its centre/.test(rfDJErr(r)), 'error: ' + rfDJErr(r));
      return rfDJErr(r);
    });
  })();
