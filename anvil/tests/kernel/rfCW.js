  // --- rfCW (2026-10-20, lane CW: flat-pattern correctness) --- a hole cut from the top face that bites into an up-bend
  // below the top notches the bend strip (bendSurfaceNotches reads both bend surfaces, each unrolled by angle), and a
  // hole that reaches a bend line from the base or the wall is drawn exactly (the bend strip no longer overlaps its
  // neighbours by 1e-3 in the output).
  (function () {
    group('rfCW: holes biting into a bend, holes reaching a bend line');
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function box(l) { var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity]; l.forEach(function (p) { for (var k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } }); return { lo: lo, hi: hi }; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    // the length of the line u = x inside a polygon
    function chordAt(poly, x) {
      var ys = [], s = 0, i;
      for (i = 0; i < poly.length; i++) { var p = poly[i], q = poly[(i + 1) % poly.length]; if ((p[0] <= x) !== (q[0] <= x)) ys.push(p[1] + (x - p[0]) * (q[1] - p[1]) / (q[0] - p[0])); }
      ys.sort(function (a, b) { return a - b; });
      for (i = 0; i + 1 < ys.length; i += 2) s += ys[i + 1] - ys[i];
      return s;
    }
    // area of a polygon left of u = xmax (Sutherland–Hodgman against one half-plane)
    function clipArea(poly, xmax) {
      var out = [];
      poly.forEach(function (p, i) { var q = poly[(i + 1) % poly.length], pin = p[0] < xmax, qin = q[0] < xmax; if (pin) out.push(p); if (pin !== qin) out.push([xmax, p[1] + (xmax - p[0]) / (q[0] - p[0]) * (q[1] - p[1])]); });
      return Math.abs(K.signedArea(out));
    }
    // Anvil's bend surface of radius Ro is flangeProfile's polygon: segs facets between exact angles; the facet's
    // distance from the bend axis at polar angle th
    function facetR(Ro, A, th) { var segs = Math.max(4, Math.round(8 * A / (Math.PI / 2))), D = A / segs, k = Math.min(segs - 1, Math.floor(th / D)); return Ro * Math.cos(D / 2) / Math.cos(th - (k + 0.5) * D); }
    var T = 0.0598, R = 0.0598, A = Math.PI / 2, BA = A * (R + 0.5 * T);
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, ';
    var HOLE = 'p.sketch("Top", ' + T + ').circle(4.1, -1.5, 0.1875).cut("through", { reverse: true });';
    test('rfCW: 16 ga L-bracket, Cut-Extrude Ø0.375 through from the top face centred 0.10 past the bend tangent, so it eats into the bend below the top (the bend\'s outside surface; the inside surface is whole): the flat shows one closed hole crossing the bend line continuously, as deep into the strip as the outside surface is cut (θ to 60°, s = BA·θ/A), area = the developed hole area (base part + the outside surface\'s gap unrolled by angle) within 1e-4 in² (was: the strip stayed whole, the hole stopped at the bend line)', function () {
      var plate = flatOf(HEAD + '4.5, 3).end().baseFlange();\n' + HOLE), L = flatOf(HEAD + '4, 3).end().baseFlange();\np.flange(1.5, [[4, ' + T + ', 1.5]]);\n' + HOLE);
      assert(plate.flat.loops.length === 2, 'plate: outline + the hole');
      var poly = plate.flat.loops[1], xt = 4;   // the hole's polygon in the base frame; the bend tangent is x = 4
      assert(L.flat.loops.length === 2, 'L-bracket: outline + ONE hole, got ' + L.flat.loops.length + ' loops');
      assert(L.flat.loops[0].length === 4, 'the outline is the plain blank rectangle, got ' + L.flat.loops[0].length + ' corners');
      var h = L.flat.loops[1], b = box(h);
      near(b.lo[0], 4.1 - 0.1875, 1e-9, 'hole starts on the base where the circle does');
      assert(b.hi[0] > xt + 0.5 * BA, 'the hole reaches into the strip: ends ' + fmt(b.hi[0] - xt) + ' past the bend line (BA ' + fmt(BA) + ')');
      // continuity at the bend line: exactly two outline points on x = 4, the chord ends of the base part's circle
      var onLine = h.filter(function (p) { return Math.abs(p[0] - xt) < 1e-6; });
      assert(onLine.length === 2, 'two points on the bend line (no step, no sliver), got ' + onLine.length);
      near(Math.abs(onLine[0][1] - onLine[1][1]), chordAt(poly, xt - 1e-12), 1e-9, 'the hole crosses the bend line on the circle\'s chord');
      h.forEach(function (p, i) { var q = h[(i + 1) % h.length]; assert(Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-6, 'no sliver point at ' + fmt(p[0]) + ', ' + fmt(p[1])); });
      // the outside surface (radius R + T, centre T + R above the bottom) is cut where it lies below the top face
      // (y < T) and inside the circle; its gap unrolled by angle: s = BA·θ/A, τ along the edge
      var N = 20000, bend = 0, sMax = 0;
      for (var i = 0; i < N; i++) {
        var th = (i + 0.5) * A / N, r = facetR(R + T, A, th), x = xt + r * Math.sin(th), y = T + R - r * Math.cos(th);
        if (y < T) { var c = chordAt(poly, x); bend += c * BA / N; if (c > 0) sMax = BA * th / A; }
      }
      var want = clipArea(poly, xt) + bend;
      near(Math.abs(K.signedArea(h)), want, 1e-4, 'hole area = the developed hole area');
      near(b.hi[0] - xt, sMax, 2e-3 * BA, 'the hole ends where the outside surface\'s cut ends (≈ 60° of the 90° bend)');
      var L0 = flatOf(HEAD + '4, 3).end().baseFlange();\np.flange(1.5, [[4, ' + T + ', 1.5]]);\n');
      near(L.flat.size[0], L0.flat.size[0], 1e-9, 'flat width unchanged'); near(L.flat.size[1], 3, 1e-9, 'flat height 3');
      near(blankArea(L.flat), blankArea(L0.flat) - want, 1e-4, 'blank area = uncut − the developed hole');
      return 'hole area ' + fmt(Math.abs(K.signedArea(h))) + ' (developed ' + fmt(want) + '), reaches ' + fmt(b.hi[0] - xt) + ' into the strip';
    });
    test('rfCW: the same hole on the plain plate and on the L-bracket with the flange folded away from the top (the cut then crosses the bend\'s tracked surface) still gives one hole; a hole clear of the bend leaves the strip whole (4-corner outline, the hole a circle)', function () {
      var down = flatOf(HEAD + '4, 3).end().baseFlange();\np.flange(1.5, [[4, ' + T + ', 1.5]], { reverse: true });\n' + 'p.sketch("Top", ' + T + ').circle(4.1, -1.5, 0.1875).cut(' + (2 * T) + ', { reverse: true });');
      assert(down.flat.loops.length === 2, 'down flange: outline + one hole, got ' + down.flat.loops.length);
      assert(box(down.flat.loops[1]).hi[0] > 4 + 1e-3, 'down flange: the hole reaches into the strip');
      var clear = flatOf(HEAD + '4, 3).end().baseFlange();\np.flange(1.5, [[4, ' + T + ', 1.5]]);\np.sketch("Top", ' + T + ').circle(3.5, -1.5, 0.1875).cut("through", { reverse: true });');
      assert(clear.flat.loops.length === 2 && clear.flat.loops[0].length === 4, 'clear hole: plain outline + the hole');
      near(box(clear.flat.loops[1]).hi[0] - box(clear.flat.loops[1]).lo[0], 0.375, 1e-6, 'clear hole Ø0.375');
      return 'ok';
    });
    test('rfCW: 16 ga L-bracket (Material Inside), Normal Cut of a Ø.25 hole centred on the bend\'s tangent line from the top face: the flat has ONE hole from r into the base across the whole strip (BA), area within 1.5 % of πr²/2 + (BA/A)·∫ 2√(r² − R² sin²θ) dθ (the footprint on the inside surface unrolled); the same flat on 14 and 11 ga (was on 16 ga: the strip kept its metal, three loops: the half disk and two slivers, or before that the half disk alone)', function () {
      var out = [];
      [['16', 0.0598], ['14', 0.0747], ['11', 0.1196]].forEach(function (g) {
        var t = g[1], rr = t, r = 0.125, tg = 4 - rr - t, ba = A * (rr + 0.5 * t);
        var nc = flatOf('p.units("in");\np.sheet(' + t + ', ' + rr + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1.5, [[4, ' + t + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
          'p.sketch("Top", ' + t + ').circle(' + tg + ', -1.5, ' + r + ').cut("through", { reverse: true, normalCut: true });');
        assert(nc.flat.loops.length === 2, g[0] + ' ga: outline + one hole, got ' + nc.flat.loops.length + ' loops');
        var b = box(nc.flat.loops[1]);
        near(b.lo[0], tg - r, 1e-9, g[0] + ' ga: hole starts r before the bend line');
        near(b.hi[0], tg + ba, 1e-6, g[0] + ' ga: hole runs the whole strip (to the wall)');
        var s = 0, N = 4000;
        for (var i = 0; i < N; i++) { var th = (i + 0.5) * A / N; s += 2 * Math.sqrt(r * r - rr * rr * Math.sin(th) * Math.sin(th)) * ba / N; }
        nearRel(Math.abs(K.signedArea(nc.flat.loops[1])), Math.PI * r * r / 2 + s, 1.5e-2, g[0] + ' ga: hole area');
        // CW2: smooth, no stair: only the two corners where the hole meets the wall's inside face turn more than 20°
        // (was ~90 points: the far surface's hole stepped at every facet and the union drew the steps), and the half
        // disk in the base is one true ARC for the laser
        // rfFE2: the footprint across the strip is sampled at the bend's facets, so its turn between samples grows with
        // their angle: the limit is twice the bend's chord angle, at least 20° (11 ga at the 12° angular limit: 20.4°)
        var kink = Math.max(20, 2 * 360 / K.segsForRadius(rr + t)) * Math.PI / 180;
        var hl = nc.flat.loops[1], sharp = hl.filter(function (p, i) {
          var a = hl[(i + hl.length - 1) % hl.length], c = hl[(i + 1) % hl.length], d1 = [p[0] - a[0], p[1] - a[1]], d2 = [c[0] - p[0], c[1] - p[1]];
          return Math.abs(Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1])) > kink;
        });
        assert(sharp.length === 2, g[0] + ' ga: 2 sharp corners (at the wall), got ' + sharp.length + ' of ' + hl.length + ' points');
        sharp.forEach(function (p) { near(p[0], tg + ba, 1e-6, g[0] + ' ga: sharp corner on the wall line'); });
        var cv = K.dxfLoopCurves(hl), arcs = cv && cv.segs ? cv.segs.filter(function (q) { return q.t === 'arc'; }) : [];
        assert(arcs.length === 1, g[0] + ' ga: the base half disk is one ARC, got ' + arcs.length);
        var dx = K.exportDXFFlat(nc.flat, 'in', { version: 'R2000', style: 'entities' }).split('ENTITIES')[1] || '';
        assert((dx.match(/\n0\nARC\n(?:(?!\n0\n)[\s\S])*?\n8\nHOLES\n/g) || []).length === 1, g[0] + ' ga: one ARC on HOLES in the DXF');
        out.push(g[0] + ' ga ' + fmt(Math.abs(K.signedArea(nc.flat.loops[1]))));
      });
      return out.join(', ');
    });
    test('rfCW: a hole that reaches a bend line is exact: a 120 × 10 window cut across a 2 mm channel bottom from bend line to bend line is 120.000 × 10 in the flat (was 119.998: the strips overlapped the base by 1e-3), the blank loses exactly 1200; a 10 × 5 window through both walls starting on the walls\' start lines is 5 deep in the flat, starting exactly BA past each bend line', function () {
      var T2 = 2, R2 = 2, BA90 = Math.PI / 2 * (R2 + 0.5 * T2);
      var CH = 'p.units("mm");\np.sheet(2, 2, 0.5);\np.sketch("Top").rect(0, -60, 120, 60).end().baseFlange();\np.flange(40, [[0, 2, 30]]);\np.flange(40, [[120, 2, 30]]);\n';
      var c0 = flatOf(CH), c1 = flatOf(CH + 'p.sketch("Top", 2).rect(0, -35, 120, 10).cut("through", { reverse: true });');
      assert(c1.flat.loops.length === 2 && c1.flat.loops[0].length === 4, 'outline + the window');
      var w = box(c1.flat.loops[1]), x0 = box(c0.flat.loops[0]).lo[0];
      near(w.hi[0] - w.lo[0], 120, 1e-9, 'window exactly 120 wide'); near(w.hi[1] - w.lo[1], 10, 1e-9, 'window 10 tall');
      near(w.lo[0] - x0, 40 + BA90, 1e-9, 'window starts on the bend line');
      near(blankArea(c1.flat), blankArea(c0.flat) - 1200, 1e-6, 'blank area = uncut − 1200');
      var c2 = flatOf(CH + 'p.sketch("Right", -10).rect(-35, ' + (T2 + R2) + ', 10, 5).cut("through");');
      assert(c2.flat.loops.length === 3, 'outline + two wall windows, got ' + c2.flat.loops.length);
      var lo = c2.flat.loops.slice(1).map(box).sort(function (a, b) { return a.lo[0] - b.lo[0]; });
      lo.forEach(function (bx) { near(bx.hi[0] - bx.lo[0], 5, 1e-9, 'wall window 5 deep'); near(bx.hi[1] - bx.lo[1], 10, 1e-9, 'wall window 10 long'); });
      near(lo[0].hi[0] - x0, 40, 1e-9, 'left wall window ends exactly on the strip\'s far edge (wall start line)');
      near(lo[1].lo[0] - x0, 40 + BA90 + 120 + BA90, 1e-9, 'right wall window starts exactly BA past the bend line');
      return 'window ' + fmt(w.hi[0] - w.lo[0]) + ' × ' + fmt(w.hi[1] - w.lo[1]);
    });
  })();
