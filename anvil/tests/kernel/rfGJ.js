  // --- rfGJ (2026-11-02, lane closed-fill: Closed Corner's closed bend region = SolidWorks 2022 SP5) --- ranked mismatch 7
  // of test-reports/2026-11-02-solidworks-reference-2.md. With the bend region closed SolidWorks does not fill the bend's
  // end with a prism: both bends end on a helicoid, straight in (angle, t) from the base's corner at the bends' start to
  // their wall's end at the bends' end (cylinder areas and the end face's own area, head-tools/sw-reference/ref2_corners.py
  // faces_near). The flat stays the square L, so the folded part is under blank × T by (the corner's L − two triangles) × T.
  // Numbers below are SolidWorks': [v, flat long, flat short, flat volume]. G45 / G46 made one corner there (one pick, no
  // Coplanar): here `coplanar: false`; G47 has four picks there, the two rows' scripts in rfGD have fewer.
  (function () {
    group('rfGJ: Closed Corner, bend region closed: two helicoids, as SolidWorks');
    var U = 'p.units("in");\n', VREL = 1e-5, TOL = 1e-4, T16 = 0.0598, T20 = 0.0359, R20 = 0.0718;
    function rfGJtray(T, R, K0) {
      return U + 'p.sheet(' + T + ', ' + R + ', ' + K0 + ');\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n' +
        'p.flange(1, [[2, ' + T + ', 2]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[4, ' + T + ', 1]], { position: "inside", lengthRef: "outer" });\n';
    }
    function rfGJcorner(T, R, K0, kind, gap, closed) {
      return rfGJtray(T, R, K0) + 'p.closedCorner([[' + (4 - T / 2) + ', 0.6, ' + (2 - R - T) + ']], { cornerType: "' + kind + '", gap: ' + gap + ', ratio: 1' + (closed === false ? '' : ', closeBend: true') + ' });\n';
    }
    function rfGJtrayFour(tail) {
      return U + 'p.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        'p.flange(1, [[2,0.0598,0]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[4,0.0598,1.5]], { position: "inside", lengthRef: "outer" });\n' +
        'p.flange(1, [[2,0.0598,3]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[0,0.0598,1.5]], { position: "inside", lengthRef: "outer" });\n' + tail;
    }
    function rfGJarea(fl) {
      var a = 0;
      fl.loops.forEach(function (l, i) { var s = 0; l.forEach(function (p, j) { var q = l[(j + 1) % l.length]; s += p[0] * q[1] - q[0] * p[1]; }); a += (i ? -1 : 1) * Math.abs(s / 2); });
      return a;
    }
    function rfGJclosed(r, label) {
      var e = Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; });
      assert(!e.length, label + ': ' + e.join(' | '));
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(c.openEdges.length === 0, label + ': open edges ' + c.openEdges.length);
      assert(c.nonManifoldEdges.length === 0, label + ': non-manifold edges ' + c.nonManifoldEdges.length);
    }
    function rfGJrow(code, sw, T, rel, label) {
      var r = build(code);
      rfGJclosed(r, label);
      assert(Math.abs(r.mp.volume - sw[0]) <= (rel || VREL) * sw[0], label + ': volume ' + r.mp.volume.toFixed(7) + ' / SolidWorks ' + sw[0]);
      var f = K.flatPattern(r.model, r.build, r.mesh), s = f.size.slice().sort(function (a, b) { return b - a; });
      assert(Math.abs(s[0] - sw[1]) <= TOL && Math.abs(s[1] - sw[2]) <= TOL, label + ': flat ' + s[0] + ' × ' + s[1]);
      assert(f.loops.length === 1, label + ': the flat is one outline, ' + f.loops.length);
      if (sw[3]) assert(Math.abs(rfGJarea(f) * T - sw[3]) <= VREL * sw[3], label + ': blank × T ' + (rfGJarea(f) * T).toFixed(7) + ' / SolidWorks ' + sw[3]);
      return r;
    }
    test('rfGJ: butt, overlap, underlap with the bend closed: SolidWorks\' volume, its flat, closed', function () {
      rfGJrow(rfGJcorner(T16, T16, 0.5, 'butt', 0.01), [0.7941731, 4.9017, 2.9017, 0.794451103], T16, 0, 'butt 16 ga');
      rfGJrow(rfGJcorner(T16, T16, 0.5, 'butt', 0.03), [0.7925646, 4.9017, 2.9017], T16, 0, 'butt 16 ga gap .03');
      rfGJrow(rfGJcorner(T20, R20, 0.5, 'butt', 0.01), [0.4834709, 4.925579, 2.925579], T20, 0, 'butt 20 ga R .0718');
      rfGJrow(rfGJcorner(0.1196, 0.1196, 0.71, 'butt', 0.02), [1.5032538, 4.842853, 2.842853], 0.1196, 0, 'butt 11 ga K .71');
      rfGJrow(rfGJcorner(T16, T16, 0.5, 'overlap', 0.01), [0.7978084, 4.9017, 2.9017, 0.798166381], T16, 0, 'overlap 16 ga');
      rfGJrow(rfGJcorner(T20, R20, 0.5, 'overlap', 0.01), [0.4848544, 4.925579, 2.925579], T20, 0, 'overlap 20 ga R .0718');
      // SolidWorks' own volume reads 9.6e-6 under its overlap's here, though the faces are the mirror image (equal areas)
      rfGJrow(rfGJcorner(T16, T16, 0.5, 'underlap', 0.01), [0.7977993, 4.9017, 2.9017], T16, 1.5e-5, 'underlap 16 ga');
      return '7 parts';
    });
    test('rfGJ: the four-flange tray: one corner closed (G45, G46), four picks (G47\'s flat), coplanar faces takes the opposite wall', function () {
      var p1 = '[[0.0299, 0.6, 0.1196]]';
      rfGJrow(rfGJtrayFour('p.closedCorner(' + p1 + ', { cornerType: "butt", closeBend: true, coplanar: false });\n'), [1.4453996, 5.803401, 4.803401, 1.445677488], T16, 0, 'G45');
      rfGJrow(rfGJtrayFour('p.closedCorner(' + p1 + ', { cornerType: "overlap", ratio: 0.5, coplanar: false });\n'), [1.4469569, 5.803401, 4.803401, 1.446957232], T16, 0, 'G46');
      var g47 = rfGJtrayFour('p.closedCorner([[0.0299, 0.6, 0.1196], [0.0299, 0.6, 2.8804], [3.9701, 0.6, 0.1196], [3.8804, 0.6, 2.9701]], { cornerType: "underlap" });\n');
      var r = build(g47), f = K.flatPattern(r.model, r.build, r.mesh);
      rfGJclosed(r, 'G47');
      near(rfGJarea(f) * T16, 1.455179469, 2e-5, 'G47: blank × T');
      var two = build(rfGJtrayFour('p.closedCorner(' + p1 + ', { cornerType: "butt", closeBend: true });\n')), one = build(rfGJtrayFour('p.closedCorner(' + p1 + ', { cornerType: "butt", closeBend: true, coplanar: false });\n')), none = build(rfGJtrayFour(''));
      rfGJclosed(two, 'both corners');
      near(two.mp.volume - none.mp.volume, 2 * (one.mp.volume - none.mp.volume), 1e-6, 'two corners take twice one');
      return 'G47 folded: SolidWorks 1.4550847, its own blank × T 1.4551795, Anvil ' + r.mp.volume.toFixed(7);
    });
    test('rfGJ: the bend end is the helicoid: closed − open butt = the extended bend\'s triangle × T at K 0.5', function () {
      var c = build(rfGJcorner(T16, T16, 0.5, 'butt', 0.01)), o = build(rfGJcorner(T16, T16, 0.5, 'butt', 0.01, false));
      var BA = Math.PI / 2 * (T16 + T16 / 2), dz = T16 - 0.01 / Math.SQRT2;
      near(c.mp.volume - o.mp.volume, BA * dz / 2 * T16, 1e-9, 'triangle × T');
      return (c.mp.volume - o.mp.volume).toFixed(9);
    });
    test('rfGJ: every type on all four corners, three gauges, R T / 2T / T/2, gaps: closed, the flat a blank with no stray notch', function () {
      var n = 0;
      [[T16, T16], [T16, 2 * T16], [T16, T16 / 2], [T20, R20], [0.1196, 0.1196], [0.1196, 0.25]].forEach(function (q) {
        var T = q[0], R = q[1], e = R + T;
        ['butt', 'overlap', 'underlap'].forEach(function (kind) {
          [0.01, 0.02].forEach(function (gap) {
            if (R <= gap) return;
            var code = U + 'p.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
              'p.flange(1, [[2,' + T + ',0]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[2,' + T + ',3]], { position: "inside", lengthRef: "outer" });\n' +
              'p.flange(1, [[4,' + T + ',1.5]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[0,' + T + ',1.5]], { position: "inside", lengthRef: "outer" });\n' +
              'p.closedCorner([[' + (T / 2) + ', 0.6, ' + e + '], [' + (T / 2) + ', 0.6, ' + (3 - e) + '], [' + (4 - T / 2) + ', 0.6, ' + e + '], [' + (4 - T / 2) + ', 0.6, ' + (3 - e) + ']], { cornerType: "' + kind + '", gap: ' + gap + ', closeBend: true });\n';
            var r = build(code), label = kind + ' T ' + T + ' R ' + R + ' gap ' + gap;
            rfGJclosed(r, label);
            var f = K.flatPattern(r.model, r.build, r.mesh);
            assert(f.loops.length === 1, label + ': one outline, ' + f.loops.length);
            n++;
          });
        });
      });
      return n + ' trays';
    });
  })();
