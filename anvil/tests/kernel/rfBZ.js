  // --- rfBZ (2026-10-13, lane BZ: sheet-metal leftovers of the shop-style user test) --- the Material Inside trim no
  // longer nicks the neighbouring bend, a Normal Cut from the top face goes through the bend it straddles, and hems
  // whose returns would cross at a corner are refused. 16 ga steel, T = R = 0.0598, K = 0.5.
  (function () {
    group('rfBZ: corner trim, Normal Cut across a bend from the top face, crossing hems');
    var T = 0.0598, R = 0.0598, BA90 = Math.PI / 2 * (R + 0.5 * T);
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
    var FLANGE_Z4 = 'p.flange(1.0, [[3, ' + T + ', 4]], { position: "inside", lengthRef: "outer" });\n';
    test('rfBZ: a second Material Inside flange on the neighbouring edge trims the base exactly to the first flange\'s bend: the solid grows by (section − (R + T)·T) × its edge, to 1e-9, and the first bend keeps its metal at the corner (was: a 0.01 slice of it cut away by the trim\'s overshoot)', function () {
      var one = build(HEAD + FLANGE_Z4), two = build(HEAD + FLANGE_Z4 + 'p.flange(1.0, [[6, ' + T + ', 2]], { position: "inside", lengthRef: "outer" });');
      noErrors(one); noErrors(two);
      var sec = Math.abs(K.signedArea(K.flangeProfile(Math.PI / 2, R, T, 1.0 - (R + T), 0))), lenA = 4 - (R + T);
      nearRel(two.mp.volume, one.mp.volume + (sec - (R + T) * T) * lenA, 1e-9, 'volume with the second flange');
      var inside = two.body.pointTester(), z = 4 - (R + T) + 0.005, miss = [];
      for (var x = 5.885; x < 5.995; x += 0.01) if (!inside([x, T / 2, z])) miss.push(fmt(x));
      assert(!miss.length, 'the first bend has metal at mid-thickness 0.005 past its start: missing at x = ' + miss.join(', '));
      var flat = K.flatPattern(two.model, two.build, two.mesh);
      assert(flat.loops.length === 1 && flat.loops[0].length === 6, 'one 6-corner loop: ' + flat.loops.map(function (l) { return l.length; }).join());
      return 'volume ' + fmt(two.mp.volume);
    });
    test('rfBZ: a Ø.375 hole straddling the bend line, sketched on the top face and cut through with Normal Cut, goes through the whole bend normal to the sheet: no metal on its centre line at any bend angle, metal beside it; the flat has one hole loop from the base across the bend strip to the wall (was: the bend kept its metal above the sketch plane, half a hole)', function () {
      var z0 = 4 - (R + T), r = 0.1875;
      var base = build(HEAD + 'p.flange(1.5, [[3, ' + T + ', 4]], { position: "inside", lengthRef: "outer" });\n');
      var h = build(HEAD + 'p.flange(1.5, [[3, ' + T + ', 4]], { position: "inside", lengthRef: "outer" });\np.sketch("Top", ' + T + ').circle(3, ' + (-z0) + ', ' + r + ').cut("through", { reverse: true, normalCut: true });');
      noErrors(h);
      var inside = h.body.pointTester(), rm = R + T / 2, bad = [];
      [2, 15, 30, 45, 60, 75, 85, 89].forEach(function (deg) {
        var th = deg * Math.PI / 180, y = T + R - rm * Math.cos(th), z = z0 + rm * Math.sin(th);
        if (inside([3, y, z]) || inside([2.9, y, z]) || inside([3.1, y, z])) bad.push(deg + '° air');
        if (!inside([2.7, y, z]) || !inside([3.3, y, z])) bad.push(deg + '° metal');
      });
      assert(!bad.length, 'bend at mid-thickness: ' + bad.join(', '));
      var flat = K.flatPattern(h.model, h.build, h.mesh);
      assert(flat.loops.length === 2, 'outline + one hole, got ' + flat.loops.length);
      var lo = Infinity, hi = -Infinity, xs = [Infinity, -Infinity];
      flat.loops[1].forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); xs[0] = Math.min(xs[0], p[0]); xs[1] = Math.max(xs[1], p[0]); });
      near(hi - lo, r + BA90, 3e-3, 'the hole runs r into the base and the whole bend allowance across the strip');
      near(xs[1] - xs[0], 2 * r, 2e-3, 'Ø.375 wide at the bend line');
      var removed = base.mp.volume - h.mp.volume, holeA = Math.abs(K.signedArea(flat.loops[1]));
      nearRel(holeA * T, removed, 2e-2, 'hole area × T ≈ the metal removed (K = 0.5; 8-facet bends)');
      var dxf = K.exportDXFFlat(flat, 'in', { style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
      assert(c.ok && c.loops.filter(function (l) { return l.layer === 'HOLES'; }).length === 1, 'DXF: one closed HOLES loop: ' + c.errors.join('; '));
      return 'removed ' + fmt(removed) + ', hole ' + fmt(hi - lo) + ' × ' + fmt(xs[1] - xs[0]);
    });
    test('rfBZ: hems whose returns would cross at a corner (a closed hem, then a tear drop on the neighbouring edge; or both edges in one Hem) are refused with "The hems on edges … would cross: shorten one or add a relief." and the part keeps the first hem; hems on opposite edges, or folded to opposite sides at a corner, still build (was: a self-intersecting body and a wrong flat)', function () {
      var HEM1 = 'p.hem(0.5, [[3, ' + T + ', 4]], { hemType: "closed", hemPosition: "inside" });\n';
      var one = build(HEAD + HEM1);
      noErrors(one);
      var x = build(HEAD + HEM1 + 'p.hem(0.5, [[6, ' + T + ', 2]], { hemType: "teardrop", hemPosition: "inside" });');
      var msg = Object.keys(x.errors).map(function (k) { return x.errors[k]; }).join(' | ');
      assert(msg === 'The hems on edges (6, 0.0598, 2) and (3, 0.0598, 4) would cross: shorten one or add a relief.', 'error: ' + msg);
      nearRel(x.mp.volume, one.mp.volume, 1e-12, 'the refused hem adds nothing');
      var same = build(HEAD + 'p.hem(0.5, [[3, ' + T + ', 4], [6, ' + T + ', 2]], { hemType: "closed", hemPosition: "inside" });');
      var m2 = Object.keys(same.errors).map(function (k) { return same.errors[k]; }).join(' | ');
      assert(/^The hems on edges \(3, 0\.0598, 4\) and \(6, 0\.0598, 2\) would cross: shorten one or add a relief\.$/.test(m2), 'one Hem on two edges at a corner: ' + m2);
      noErrors(build(HEAD + HEM1 + 'p.hem(0.5, [[3, ' + T + ', 0]], { hemType: "teardrop", hemPosition: "inside" });'));
      noErrors(build(HEAD + HEM1 + 'p.hem(0.5, [[6, 0, 2]], { hemType: "closed", hemPosition: "inside" });'));
      return msg;
    });
  })();
