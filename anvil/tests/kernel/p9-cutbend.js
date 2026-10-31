  // --- p9-cutbend: a hole, slot or notch cut in the flat before an Edge Flange or a Sketched Bend that crosses the bend
  // zone stays cut (SolidWorks): the bend rolls up the flat as it is, so the cut wraps round the bend (radial through the
  // thickness, flat length s at angle A·s/BA) and the flat pattern shows it once, in its original place. Before, the
  // bend's sweep filled it in: a Ø.2 hole on a Material Inside bend line unfolded as a .04-wide D, a hole across a
  // sketched bend line as two D's ---
  (function () {
    group('p9-cutbend: cuts across a bend zone stay cut (Edge Flange, Sketched Bend), the flat shows them in place');
    var T = 0.06, R = 0.06, A90 = Math.PI / 2, BA = K.bendAllowance(A90, R, T, 0.5);
    var PLATE = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    // Anvil's bend has 8 facets per 90°: flat area dA rolled into a facet of angle δ keeps T·dA·sin δ / δ of metal
    var DTH = A90 / 8, ROLL = Math.sin(DTH) / DTH;   // (the faceted solid: polyVol; mp.volume integrates the bend out to its true cylinders, lane FX)
    function cutSq(cx, cz, h) { return 'p.sketch("Top", 0.06).rect(' + (cx - h) + ', ' + (-cz - h) + ', ' + 2 * h + ', ' + 2 * h + ').cut("through", { reverse: true });\n'; }
    function flatOf(code) { var r = build(code); noErrors(r); return { r: r, flat: K.flatPattern(r.model, r.build, r.mesh) }; }
    function box2(l) { var b = [Infinity, Infinity, -Infinity, -Infinity]; l.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); return b; }
    function area2(l) { var a = 0; l.forEach(function (p, i) { var q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a / 2); }
    function nearBox(l, want, label) { box2(l).forEach(function (v, i) { near(v, want[i], 1e-9, label + ' [' + i + ']'); }); }
    // a point at mid-thickness in a 90° up bend that starts at x = x0 on the top face (y = T), s of flat into the bend
    function inBend(x0, s, z) { var th = A90 * s / BA, rho = R + T / 2; return [x0 + rho * Math.sin(th), T + R - rho * Math.cos(th), z]; }
    var FL_IN = 'p.flange(1, [[4, 0.06, 1.5]], { position: "inside" });';
    test('p9-cutbend: Edge Flange, Material Inside: a .2 square / Ø.2 hole centred on the bend line wraps round the bend and unfolds in place', function () {
      var plain = flatOf(PLATE + FL_IN), sq = flatOf(PLATE + cutSq(3.88, 1.5, 0.1) + FL_IN);
      // the trim line (bend start) is x = 4 − (R + T) = 3.88: half the square stays in the base, half rolls into the bend
      near(polyVol(sq.r.mp), polyVol(plain.r.mp) - T * 0.02 - T * 0.02 * ROLL, 1e-9, 'volume = flanged plate − base half − rolled half');
      near(sq.flat.size[0], plain.flat.size[0], 1e-9, 'flat length unchanged'); near(sq.flat.size[1], plain.flat.size[1], 1e-9, 'flat width unchanged');
      assert(sq.flat.loops.length === 2, sq.flat.loops.length + ' loops (outline + the hole)');
      nearBox(sq.flat.loops[1], [3.78, -1.6, 3.98, -1.4], 'the square in the flat, where it was cut');
      near(area2(sq.flat.loops[1]), 0.04, 1e-9, 'square area');
      var body = sq.r.body;
      assert(!body.containsPoint(inBend(3.88, 0.05, 1.5)) && !body.containsPoint(inBend(3.88, 0.095, 1.45)), 'no metal in the bend inside the square');
      assert(body.containsPoint(inBend(3.88, 0.05, 1.75)) && body.containsPoint(inBend(3.88, 0.12, 1.5)), 'metal in the bend beside and past it');
      assert(!body.containsPoint([3.83, T / 2, 1.5]), 'no metal in the base half');
      // a round hole: the flat's hole loop is the plate's own hole loop, point for point in place
      var hole = 'p.sketch("Top", 0.06).circle(3.88, -1.5, 0.1).cut("through", { reverse: true });\n';
      var rh = flatOf(PLATE + hole + FL_IN), ph = flatOf(PLATE + hole + 'p.flange(1, [[2, 0.06, 0]]);');
      var hl = rh.flat.loops[1], pl = ph.flat.loops[1];
      assert(rh.flat.loops.length === 2 && hl.length === pl.length, 'hole loop of ' + (hl && hl.length) + ' points (plate: ' + pl.length + ')');
      box2(hl).forEach(function (v, i) { near(v, box2(pl)[i], 1e-9, 'round hole bbox [' + i + ']'); });
      near(area2(hl), area2(pl), 1e-9, 'round hole area');
      return 'square: ' + fmt(sq.r.mp.volume) + ' in³, round hole loop ' + hl.length + ' points, ' + box2(hl).map(fmt).join(', ');
    });
    test('p9-cutbend: Edge Flange, Bend Outside / Material Outside / hem / jog: a hole in the overlap strip or across the bend is not filled', function () {
      // Bend Outside: the sweep laid a T-wide overlap strip into the sheet, filling the edge side of a hole within T of the edge
      var cases = [
        ['Bend Outside', 'p.flange(1, [[4, 0.06, 1.5]]);', cutSq(3.95, 1.5, 0.03), T * 0.0036, [3.92, -1.53, 3.98, -1.47]],
        // Material Outside: the bend starts R = .06 in, at x = 3.94; the square x ∈ [3.87, 3.97] reaches .03 into it
        ['Material Outside', 'p.flange(1, [[4, 0.06, 1.5]], { position: "outside" });', cutSq(3.92, 1.5, 0.05), T * 0.007 + T * 0.003 * ROLL, [3.87, -1.55, 3.97, -1.45]],
        ['hem', 'p.hem(0.3, [[4, 0.06, 1.5]]);', cutSq(3.95, 1.5, 0.03), T * 0.0036, [3.92, -1.53, 3.98, -1.47]],
        ['jog', 'p.jog(0.5, 1, [[4, 0.06, 1.5]]);', cutSq(3.95, 1.5, 0.03), T * 0.0036, [3.92, -1.53, 3.98, -1.47]]];
      cases.forEach(function (c) {
        var plain = flatOf(PLATE + c[1]), cut = flatOf(PLATE + c[2] + c[1]);
        near(polyVol(cut.r.mp), polyVol(plain.r.mp) - c[3], 1e-9, c[0] + ': volume');
        assert(cut.flat.loops.length === 2, c[0] + ': ' + cut.flat.loops.length + ' loops');
        nearBox(cut.flat.loops[1], c[4], c[0] + ': hole in the flat');
        near(cut.flat.size[0], plain.flat.size[0], 1e-9, c[0] + ': flat length');
      });
      return cases.length + ' placements';
    });
    test('p9-cutbend: a notch at the edge across the bend: flanges on both edge pieces leave it open through bend and wall', function () {
      // notch x ∈ [3.8, 4], z ∈ [1.3, 1.7]: the x = 4 edge is two edges, 1.3 long each; a flange on both
      var NOTCH = 'p.sketch("Top", 0.06).rect(3.8, -1.7, 0.3, 0.4).cut("through", { reverse: true });\n';
      var plain = flatOf(PLATE + 'p.flange(1, [[4, 0.06, 1.5]]);'), two = flatOf(PLATE + NOTCH + 'p.flange(1, [[4, 0.06, 0.5], [4, 0.06, 2.5]]);');
      var one = flatOf(PLATE + NOTCH + 'p.flange(1, [[4, 0.06, 0.5]]);');
      var perLen = (plain.r.mp.volume - 0.72) / 3;   // one flange's metal per unit of edge
      near(two.r.mp.volume, 0.72 - T * 0.08 + 2.6 * perLen, 1e-9, 'two flanges: plate − notch + 2 × 1.3 of flange');
      near(one.r.mp.volume, 0.72 - T * 0.08 + 1.3 * perLen, 1e-9, 'one flange: plate − notch + 1.3 of flange');
      assert(two.flat.loops.length === 1 && two.flat.bends.length === 2, 'one blank, two bends');
      near(area2(two.flat.loops[0]), 12 - 0.08 + 2.6 * (BA + 1), 1e-9, 'blank: the notch runs on through strip and wall');
      near(area2(one.flat.loops[0]), 12 - 0.08 + 1.3 * (BA + 1), 1e-9, 'blank with one flange');
      return 'notched blank ' + fmt(area2(two.flat.loops[0])) + ' in²';
    });
    var SB = function (pos) { return 'p.sketch("Top", 0.06).line(2, 0, 2, -3).sketchedBend(90, { fixed: [1, 0, 1]' + (pos ? ', position: "' + pos + '"' : '') + ' });'; };
    test('p9-cutbend: Sketched Bend across a .4 square hole, a slot and a side notch: wrapped round the bend, the flat is the plate as cut', function () {
      var plain = flatOf(PLATE + SB());
      near(polyVol(plain.r.mp), 0.72 - T * 3 * BA * (1 - ROLL), 1e-9, 'plain bend');
      ['centerline', 'inside'].forEach(function (pos) {
        var sq = flatOf(PLATE + cutSq(2, 1.5, 0.2) + SB(pos === 'centerline' ? null : pos));
        // the square x ∈ [1.8, 2.2] covers the whole strip (BA = .1414 wide) for z ∈ [1.3, 1.7]
        near(polyVol(sq.r.mp), polyVol(plain.r.mp) - T * (0.16 - 0.4 * BA) - T * 0.4 * BA * ROLL, 1e-9, pos + ': volume');
        assert(sq.flat.loops.length === 2, pos + ': ' + sq.flat.loops.length + ' loops (the square was two D-shaped halves)');
        nearBox(sq.flat.loops[0], [0, -3, 4, 0], pos + ': the blank is the plate');
        nearBox(sq.flat.loops[1], [1.8, -1.7, 2.2, -1.3], pos + ': the square in place');
        near(area2(sq.flat.loops[1]), 0.16, 1e-9, pos + ': square area');
      });
      var sq = flatOf(PLATE + cutSq(2, 1.5, 0.2) + SB()), x0 = 2 - BA / 2;
      assert(!sq.r.body.containsPoint(inBend(x0, BA / 2, 1.5)) && sq.r.body.containsPoint(inBend(x0, BA / 2, 1.0)), 'no metal in the bend inside the square, metal beside it');
      var slot = flatOf(PLATE + 'p.sketch("Top", 0.06).slot(1.5, -1.5, 2.5, -1.5, 0.25).cut("through", { reverse: true });\n' + SB());
      assert(slot.flat.loops.length === 2, 'slot: ' + slot.flat.loops.length + ' loops');
      nearBox(slot.flat.loops[1], [1.375, -1.625, 2.625, -1.375], 'slot in place');
      var notch = flatOf(PLATE + 'p.sketch("Top", 0.06).rect(1.8, -0.3, 0.4, 0.3).cut("through", { reverse: true });\n' + SB());
      near(polyVol(notch.r.mp), polyVol(plain.r.mp) - T * (0.12 - 0.3 * BA) - T * 0.3 * BA * ROLL, 1e-9, 'side notch: volume');
      assert(notch.flat.loops.length === 1, 'side notch: one outline');
      near(area2(notch.flat.loops[0]), 12 - 0.12, 1e-9, 'side notch: the blank is the notched plate');
      return 'square ' + fmt(sq.r.mp.volume) + ' in³; slot ' + box2(slot.flat.loops[1]).map(fmt).join(', ');
    });
    test('p9-cutbend: a Sketched Bend line slanted across the plate: the bend follows the plate\'s edges, the flat is the plate', function () {
      // line (1.5, 0) → (2.5, 3): the strip is a parallelogram BA × √10; before, its square-ended sweep stuck out past both edges
      var r = flatOf(PLATE + 'p.sketch("Top", 0.06).line(1.5, 0, 2.5, -3).sketchedBend(90, { fixed: [0.5, 0, 1] });');
      nearRel(polyVol(r.r.mp), 0.72 - T * BA * Math.sqrt(10) * (1 - ROLL), 1e-7, 'volume = plate − strip + bend');
      assert(r.flat.loops.length === 1 && r.flat.loops[0].length === 4, 'blank: ' + r.flat.loops.map(function (l) { return l.length; }).join(', ') + ' points');
      nearBox(r.flat.loops[0], [0, -3, 4, 0], 'the blank is the 4 × 3 plate');
      return 'blank ' + r.flat.size.map(fmt).join(' × ');
    });
    test('p9-cutbend: no cut across the bend: no voids, no flat cutouts, a hole away from the bend is just a hole', function () {
      var far = flatOf(PLATE + cutSq(2, 1.5, 0.1) + FL_IN), plain = flatOf(PLATE + FL_IN);
      near(far.r.mp.volume, plain.r.mp.volume - T * 0.04, 1e-12, 'flange: volume');
      var recs = far.r.build.flanges[far.r.model.features[far.r.model.features.length - 1].id];
      assert(recs.every(function (fi) { return !fi.cutouts; }), 'no flange record carries cutouts');
      var sb = flatOf(PLATE + cutSq(1, 1.5, 0.1) + SB()), sbp = flatOf(PLATE + SB());
      near(sb.r.mp.volume, sbp.r.mp.volume - T * 0.04, 1e-12, 'sketched bend: volume');
      assert(sb.r.build.flanges[sb.r.model.features[sb.r.model.features.length - 1].id].every(function (fi) { return !fi.cutouts; }), 'no sketched bend record carries cutouts');
      return 'ok';
    });
  })();
  // --- end p9-cutbend ---

