  // --- rfMQ (2026-11-15, lane smcorners: sheet-metal corners closed and exact) ---
  // (a) a plain (not Normal) through Cut-Extrude at the corner of a 4 × 3 tray with no relief / Closed Corner (20 ga
  // R .0718 and 14 ga R .075; 5 centres × 3 radii): 20 of the 30 left 1 to 18 non-manifold edges. Measured cause: real
  // geometry, not a crack. The earlier bend runs through the corner square; its inside face is tangent to the sketch
  // face (y = T) on its bend line z = R + T, where the later bend's end face lies. A cut that removes only below y = T
  // leaves the earlier bend's knife edge touching the later bend's end face along that line (OpenCascade builds the
  // same touching solid). They build as on main with a feature warning naming Normal cut (a depth-T cut at a tray
  // corner is everyday shop work; SolidWorks' corner has a gap between the bends, so it never touches); all 30 =
  // OpenCascade to 2e-10.
  // (b) a Normal Cut hole that swallows a whole bend at the part's edge: closed (14 ga: the scaled union of two bends'
  // rebuilt metal left a 6e-6 crack) and its volume follows the bend's INSIDE face (the sketch face's piece of
  // body ∩ tool was lost to the area vote when the bend part of it was larger: no backward shadow, 5e-4 / 1e-3 of the
  // part left in), against the developed closed form.
  (function () {
    group('rfMQ: sheet-metal corners: plain cuts at tray corners exact (warned when touching), a Normal Cut hole that swallows a bend closed and exact');
    function rfMQtray(T, R) {
      return 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    }
    function rfMQclosed(r, label) {
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 }), q = K.meshQuality(r.mesh);
      assert(c.openEdges.length === 0 && c.nonManifoldEdges.length === 0 && q.openEdges === 0, label + ': ' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold edges (mesh ' + q.openEdges + ' open)');
    }
    function rfMQarea(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? 1 : -1) * Math.abs(K.signedArea(l)); }, 0); }
    // OpenCascade's volumes of the 30 corner cuts (headless OcctKernel.build, 2026-11-15), by probe index; TOUCH: the
    // ones whose two walls touch along the bend line (OpenCascade builds the same touching solid)
    var OCC = { 1: 0.8814168738, 2: 0.8808444636, 3: 0.8795537429, 4: 0.8815332060, 5: 0.8812822908, 6: 0.8804240230,
      7: 0.8816338132, 8: 0.8813396703, 9: 0.8803494753, 10: 0.8815616691, 11: 0.8812851518, 12: 0.8803494753, 13: 0.8816754232,
      14: 0.8815729639, 15: 0.8810879112, 16: 1.7738429081, 17: 1.7722799985, 18: 1.7684290138, 19: 1.7740146665,
      20: 1.7731678846, 21: 1.7711470643, 22: 1.7743136811, 23: 1.7737563616, 24: 1.7711800779, 25: 1.7741528399,
      26: 1.7734450925, 27: 1.7711800779, 28: 1.7744001759, 29: 1.7742046914, 30: 1.7731039904 };
    var TOUCH = { 1: 1, 2: 1, 3: 1, 5: 1, 6: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 15: 1, 17: 1, 18: 1, 20: 1, 21: 1, 24: 1, 25: 1, 26: 1, 27: 1, 30: 1 };
    test('rfMQ: plain through cut at the corner of a tray with no relief, 30 probes (20 / 14 ga, 5 centres × 3 radii): all build = OpenCascade (1e-8), no open edges; the 20 whose walls touch along the bend line carry a warning naming Normal cut, the 10 others are closed with no warning', function () {
      var i = 0, warned = 0;
      [[0.0359, 0.0718], [0.0747, 0.075]].forEach(function (g) {
        var T = g[0], R = g[1], P = R + T, r0 = build(rfMQtray(T, R)), v0 = r0.mp.volume;
        rfMQclosed(r0, 'tray T ' + T);
        nearRel(v0, rfMQarea(K.flatPattern(r0.model, r0.build, r0.mesh)) * T, 1e-9, 'tray T ' + T + ': volume = blank × T');
        [[P, P], [P / 2, P / 2], [P, 0.02], [0.02, P], [0, 0]].forEach(function (c) {
          [0.05, 0.1, 0.2].forEach(function (rad) {
            i++;
            var label = 'T ' + T + ' r ' + rad + ' at ' + c[0].toFixed(4) + ', ' + c[1].toFixed(4);
            var r = build(rfMQtray(T, R) + 'p.sketch("Top", ' + T + ').circle(' + c[0] + ', ' + (-c[1]) + ', ' + rad + ').cut("through", { reverse: true });\n');
            var e = Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; }), w = Object.keys(r.warnings || {}).map(function (k) { return r.warnings[k]; }).join(' ');
            assert(!e.length, label + ': ' + e.join(' | '));
            nearRel(r.mp.volume, OCC[i], 1e-8, label + ' volume vs OpenCascade');
            if (TOUCH[i]) {
              var c2 = Evaluate.checkBody(r.body, { maxPairs: 1 });
              assert(c2.openEdges.length === 0 && K.meshQuality(r.mesh).openEdges === 0, label + ': open edges');
              assert(/touching along a line/.test(w) && /Normal cut/.test(w), label + ': warning ' + (w || 'none'));
              warned++;
            } else {
              rfMQclosed(r, label);
              assert(!/touching along a line/.test(w), label + ': warns ' + w);
            }
          });
        });
      });
      return '30 built = OpenCascade, ' + warned + ' with the warning';
    });
    test('rfMQ: the same corner hole as a Normal Cut builds (no refusal), closed', function () {
      var T = 0.0747, R = 0.075, P = R + T;
      var r = build(rfMQtray(T, R) + 'p.sketch("Top", ' + T + ').circle(' + P + ', ' + (-P) + ', 0.2).cut("through", { reverse: true, normalCut: true });\n');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      rfMQclosed(r, 'Normal Cut at the corner');
      return 'volume ' + r.mp.volume.toFixed(9);
    });

    // the metal a vertical Normal Cut circle (cx, cz, r) takes out of the tray near its z = 0 edge (corner at x = 0):
    // the base inside [P, 4 − P] × [P, 3 − P], and each bend's footprint on its INSIDE face developed by angle
    // ((R + T/2) dθ per unit length: the radial cut through T), for the z = 0 bend over all x and the x = 0 bend over z
    function rfMQremoved(T, R, cx, cz, r) {
      var P = R + T, Rm = R + T / 2, N = 200000, sum = 0, i;
      function cl(v) { return Math.max(0, Math.min(1, v)); }
      function dth(c, h) { return Math.asin(cl((P - (c - h)) / R)) - Math.asin(cl((P - (c + h)) / R)); }
      var a = Math.max(0, cx - r), b = Math.min(4, cx + r), dx = (b - a) / N;
      for (i = 0; i < N; i++) {
        var x = a + (i + 0.5) * dx, h = Math.sqrt(Math.max(0, r * r - (x - cx) * (x - cx))), w = Rm * dth(cz, h);
        if (x >= P && x <= 4 - P) w += Math.max(0, Math.min(cz + h, 3 - P) - Math.max(cz - h, P));
        sum += w * dx;
      }
      a = Math.max(P, cz - r); b = Math.min(3 - P, cz + r);
      if (b > a) {
        var dz = (b - a) / N;
        for (i = 0; i < N; i++) { var z = a + (i + 0.5) * dz, hz = Math.sqrt(Math.max(0, r * r - (z - cz) * (z - cz))); sum += Rm * dth(cx, hz) * dz; }
      }
      return sum * T;
    }
    // [T, R, cx, cz, r, label]: report 2026-11-13 (20 ga: 9 open edges then; 14 ga: 2)
    var SWALLOW = [[0.0359, 0.0718, 0.3, (0.0718 + 0.0359) / 2, 0.1, '20 ga Ø.2'], [0.0747, 0.075, 0.3, 0.075, 0.2, '14 ga Ø.4']];
    SWALLOW.forEach(function (s) {
      test('rfMQ: ' + s[5] + ' Normal Cut hole that swallows the whole bend at the part\'s edge: closed, the flat shows the hole once, volume = the developed closed form (2e-5: the circle is a polygon in the bend; was 5e-4 / 1e-3 heavy)', function () {
        var T = s[0], R = s[1], v0 = build(rfMQtray(T, R)).mp.volume;
        var r = build(rfMQtray(T, R) + 'p.sketch("Top", ' + T + ').circle(' + s[2] + ', ' + (-s[3]) + ', ' + s[4] + ').cut("through", { reverse: true, normalCut: true });\n');
        assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
        rfMQclosed(r, s[5]);
        var fl = K.flatPattern(r.model, r.build, r.mesh);
        assert(fl.loops.length === 2, s[5] + ': ' + fl.loops.length + ' flat loops (outline + the hole once)');
        var ex = v0 - rfMQremoved(T, R, s[2], s[3], s[4]);
        nearRel(r.mp.volume, ex, 2e-5, s[5] + ' volume vs closed form ' + ex.toFixed(9));
        return 'volume ' + r.mp.volume.toFixed(9) + ', closed form ' + ex.toFixed(9) + ' (' + ((r.mp.volume - ex) / ex).toExponential(2) + ')';
      });
    });
    // (c) Mass Properties of a round hole cut while unfolded, inside a bend (rfFT M26: the hole's wall in the bend was the
    // polygon's, 1.1e-5 of the part heavy): exact against the developed closed form, blank × T with true circles
    test('rfMQ: Unfold / Ø.5 hole / Fold: Mass Properties count the true circle in the bend (rfFT M26 U channel 9.7e-7 of the closed form = OpenCascade, was 1.1e-5; its L-bracket pin 3e-7; a hole inside the bend zone exact in rfKQ)', function () {
      var T = 0.0598, R = 0.0598, BA = Math.PI / 2 * (R + T / 2), BD = 2 * (R + T) - BA, out = [];
      var head = 'p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n';
      [['U channel, two holes', 'p.flange(1.5, [[3, 0.0598, 0], [3, 0.0598, 4]], { position: "inside", lengthRef: "outer" });\n', '.circle(3, 0.05, 0.25).circle(3, -3.95, 0.25)', (6 * (7 - 2 * BD) - 2 * Math.PI * 0.0625) * T, 2e-6],
       ['L bracket, one hole', 'p.flange(1.5, [[3, 0.0598, 0]], { position: "inside", lengthRef: "outer" });\n', '.circle(3, 0.05, 0.25)', (6 * (5.5 - BD) - Math.PI * 0.0625) * T, 1e-6]].forEach(function (c) {
        var r = build(head + c[1] + 'p.unfold([3, 0.0598, 2], null);\np.sketch("Top", 0.0598)' + c[2] + '.end().cut("through", { reverse: true });\np.fold(null);\n');
        assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
        rfMQclosed(r, c[0]);
        nearRel(r.mp.volume, c[3], c[4], c[0] + ' volume vs closed form');
        out.push(c[0] + ' ' + ((r.mp.volume - c[3]) / c[3]).toExponential(2));
      });
      return out.join('; ');
    });
    test('rfMQ TODO: the swallowing Normal Cut holes exact to 1e-6 (folded and flat area × T)', function () {
      var out = [];
      SWALLOW.forEach(function (s) {
        var T = s[0], R = s[1], v0 = build(rfMQtray(T, R)).mp.volume;
        var r = build(rfMQtray(T, R) + 'p.sketch("Top", ' + T + ').circle(' + s[2] + ', ' + (-s[3]) + ', ' + s[4] + ').cut("through", { reverse: true, normalCut: true });\n');
        var ex = v0 - rfMQremoved(T, R, s[2], s[3], s[4]), fa = rfMQarea(K.flatPattern(r.model, r.build, r.mesh)) * T;
        out.push(s[5] + ': folded ' + ((r.mp.volume - ex) / ex).toExponential(2) + ', flat × T ' + ((fa - ex) / ex).toExponential(2));
      });
      return 'TODO ' + out.join('; ');
    });
  })();
  // --- end rfMQ ---
