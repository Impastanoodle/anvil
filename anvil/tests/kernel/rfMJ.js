  // --- rfMJ (2026-11-13, lane solidfid: solids fidelity) --- every solid closed, manifold and exact in volume:
  // (a) Corner Relief on a box whose corners a Closed Corner closed (Butt, bend region closed: both bends end on
  // slanted helicoid faces at the corner). Each bend's sector there also holds the end of the other bend, and the
  // wrapped cutter through the slanted ends cracked the solid (14 ga, Circular 0.12: 12 open / 4 non-manifold edges;
  // 23 of 56 size / type cases open or with a sliver loop in the flat). Both bends are now rebuilt from their developed
  // metal, read back from the solid, less the relief outline (kernel-sheetmetal.js crCornerApply / bendBandsRebuild),
  // and the relief reaches the bend a Closed Corner extended. Folded volume and flat area against the closed forms;
  // (b) rfGA G13's shell closes on the shell guard's first attempt (no retry); (c) closed corners on 20 ga R .0718;
  // (d) a Normal Cut hole at the corner of a closed corner (was open in a quarter of the probes): a Normal Cut across an
  // edge flange's bend is the footprint in the bend's developed metal (normalCutBends), no prism through a bend.
  (function () {
    group('rfMJ: solids fidelity: Corner Relief and Normal Cut holes at closed corners are closed and exact; G13 shell first attempt');
    function rfMJbox(T, R, KF, cc) {
      return 'p.name("Box").units("in");\np.sheet(' + T + ', ' + R + ', ' + KF + ');\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
        [[5, T, 0], [10, T, 3], [5, T, 6], [0, T, 3]].map(function (e) { return 'p.flange(2, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('') +
        (cc ? 'p.closedCorner(' + JSON.stringify([[T / 2, 1.8, R + T], [10 - R - T, 1.8, 6 - T / 2], [T / 2, 1.8, 6 - R - T]]) + ', ' + JSON.stringify(cc) + ');\n' : '');
    }
    function rfMJrelief(T, R, size, type) { var a = R + T; return 'p.cornerRelief(' + JSON.stringify([[a, T, a], [10 - a, T, a], [10 - a, T, 6 - a], [a, T, 6 - a]]) + ', ' + size + ', { reliefType: "' + type + '" });\n'; }
    function rfMJclosed(r, label) {
      var e = Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; });
      assert(!e.length, label + ': ' + e.join(' | '));
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 }), q = K.meshQuality(r.mesh);
      assert(c.openEdges.length === 0 && c.nonManifoldEdges.length === 0 && q.openEdges === 0, label + ': ' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold edges (mesh ' + q.openEdges + ' open)');
    }
    function rfMJarea(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? 1 : -1) * Math.abs(K.signedArea(l)); }, 0); }
    // the part of a convex polygon inside half planes [[a, c]]: a · p ≤ c
    function rfMJin(poly, hs) {
      hs.forEach(function (h) {
        var out = [], a = h[0], c = h[1];
        for (var i = 0; i < poly.length; i++) {
          var p = poly[i], q = poly[(i + 1) % poly.length], dp = a[0] * p[0] + a[1] * p[1] - c, dq = a[0] * q[0] + a[1] * q[1] - c;
          if (dp <= 0) out.push(p);
          if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { var t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
        }
        poly = out;
      });
      return poly.length >= 3 ? Math.abs(K.signedArea(poly)) : 0;
    }
    // the relief outline in the corner frame (origin: the bend lines' crossing, x / y across the two bends), as
    // kernel-sheetmetal.js cornerReliefShape lays it (centred on the bends' centre lines)
    function rfMJshape(type, size, BA) {
      var C = BA / 2, h = size / 2, d = Math.SQRT1_2, pts = [], i;
      if (type === 'tear') return [[0, 0], [BA, 0], [BA, BA], [0, BA]];
      if (type === 'rect') return [[C - h, C - h], [C + h, C - h], [C + h, C + h], [C - h, C + h]];
      if (type === 'circular') { for (i = 0; i < 32; i++) pts.push([C + h * Math.cos(2 * Math.PI * i / 32), C + h * Math.sin(2 * Math.PI * i / 32)]); return pts; }
      var a0 = Math.atan2(d, -d);
      for (i = 0; i <= 16; i++) pts.push([C + d * h + h * Math.cos(a0 - Math.PI * i / 16), C + d * h + h * Math.sin(a0 - Math.PI * i / 16)]);
      for (i = 0; i <= 16; i++) pts.push([C - d * h + h * Math.cos(a0 + Math.PI - Math.PI * i / 16), C - d * h + h * Math.sin(a0 + Math.PI - Math.PI * i / 16)]);
      return K.signedArea(pts) < 0 ? pts.reverse() : pts;
    }
    // Butt Closed Corner, bend region closed, gap g: each bend ends on a helicoid from the crossing to h = R − g/√2
    // past it at its wall, the walls end at h, and the flat keeps the square L out to h on both strips. What a
    // relief Q takes: T × (its part of the face and of the two walls) + T · (R + T/2) / (R + K·T) × (its part of the
    // two bends' developed metal); in the flat, its part of the L.
    function rfMJexpect(T, R, KF, type, size) {
      var BA = Math.PI / 2 * (R + KF * T), h = R - 0.01 / Math.SQRT2, cb = (R + T / 2) / (R + KF * T), Q = rfMJshape(type, size, BA);
      var face = rfMJin(Q, [[[1, 0], 0], [[0, 1], 0]]);
      var dA = rfMJin(Q, [[[-1, 0], 0], [[1, 0], BA], [[-h / BA, 1], 0]]), dB = rfMJin(Q, [[[0, -1], 0], [[0, 1], BA], [[1, -h / BA], 0]]);
      var wA = rfMJin(Q, [[[-1, 0], -BA], [[0, 1], h]]), wB = rfMJin(Q, [[[0, -1], -BA], [[1, 0], h]]);
      var fA = rfMJin(Q, [[[-1, 0], 0], [[0, 1], h]]), fB = rfMJin(Q, [[[0, -1], 0], [[1, 0], h]]), fAB = rfMJin(Q, [[[-1, 0], 0], [[0, -1], 0], [[1, 0], h], [[0, 1], h]]);
      return { vol: 4 * T * (face + wA + wB + cb * (dA + dB)), flat: 4 * (face + fA + fB - fAB) };
    }
    var rfMJbase = {};
    function rfMJbaseOf(T, R, KF) {
      var key = T + '/' + R + '/' + KF;
      if (!rfMJbase[key]) { var a = build(rfMJbox(T, R, KF, { cornerType: 'butt', gap: 0.01, closeBend: true })); rfMJclosed(a, 'box'); rfMJbase[key] = { vol: a.mp.volume, flat: rfMJarea(K.flatPattern(a.model, a.build, a.mesh)) }; }
      return rfMJbase[key];
    }
    var SIZES = [0.06, 0.09, 0.12, 0.15, 0.2, 0.25, 0.3];
    [[0.0747, 0.075, 0.44, '14 ga'], [0.0359, 0.0718, 0.44, '20 ga'], [0.0747, 0.075, 0.5, '14 ga K .5']].forEach(function (g) {
      var T = g[0], R = g[1], KF = g[2];
      (KF === 0.5 ? ['circular'] : ['circular', 'obround', 'rect', 'tear']).forEach(function (type) {
        test('rfMJ: ' + g[3] + ' box, Butt Closed Corners (bend region closed) + ' + type + ' Corner Relief ' + (type === 'tear' ? '' : SIZES.join(' / ') + ' ') +
          '(were open or left a sliver loop): closed, one flat loop, folded volume and flat area = the closed forms to 1e-6', function () {
          var b0 = rfMJbaseOf(T, R, KF), worstV = 0, worstA = 0;
          (type === 'tear' ? [0.12] : SIZES).forEach(function (sz) {
            var label = type + ' ' + sz, r = build(rfMJbox(T, R, KF, { cornerType: 'butt', gap: 0.01, closeBend: true }) + rfMJrelief(T, R, sz, type));
            rfMJclosed(r, label);
            var fl = K.flatPattern(r.model, r.build, r.mesh), x = rfMJexpect(T, R, KF, type, sz);
            assert(fl.loops.length === 1, label + ': flat loops ' + fl.loops.length + ' (' + fl.loops.slice(1).map(function (l) { return Math.abs(K.signedArea(l)).toExponential(2); }).join(', ') + ')');
            var eV = r.mp.volume / (b0.vol - x.vol) - 1, eA = rfMJarea(fl) / (b0.flat - x.flat) - 1;
            assert(Math.abs(eV) < 1e-6, label + ': folded volume ' + r.mp.volume.toFixed(9) + ', expected ' + (b0.vol - x.vol).toFixed(9));
            assert(Math.abs(eA) < 1e-6, label + ': flat area ' + rfMJarea(fl).toFixed(9) + ', expected ' + (b0.flat - x.flat).toFixed(9));
            worstV = Math.max(worstV, Math.abs(eV)); worstA = Math.max(worstA, Math.abs(eA));
            if (type === 'circular' && sz === 0.12) {
              var c = DxfCheck.check(K.exportDXFFlat(fl, 'in', { version: 'R2000' }), { units: 'in' });
              assert(c.ok && c.loops.filter(function (l) { return l.layer === 'OUTLINE' && l.closed; }).length === 1 && !Object.keys(c.counts).some(function (k) { return /@HOLES$/.test(k); }), label + ': DXF ' + JSON.stringify(c.counts));
            }
          });
          return 'worst volume ' + worstV.toExponential(1) + ', flat ' + worstA.toExponential(1);
        });
      });
    });

    test('rfMJ: the same boxes with Overlap / Underlap corners and with the bend region open, Circular and Obround reliefs 0.12 / 0.2: closed (were 3 to 33 open edges)', function () {
      var n = 0;
      [[0.0747, 0.075], [0.0359, 0.0718]].forEach(function (g) {
        [{ cornerType: 'butt', gap: 0.01, closeBend: false }, { cornerType: 'overlap', gap: 0.01, closeBend: true }, { cornerType: 'underlap', gap: 0.01, closeBend: true }].forEach(function (cc) {
          ['circular', 'obround'].forEach(function (type) {
            [0.12, 0.2].forEach(function (sz) {
              var r = build(rfMJbox(g[0], g[1], 0.44, cc) + rfMJrelief(g[0], g[1], sz, type));
              rfMJclosed(r, g[0] + ' ' + cc.cornerType + (cc.closeBend ? '' : ' open') + ' ' + type + ' ' + sz);
              n++;
            });
          });
        });
      });
      return n + ' boxes';
    });

    test('rfMJ: rfGA G13 (4 × 3 × 2 box, R 0.5 / R 0.25 rounds, shell 0.1): the shell closes on the shell guard\'s first attempt, exact volume', function () {
      var r = build('p.units("in");\np.sketch("Top").centerRect(0, 0, 4, 3).end().extrude(2);\np.fillet(0.5, [[2, 1, 1.5], [2, 1, -1.5], [-2, 1, 1.5], [-2, 1, -1.5]]);\np.fillet(0.25, [[0, 0, 1.5]]);\np.shell(0.1, [[0, 2, 0]]);\n');
      var g = K.shellGuard.last;
      rfMJclosed(r, 'G13');
      assert(g && g.tries === 1 && g.open[0] === 0, 'shell guard: ' + JSON.stringify(g) + ' (a second attempt means the first one cracked)');
      nearRel(r.mp.volume, 3.503599424, 1e-8, 'volume');
      return 'tries ' + g.tries;
    });

    function rfMJtray(T, R) {
      return 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    }
    function rfMJfaces(T, R) { return [[T / 2, 0.6, R + T], [4 - T / 2, 0.6, R + T], [4 - R - T, 0.6, 3 - T / 2], [T / 2, 0.6, 3 - R - T]]; }
    function rfMJcc(fs, type, cb, one) { var o = { cornerType: type, gap: 0.01, closeBend: cb }; if (one) o.coplanar = false; return 'p.closedCorner(' + JSON.stringify(fs) + ', ' + JSON.stringify(o) + ');\n'; }

    test('rfMJ: 20 ga R 0.0718 tray, Butt / Overlap / Underlap Closed Corner with the bend region closed and open, each corner alone and all four (Butt closed was 2 to 4 non-manifold edges): closed', function () {
      var T = 0.0359, R = 0.0718, F = rfMJfaces(T, R), n = 0;
      ['butt', 'overlap', 'underlap'].forEach(function (type) {
        [true, false].forEach(function (cb) {
          for (var i = 0; i < 4; i++) { rfMJclosed(build(rfMJtray(T, R) + rfMJcc([F[i]], type, cb, true)), type + (cb ? ' closed' : ' open') + ' corner ' + i); n++; }
          rfMJclosed(build(rfMJtray(T, R) + rfMJcc(F, type, cb)), type + (cb ? ' closed' : ' open') + ' all four'); n++;
        });
      });
      return n + ' trays';
    });

    [[0.0359, 0.0718, '20 ga'], [0.0747, 0.075, '14 ga']].forEach(function (g) {
      test('rfMJ: ' + g[2] + ' tray, a Normal Cut hole at the very corner of a closed corner (Butt closed / open bend region, Overlap; was open in a quarter of the probes): closed, the hole in the flat', function () {
        var T = g[0], R = g[1], F = rfMJfaces(T, R), P = R + T, n = 0;
        [['butt', true], ['butt', false], ['overlap', true]].forEach(function (v) {
          [[P, P, 0.05], [P, P, 0.1], [P, P, 0.2], [P / 2, P / 2, 0.1], [P / 2, P / 2, 0.2], [P, 0.02, 0.1], [P, 0.02, 0.2]].forEach(function (h) {
            var label = v[0] + (v[1] ? ' closed' : ' open') + ' r ' + h[2] + ' at ' + h[0].toFixed(3) + ', ' + h[1].toFixed(3);
            var r = build(rfMJtray(T, R) + rfMJcc(F, v[0], v[1]) + 'p.sketch("Top", ' + T + ').circle(' + h[0] + ', ' + (-h[1]) + ', ' + h[2] + ').cut("through", { reverse: true, normalCut: true });\n');
            rfMJclosed(r, label);
            n++;
          });
        });
        return n + ' holes';
      });
    });

    test('rfMJ: Normal Cut Ø0.5 hole across the bend of an L bracket (14 ga, K 0.5), on the bend line, off it and at the bend\'s ends: closed; on the bend line the flat hole = the footprint on the inside surface, developed (1e-9)', function () {
      var T = 0.0747, R = 0.075, r0 = 0.25, BA = Math.PI / 2 * (R + T / 2), out = [];
      var L = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
      var a = build(L), fa = rfMJarea(K.flatPattern(a.model, a.build, a.mesh));
      // the sketch circle is a 32-gon; d across the bend from its centre on the bend line: its half width at d, and the
      // footprint on the inside cylinder (d = R sin θ) laid out by angle, straight between the facet lines and the
      // 32-gon's corners (as the faceted bend holds it)
      function half(d) { var j = Math.min(7, Math.floor(Math.asin(Math.min(1, d / r0)) / (Math.PI / 16))), a0 = j * Math.PI / 16, a1 = a0 + Math.PI / 16, f = (d - r0 * Math.sin(a0)) / (r0 * Math.sin(a1) - r0 * Math.sin(a0)); return r0 * Math.cos(a0) + (r0 * Math.cos(a1) - r0 * Math.cos(a0)) * f; }
      var th = [], k;   // [angle, half width there]
      for (k = 0; k <= 8; k++) th.push([Math.PI / 2 * k / 8, half(R * Math.sin(Math.PI / 2 * k / 8))]);
      // (a corner of the 32-gon inside a facet stands on the facet's chord: its angle is that chord point's)
      for (k = 1; k < 8; k++) {
        var dk = r0 * Math.sin(k * Math.PI / 16);
        if (!(dk < R)) continue;
        var zk = Math.floor(Math.asin(dk / R) / (Math.PI / 16)), ta = zk * Math.PI / 16, tb = ta + Math.PI / 16, fk = (dk - R * Math.sin(ta)) / (R * Math.sin(tb) - R * Math.sin(ta));
        th.push([Math.atan2(dk, R * Math.cos(ta) + fk * (R * Math.cos(tb) - R * Math.cos(ta))), r0 * Math.cos(k * Math.PI / 16)]);
      }
      th.sort(function (x, y) { return x[0] - y[0]; });
      var strip = 0;
      for (k = 0; k + 1 < th.length; k++) strip += (th[k][1] + th[k + 1][1]) * (th[k + 1][0] - th[k][0]) * BA / (Math.PI / 2);
      var want = 16 * r0 * r0 * Math.sin(Math.PI / 16) / 2 + strip;   // half the 32-gon on the face + the strip's part
      [[2, R + T], [2, 0.1], [0.1, R + T], [3.95, 0.12]].forEach(function (h, i) {
        var r = build(L + 'p.sketch("Top", ' + T + ').circle(' + h[0] + ', ' + (-h[1]) + ', ' + r0 + ').cut("through", { reverse: true, normalCut: true });\n');
        rfMJclosed(r, 'hole at ' + h.join(', '));
        var fl = K.flatPattern(r.model, r.build, r.mesh), hole = fa - rfMJarea(fl), dv = (a.mp.volume - r.mp.volume) / T;
        if (i === 0) near(hole, want, 1e-9, 'flat hole area');
        // (the hole's wall inside the bend is flat between the chords while the bend's faces count as true cylinders:
        // Mass Properties is up to 0.4 % of the hole off the developed area, rfFT VOLTODO M26)
        assert(Math.abs(dv - hole) < 4e-3 * hole, 'hole at ' + h.join(', ') + ': removed volume / T ' + dv.toFixed(6) + ', flat hole ' + hole.toFixed(6));
        out.push(hole.toFixed(6));
      });
      return 'flat hole areas ' + out.join(', ');
    });
  })();
  // --- end rfMJ ---
