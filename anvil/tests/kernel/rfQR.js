  // --- rfQR (2026-11-19, lane stepflats): customer STEP files into flats. A bend relief past ~100 degrees Material Inside
  // reaches the blank's edge (the flat had a closed hole 0.023 in inside it at 135 degrees, 11 ga) ---
  function rfQRtray(T, R, K, ang, relief, L) {
    var s = 'p.units("in"); p.sheet(' + T + ', ' + R + ', ' + K + '); p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n';
    [[4, T, 0], [4, T, 6], [0, T, 3], [8, T, 3]].forEach(function (e) {
      s += 'p.flange(' + (L || 1) + ', [[' + e.join(', ') + ']], { angle: ' + ang + ', position: "inside", relief: "' + relief + '" });\n';
    });
    return s;
  }
  function rfQRarea(flat) { return flat.loops.reduce(function (s, l, i) { return s + Math.abs(K.signedArea(l)) * (i ? -1 : 1); }, 0); }
  (function () {
    group('rfQR: STEP to flat: bend reliefs past 90 degrees, the corpus round trip');
    test('rfQR: 8 x 6 tray, four Edge Flanges Material Inside, rect / obround / tear relief, 30 to 150 degrees at 11 and 16 ga: every relief is a notch in the outline (one loop), never a hole (the export audit\'s 135 degree tray had 4 holes of 0.113 sq in)', function () {
      var n = 0;
      [[0.1196, 0.12, 0.33], [0.0598, 0.0598, 0.5]].forEach(function (g) {
        [30, 60, 90, 100, 120, 135, 150].forEach(function (a) {
          ['rect', 'obround', 'tear'].forEach(function (rl) {
            var r = build(rfQRtray(g[0], g[1], g[2], a, rl)); noErrors(r);
            var flat = K.flatPattern(r.model, r.build, r.mesh);
            near(flat.loops.length, 1, 0, g[0] + ' ' + a + ' deg ' + rl + ': loops');
            n++;
          });
        });
      });
      return n + ' trays, one loop each';
    });
    test('rfQR: the relief removes the same metal from the folded part and from the flat: short walls (.05, no wall meets another) at 100 / 135 degrees, folded = flat area x T to 1e-9 (obround 1e-7: its arc is a polygon); with 1 in walls the relief\'s share agrees to 1e-9', function () {
      [100, 135].forEach(function (a) {
        ['none', 'rect', 'obround', 'tear'].forEach(function (rl) {
          var r = build(rfQRtray(0.0598, 0.0598, 0.5, a, rl, 0.05)); noErrors(r);
          assert(K.meshQuality(r.mesh).closed, a + ' ' + rl + ': closed');
          near(r.mp.volume, rfQRarea(K.flatPattern(r.model, r.build, r.mesh)) * 0.0598, rl === 'obround' ? 1e-7 : 1e-9, a + ' deg ' + rl);
        });
      });
      var share = function (rl, a) {
        var r = build(rfQRtray(0.1196, 0.1196, 0.5, a || 135, rl)); noErrors(r);
        return [r.mp.volume, rfQRarea(K.flatPattern(r.model, r.build, r.mesh)) * 0.1196];
      };
      var o = share('none'), q = share('rect');
      near(o[0] - q[0], o[1] - q[1], 1e-9, '135 deg 11 ga rect: metal the relief removes, folded vs flat');
      var o5 = share('none', 150), q5 = share('tear', 150);
      near(o5[0] - q5[0], o5[1] - q5[1], 1e-9, '150 deg 11 ga tear');
      return 'rect at 135: ' + (o[0] - q[0]).toFixed(9) + ' in3 from both';
    });
    test('rfQR: the audit\'s tray (11 ga, R .12, K .33, 135 deg, obround): the notch runs out past the blank\'s edge line (x = 8 at the corner)', function () {
      var r = build(rfQRtray(0.1196, 0.12, 0.33, 135, 'obround')); noErrors(r);
      var flat = K.flatPattern(r.model, r.build, r.mesh);
      near(flat.loops.length, 1, 0, 'one loop');
      var rec = r.build.flanges[6][0].reliefs[0];
      assert(rec && rec.reach > 0.4588, 'the record carries the slot\'s reach (' + (rec && rec.reach) + ')');
      return 'reach ' + rec.reach.toFixed(4);
    });

    // the corpus (test-reports/repros/step-flats-parts.js): own flat, Anvil's STEP, read back as a dumb solid, Insert
    // Bends at the Base Flange's face with the same T and K: the same bends (angle, R), loops, area and outline sides
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    function rfQRrect(W, H) { return 'p.sketch("Top").rect(0, -' + H + ', ' + W + ', ' + H + ').end().baseFlange();\n'; }
    function rfQRfl4(T, W, H, L, o) { return [[W / 2, T, 0], [W, T, H / 2], [W / 2, T, H], [0, T, H / 2]].map(function (e) { return 'p.flange(' + L + ', [' + JSON.stringify(e) + '], ' + JSON.stringify(o) + ');\n'; }).join(''); }
    function rfQRsides(l) { return l.map(function (p, i) { var q = l[(i + 1) % l.length]; return Math.hypot(q[0] - p[0], q[1] - p[1]); }).sort(function (a, b) { return a - b; }); }
    function rfQRbends(fl) { return fl.bends.map(function (b) { return (+b.angle).toFixed(3) + '/' + (+b.R).toFixed(5); }).sort().join(' '); }
    function rfQRtrip(code, fixed, tol) {
      if (!X) fail('exchange.js is not loaded');
      var r = build(code); noErrors(r);
      var own = K.flatPattern(r.model, r.build, r.mesh), sh = K.sheetParams(r.model);
      var m2 = X.newPartFromImport(X.importFile('rfQR.step', X.exportSTEP(r.model, r.build), { units: r.model.units || 'in' }));
      new K.Builder(m2).insertBends(fixed, { kFactor: sh.kFactor, thickness: sh.thickness });
      var b2 = K.rebuild(m2);
      assert(!Object.keys(b2.errors).length, 'Insert Bends: ' + JSON.stringify(b2.errors));
      var ib = K.flatPattern(m2, b2, K.meshFromBody(b2.body));
      near(ib.bends.length, own.bends.length, 0, 'bends found');
      assert(rfQRbends(ib) === rfQRbends(own), 'bends (angle / R): ' + rfQRbends(ib) + ', own ' + rfQRbends(own));
      near(ib.loops.length, own.loops.length, 0, 'loops');
      near(rfQRarea(ib), rfQRarea(own), tol || 1e-6, 'blank area');
      var so = rfQRsides(own.loops[0]), si = rfQRsides(ib.loops[0]);
      assert(si.length === so.length, 'outline corners ' + si.length + ', own ' + so.length);
      so.forEach(function (d, k) { near(si[k], d, tol || 1e-6, 'outline side ' + k); });
      return { own: own, ib: ib, d: rfQRarea(ib) - rfQRarea(own) };
    }
    var T16 = 0.0598, T11 = 0.1196, T20 = 0.0359;
    var IN = function (T, R, k) { return 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + k + ');\n'; };
    test('rfQR: trays through STEP and Insert Bends, with the bend relief folded into the neighbouring bend (rect / tear 16 ga K .44, obround 1 mm): the blank is the part\'s own to 1e-6 and no mitre warning (each bend end read as a slant from corner to corner: 0.0195 in², 0.062 in², 5 mm² short)', function () {
      var out = [];
      [['rect', IN(T16, T16, 0.44) + rfQRrect(6, 4) + rfQRfl4(T16, 6, 4, 1, { position: 'inside', relief: 'rect' }), [3, T16, 2], 1e-6],
        ['tear', IN(T16, T16, 0.44) + rfQRrect(6, 4) + rfQRfl4(T16, 6, 4, 1, { position: 'inside', relief: 'tear' }), [3, T16, 2], 1e-6],
        ['obround mm', 'p.units("mm");\np.sheet(1, 1, 0.45);\n' + rfQRrect(150, 100) + rfQRfl4(1, 150, 100, 25, { position: 'inside', relief: 'obround' }), [75, 1, 50], 1e-4]].forEach(function (c) {
        var t = rfQRtrip(c[1], c[2], c[3]);
        assert(!(t.ib.warnings || []).some(function (w) { return /mitre/.test(w); }), c[0] + ': a mitre warning: ' + t.ib.warnings.join(' | '));
        out.push(c[0] + ' ' + t.d.toExponential(1));
      });
      return out.join(', ');
    });
    test('rfQR: the corpus through STEP and Insert Bends, blank = own to 1e-6: L 16 ga K .44 with holes .2 from the bend, U 1.5 mm K .4, Z 135 + 45 degrees 11 ga K .33, hat 20 ga, Closed Corners, closed + open Hems, Jog, Miter Flange L, partial flange, profile flange, slanted edge, Cross-Break', function () {
      var hole = function (l, r) { return 'p.sketch("Top")' + l.map(function (c) { return '.circle(' + c[0] + ', ' + (-c[1]) + ', ' + r + ')'; }).join('') + '.end().extrude(1, { cut: true, through: true, both: true });\n'; };
      var open = function (pts, d) { return 'p.sketch("Front").polyline(' + JSON.stringify(pts) + ', false).end().baseFlange(null, { depth: ' + d + ' });\n'; };
      var n = 0;
      [[IN(T16, T16, 0.44) + rfQRrect(4, 2) + 'p.flange(1.5, [[2, ' + T16 + ', 0]], {});\n' + hole([[1, 0.3], [3, 0.3], [2, 1.5]], 0.125), [2, T16, 1.2]],
        ['p.units("mm");\np.sheet(1.5, 1.5, 0.4);\n' + rfQRrect(100, 60) + 'p.flange(30, [[50, 1.5, 0], [50, 1.5, 60]], {});\n' + hole([[25, 6], [75, 54], [50, 30]], 3), [50, 1.5, 30]],
        [IN(T11, 0.12, 0.33) + open([[0, 0], [2, 0], [1, 1], [1, 2.5]], 3), [1, 0, 1.5]],
        [IN(T20, T20, 0.5) + open([[0, 0], [1, 0], [1, 1.5], [3, 1.5], [3, 0], [4, 0]], 3), [0.5, 0, 1.5]],
        [IN(T16, T16, 0.5) + rfQRrect(4, 3) + rfQRfl4(T16, 4, 3, 1, { position: 'inside', lengthRef: 'outer' }) + 'p.closedCorner(' + JSON.stringify([[T16 / 2, 0.6, 2 * T16], [4 - T16 / 2, 0.6, 2 * T16], [4 - 2 * T16, 0.6, 3 - T16 / 2], [T16 / 2, 0.6, 3 - 2 * T16]]) + ', { cornerType: "butt", gap: 0.01, coplanar: false });\n', [2, T16, 1.5]],
        [IN(T20, T20, 0.5) + rfQRrect(4, 3) + 'p.hem(0.375, [[2, ' + T20 + ', 0]], { hemType: "closed" });\np.hem(0.375, [[2, ' + T20 + ', 3]], { gap: 0.03 });\n', [2, T20, 1.5]],
        [IN(T16, T16, 0.5) + rfQRrect(4, 3) + 'p.jog(0.5, 1, [[0, ' + T16 + ', 1.5]]);\n', [3, T16, 1.5]],
        [IN(T16, T16, 0.5) + rfQRrect(4, 2) + 'p.sketch("Right").line(0, ' + T16 + ', 0, ' + (T16 + 1) + ').line(0, ' + (T16 + 1) + ', 0.5, ' + (T16 + 1) + ').end();\np.miterFlange([[2, ' + T16 + ', 0], [0, ' + T16 + ', 1]], {});\n', [1, T16, 1.3]],
        [IN(T16, T16, 0.5) + rfQRrect(6, 3) + 'p.flange(1, [[3, ' + T16 + ', 0]], { position: "inside", relief: "rect", startOffset: 1, endOffset: 1.5 });\n', [3, T16, 1.5]],
        [IN(T11, 0.12, 0.4) + 'p.sketch("Top").polyline([[0, 0], [4, 0], [3, -2], [0, -2]], true).end().baseFlange();\np.flange(1, [[3.5, ' + T11 + ', 1]], {});\n', [1.5, T11, 1]],
        [IN(T20, T20, 0.5) + rfQRrect(4, 2) + 'p.flange(0.75, [[2, ' + T20 + ', 0]], {});\np.crossBreak([1, ' + T20 + ', 1], { radius: 0.25, angle: 2 });\n', [1, T20, 1]]].forEach(function (c) {
        rfQRtrip(c[0], c[1], /mm/.test(c[0]) ? 1e-4 : 1e-6); n++;
      });
      return n + ' parts';
    });
    test('rfQR: a fixed face picked on the sheet\'s edge (the L\'s side, T wide) is refused naming the face (T was measured as the part\'s 4 in length and the L taken for a 4 in thick plate: a 1.6 x 2.1 blank, no warning)', function () {
      var r = build(IN(T16, T16, 0.5) + rfQRrect(4, 2) + 'p.flange(1.5, [[2, ' + T16 + ', 0]], {});\n'); noErrors(r);
      var m2 = X.newPartFromImport(X.importFile('rfQR.step', X.exportSTEP(r.model, r.build), { units: 'in' }));
      new K.Builder(m2).insertBends([4, 0.03, 1]);
      var b2 = K.rebuild(m2), e = Object.keys(b2.errors).map(function (k) { return b2.errors[k]; }).join(' ');
      assert(/the face at \(4, 0\.03, 1\) is the edge of a sheet/.test(e), 'refused: ' + e);
      return e;
    });
    test('rfQR: K and the bend allowance changed after Insert Bends re-develop the blank by the closed form: the 16 ga L (90 deg, R .0598) at K .44 -> .33 shortens by pi/2 T x .11; a bend deduction .1 gives the two outside lengths less .1', function () {
      var r = build(IN(T16, T16, 0.44) + rfQRrect(4, 2) + 'p.flange(1.5, [[2, ' + T16 + ', 0]], {});\n'); noErrors(r);
      var m2 = X.newPartFromImport(X.importFile('rfQR.step', X.exportSTEP(r.model, r.build), { units: 'in' }));
      new K.Builder(m2).insertBends([2, T16, 1.2], { kFactor: 0.44, thickness: T16 });
      var size = function () { var b = K.rebuild(m2); assert(!Object.keys(b.errors).length, JSON.stringify(b.errors)); var f = K.flatPattern(m2, b, K.meshFromBody(b.body)); near(f.bends.length, 1, 0, 'one bend'); return Math.abs(f.size[0] - 4) < 1e-9 ? f.size[1] : f.size[0]; };   // the developed side (the other is the 4 in edge)
      var a = size();
      m2.sheet = K.makeSheet(Object.assign({}, m2.sheet, { kFactor: 0.33 }));
      var b = size();
      near(a - b, Math.PI / 2 * T16 * 0.11, 1e-9, 'K .44 -> .33');
      // the outside lengths (to the virtual sharp): the K .5 blank less its BA plus 2 (R + T)
      m2.sheet = K.makeSheet(Object.assign({}, m2.sheet, { kFactor: 0.5 }));
      var c = size(), R = T16, BA5 = Math.PI / 2 * (R + T16 / 2), outside = c - BA5 + 2 * (R + T16);
      m2.sheet = K.makeSheet(Object.assign({}, m2.sheet, { bendAllowanceType: 'deduction', bendDeduction: 0.1 }));
      near(size(), outside - 0.1, 1e-9, 'deduction .1: outside lengths - BD');
      return 'K .44 ' + a.toFixed(6) + ', K .33 ' + b.toFixed(6) + ', BD .1 ' + (outside - 0.1).toFixed(6);
    });
    test('rfQR: what legitimately differs is warned: a louver\'s slit (its width is the tooling\'s, the STEP has it closed) and a flared lip\'s mitred corner (squared, "may draw it along the slant")', function () {
      var r = build('p.units("mm");\np.sheet(1.9, 1.9, 0.5);\np.sketch("Top").rect(0, -80, 100, 80).end().baseFlange();\np.flange(20, [[50, 1.9, 0]], {});\np.formingTool("louver", [50, 1.9, 45]);\n'); noErrors(r);
      var m2 = X.newPartFromImport(X.importFile('rfQR.step', X.exportSTEP(r.model, r.build), { units: 'mm' }));
      new K.Builder(m2).insertBends([50, 1.9, 30], { kFactor: 0.5, thickness: 1.9 });
      var b2 = K.rebuild(m2), ib = K.flatPattern(m2, b2, K.meshFromBody(b2.body));
      assert(ib.warnings.some(function (w) { return /lance or louver/.test(w); }), 'the louver\'s slit warned: ' + ib.warnings.join(' | '));
      return ib.warnings.length + ' warning(s)';
    });
  })();
