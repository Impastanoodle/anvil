  // --- rfOK (2026-11-18, lane shopflow7, test-reports/2026-11-18-shop-flow-7.md) --- the shop audit, round 7: the blanks of
  // its jobs against the closed form BD = 2 (R + T) tan(A/2) - (pi A / 180) (R + K T), and the per-configuration
  // dimension of the Modify box (Kernel.configureDimension). (1) A hat channel from one open profile (five lines, the
  // thickness reversed), 14 ga T .0747 R .0747, Bend Deduction .135 typed: two bends have the sketch line on their outside
  // face, two on their inside, so the blank is the sum of the flats (each line less R + T at an outside corner, R at an
  // inside one) plus 4 BA = 2 (R + T) - BD. (2) A Z from one sketch with a 135 and a 30 degree bend, T .0747 R .09 K .44.
  // (3) A gauge-table row with the shop's bend deduction. (4) A 10 x 6 tray, four Material Inside flanges 1.5.
  // (5) An L bracket in three configurations, the flange length set in one configuration only.
  (function () {
    var T14 = 0.0747, R14 = 0.0747, R09 = 0.09, K44 = 0.44;
    function rfOKBD(R, T, K, deg) { var A = deg * Math.PI / 180; return 2 * (R + T) * Math.tan(A / 2) - A * (R + K * T); }
    function rfOKflat(code) { var r = build(code); r.flat = Object.keys(r.errors).length ? null : K.flatPattern(r.model, r.build, r.mesh); return r; }
    var HAT = 'p.units("in");\np.sheet(0.0747, 0.0747, 0.5, { bendAllowanceType: "deduction", bendDeduction: 0.135 });\n' +
      'p.sketch("Front").polyline([[0, 0], [1, 0], [1, 2], [4, 2], [4, 0], [5, 0]], false).end().baseFlange(null, { depth: 10, flip: true });\n';

    test('rfOK: hat channel from one open profile (1 + 2 + 3 + 2 + 1, thickness reversed), 14 ga, Bend Deduction .135 typed: blank 9 - 4 (R + T) - 2 R... = 8.7588 x 10, 4 bends of BA 2 (R + T) - .135', function () {
      var r = rfOKflat(HAT);
      noErrors(r);
      var flats = 9 - 2 * (R14 + T14) - 2 * (R14 + T14 + R14) - 2 * R14, BA = 2 * (R14 + T14) - 0.135;
      var Lb = Math.abs(r.flat.size[0] - 10) < 1e-9 ? r.flat.size[1] : r.flat.size[0];
      near(Lb, flats + 4 * BA, 1e-6, 'blank length');
      // the outside dimensions less 4 BD, as the shop reads it: the end flanges 1 (the line is their outside face), the
      // walls 2 + T, the top 3 + 2 T: 9 + 4 T
      near(Lb, 9 + 4 * T14 - 4 * 0.135, 1e-6, 'outside dimensions - 4 BD');
      near(Math.min(r.flat.size[0], r.flat.size[1]) === Lb ? Math.max(r.flat.size[0], r.flat.size[1]) : Math.min(r.flat.size[0], r.flat.size[1]), 10, 1e-9, 'blank width');
      assert(r.flat.bends.length === 4, '4 bends');
      r.flat.bends.forEach(function (b) { near(b.ba, BA, 1e-9, 'BA'); near(b.bd, 0.135, 1e-9, 'BD'); });
    });

    test('rfOK: Z from one sketch, a 135 degree and a 30 degree bend (3 at 0, 2 at 135, 1.5 at 105 degrees), T .0747 R .09 K .44: the blank = the lines less BD(135) - 2 T tan(67.5) (sketch inside) and BD(30) (sketch outside)', function () {
      var a = 135 * Math.PI / 180, b = 105 * Math.PI / 180;
      var p1 = [3, 0], p2 = [3 + 2 * Math.cos(a), 2 * Math.sin(a)], p3 = [p2[0] + 1.5 * Math.cos(b), p2[1] + 1.5 * Math.sin(b)];
      var r = rfOKflat('p.units("in");\np.sheet(0.0747, 0.09, 0.44);\np.sketch("Front").polyline([[0, 0], [' + p1 + '], [' + p2 + '], [' + p3 + ']], false).end().baseFlange(null, { depth: 6 });\n');
      noErrors(r);
      var A1 = 135 * Math.PI / 180;
      var want = 6.5 - (rfOKBD(R09, T14, K44, 135) - 2 * T14 * Math.tan(A1 / 2)) - rfOKBD(R09, T14, K44, 30);
      near(Math.max(r.flat.size[0], r.flat.size[1]), want, 1e-6, 'Z blank ' + r.flat.size.join(' x ') + ' (closed form ' + want.toFixed(6) + ')');
      near(Math.min(r.flat.size[0], r.flat.size[1]), 6, 1e-9, 'width');
      var angs = r.flat.bends.map(function (x) { return Math.round(x.angle != null ? x.angle : 0); });
      assert(r.flat.bends.length === 2, '2 bends: ' + JSON.stringify(angs));
    });

    test('rfOK: a shop gauge table whose 14 ga row carries Bend deduction .135 (and 11 ga .21): the gauge pick gives Bend Deduction, the hat blank follows each row', function () {
      var tbl = { name: 'Shop', units: 'in', rows: [{ gauge: '14', thickness: 0.0747, radius: 0.0747, kFactor: 0.5, bendDeduction: 0.135 }, { gauge: '11', thickness: 0.1196, radius: 0.1196, kFactor: 0.5, bendDeduction: 0.21 }] };
      var row = K.gaugeRow(tbl, '14', 'in');
      near(row.bendDeduction, 0.135, 1e-12, '14 ga BD'); assert(row.kFactor == null, 'BD wins over K');
      near(K.gaugeRow(tbl, '11', 'in').bendDeduction, 0.21, 1e-12, '11 ga BD');
      ['14', '11'].forEach(function (g) {
        var rw = K.gaugeRow(tbl, g, 'in'), T = rw.thickness, R = rw.radius;
        var r = rfOKflat(HAT.replace(/p\.sheet\([^;]*;/, 'p.sheet(' + T + ', ' + R + ', 0.5, { bendAllowanceType: "deduction", bendDeduction: ' + rw.bendDeduction + ' });'));
        noErrors(r);
        var outside = 9 + 4 * T;
        near(Math.abs(r.flat.size[0] - 10) < 1e-9 ? r.flat.size[1] : r.flat.size[0], outside - 4 * rw.bendDeduction, 1e-6, g + ' ga blank');
      });
    });

    test('rfOK: 10 x 6 tray, four Edge-Flanges Material Inside 1.5 (outer virtual sharp), 14 ga R .09 K .44: blank (10 + 2 (1.5 - BD)) x (6 + 2 (1.5 - BD)), 4 bends', function () {
      var r = rfOKflat('p.units("in");\np.sheet(0.0747, 0.09, 0.44);\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\np.flange(1.5, [[5, 0.0747, 0], [10, 0.0747, 3], [5, 0.0747, 6], [0, 0.0747, 3]], { position: "inside", lengthRef: "outer", relief: "obround" });\n');
      noErrors(r);
      var bd = rfOKBD(R09, T14, K44, 90);
      near(r.flat.size[0], 10 + 2 * (1.5 - bd), 1e-6, 'blank X'); near(r.flat.size[1], 6 + 2 * (1.5 - bd), 1e-6, 'blank Y');
      assert(r.flat.bends.length === 4 && r.flat.loops.length === 1, '4 bends, one outline');
    });

    test('rfOK: Kernel.configureDimension: an L bracket in BR-A / BR-B / BR-C, the flange length set to 2.5 in BR-B and 3.5 in BR-C only (This configuration), then 2 in all (All configurations): D1_Edge_Flange1 per configuration, blanks 4 + L - BD', function () {
      var m = K.newModel('L');
      K.runScript(m, 'p.units("in");\np.sheet(0.0747, 0.09, 0.44);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1.5, [[3, 0.0747, 0]], { position: "inside", lengthRef: "outer" });\n');
      m.configurations = [{ name: 'BR-A', values: {} }, { name: 'BR-B', values: {} }, { name: 'BR-C', values: {} }];
      var ef = m.features.filter(function (f) { return f.type === 'flange'; })[0], ref = { feature: ef.id, field: 'length' };
      assert(K.dimLabel(m, ref) === 'D1@Edge-Flange1', 'label ' + K.dimLabel(m, ref));
      m.activeConfiguration = 'BR-B';
      var res = K.configureDimension(m, ref, 2.5, 'this');
      assert(res.ok && res.variable === 'D1_Edge_Flange1', JSON.stringify(res));
      m.activeConfiguration = 'BR-C';
      assert(K.configureDimension(m, ref, 3.5, 'this').ok, 'C');
      var bd = rfOKBD(R09, T14, K44, 90), want = { 'BR-A': 1.5, 'BR-B': 2.5, 'BR-C': 3.5 };
      Object.keys(want).forEach(function (n) {
        m.activeConfiguration = n;
        near(K.linkedDimValue(m, ref), want[n], 1e-12, n + ' value');
        var b = K.rebuild(m), fl = K.flatPattern(m, b, K.meshFromBody(b.body));
        near(Math.abs(fl.size[0] - 6) < 1e-9 ? fl.size[1] : fl.size[0], 4 + want[n] - bd, 1e-6, n + ' blank');
      });
      assert(K.configureDimension(m, ref, 2, 'all').ok, 'all');
      ['BR-A', 'BR-B', 'BR-C'].forEach(function (n) { m.activeConfiguration = n; near(K.linkedDimValue(m, ref), 2, 1e-12, n + ' all'); });
    });
  })();
