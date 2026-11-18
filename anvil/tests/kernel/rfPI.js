  // --- rfPI (2026-11-17, lane solidfid5: solids fidelity 5) ---
  // 1. kernel-mesh.js, a round at a boss's root beside a hole (rfFT round 259). (a) The prisms a round's tool is trimmed
  //    by (the hole straight up, the boss kept whole, the plate's outline) carry the cylinder of the wall they follow
  //    (rfPIloopCurves): the hole's wall inside the round was flat chords with no record, 3.9e-6 of the part heavy.
  //    (b) A ball whose resting point on the hole's rim stands still while it runs on (the setback heading straight for
  //    the rim) keeps its surface at once (rfPIfalls): seven rail attempts came out open before the eighth, plain one.
  // 2. exchange.js, a drilled loft read from STEP and drilled again: the reader's volume fix moves a row of a straight
  //    face's interior points as one line (freeVolumeFix rowKey), so the strips between rows stay flat; moved one by
  //    one they lay 1e-7 .. 1e-5 off each other's planes and the next hole cracked (9 open edges) or was refused.
  // 3. exchange.js, STEP out: a hole straight through one slanted flat face is one closed ELLIPSE (the export threw a
  //    TypeError); a hole across the corner of a loft that keeps its facets has chords for a rim, not an ELLIPSE per
  //    facet (OpenCascade: not valid; Anvil's reader refused its own file).
  // 4. kernel-curves.js, boundCorrection compares the one cell sampled before (was 8): the same cells opened.
  (function () {
    group('rfPI: solids fidelity 5: a round beside a hole exact and on the first attempt; a re-read drilled loft drilled again; STEP of holes through slanted faces');
    var X = typeof Exchange !== 'undefined' ? Exchange : null, IN = 'p.units("in");\n';
    function rfPIwith(obj, key, value, fn) { var was = obj[key]; obj[key] = value; try { return fn(); } finally { obj[key] = was; } }
    function rfPIedges(body) { var c = Evaluate.checkBody(body); return c.openEdges.length + c.nonManifoldEdges.length; }
    // plate 6.25 × 2.75 × .375, a boss Ø.5 × .5 at (bx, bz), a through hole of radius rh at (hx, hz), the boss's root
    // rounded R: the round is the torus less the hole straight up (its surface kept). Volume by quadrature over the
    // radius about the boss's axis: height(r) · r · (2π − the hole's arc at r), Gauss-Legendre on pieces between kinks
    function rfPIclosed(bx, bz, rb, hx, hz, rh, R, H) {
      var D = Math.hypot(hx - bx, hz - bz), gx = [-0.9061798459386640, -0.5384693101056831, 0, 0.5384693101056831, 0.9061798459386640], gw = [0.2369268850561891, 0.4786286704993665, 0.5688888888888889, 0.4786286704993665, 0.2369268850561891];
      function alpha(r) { if (r + D <= rh) return Math.PI; if (r + rh <= D || r <= 1e-300) return 0; var c = (r * r + D * D - rh * rh) / (2 * r * D); return c >= 1 ? 0 : c <= -1 ? Math.PI : Math.acos(c); }
      function h(r) { return r < rb ? H : r < rb + R ? R - Math.sqrt(Math.max(0, R * R - (rb + R - r) * (rb + R - r))) : 0; }
      var kinks = [0, rb, rb + R, D - rh, D + rh].filter(function (x) { return x >= 0 && x <= rb + R; }).sort(function (a, b) { return a - b; }), V = 0, N = 1500;
      for (var i = 0; i + 1 < kinks.length; i++) {
        var a = kinks[i], b = kinks[i + 1];
        if (b - a < 1e-15) continue;
        for (var k = 0; k < N; k++) for (var q = 0; q < 5; q++) {
          var t = (k + 0.5 + 0.5 * gx[q]) / N, r = a + (b - a) * (1 - Math.cos(Math.PI * t)) / 2;
          V += gw[q] / (2 * N) * (b - a) * Math.PI * Math.sin(Math.PI * t) / 2 * h(r) * r * (2 * Math.PI - 2 * alpha(r));
        }
      }
      return 6.25 * 2.75 * 0.375 - Math.PI * rh * rh * 0.375 + V;
    }
    function rfPIpart(hz, order) {
      var head = IN + 'p.sketch("Top").rect(0, -2.75, 6.25, 2.75).end().extrude(0.375);\np.sketch("Top", 0.375).circle(4.1143, -0.9035, 0.25).end().extrude(0.5);\n';
      var hole = 'p.sketch("Top", 1.5).circle(4.375, ' + (-hz) + ', 0.25).end().cut("through", { reverse: true });\n', fil = 'p.fillet(0.225, [[4.1143, 0.375, 1.1535]]);\n';
      return head + (order === 'after' ? fil + hole : hole + fil);
    }
    test('rfPI: R.225 at the root of a boss a Ø.5 hole bites (rfFT round 259): built on the guard\'s first attempt as the round\'s own surface less the hole, closed, the closed form to 1e-7 and the same solid as the hole cut after the round (was the eighth attempt, 3.9e-6 heavy: the hole\'s wall inside the round had no cylinder record)', function () {
      var cf = rfPIclosed(4.1143, 0.9035, 0.25, 4.375, 0.4896, 0.25, 0.225, 0.5);
      var r = build(rfPIpart(0.4896)), last = K.openGuard.last, after = build(rfPIpart(0.4896, 'after'));
      noErrors(r);
      assert(rfPIedges(r.body) === 0, 'closed: ' + rfPIedges(r.body));
      assert(last && last.falls && last.plain && last.attempts === 1, 'the guard: ' + JSON.stringify(last));
      nearRel(r.mp.volume, cf, 1e-7, 'volume against the closed form');
      nearRel(r.mp.volume, after.mp.volume, 1e-9, 'the same solid as the hole cut after the round');
      nearRel(r.mp.polygonal.volume, after.mp.polygonal.volume, 1e-12, 'the same facets');
      var old = rfPIwith(K.openGuard, 'loopCurves', false, function () { return rfPIwith(K.openGuard, 'restCheck', false, function () { var b = build(rfPIpart(0.4896)); return { v: b.mp.volume, at: K.openGuard.last.attempts }; }); });
      assert(Math.abs(old.v - cf) / cf > 2e-6 && old.at === 8, 'with both switches off: ' + ((old.v - cf) / cf).toExponential(2) + ', ' + old.at + ' attempts');
      return 'rel ' + ((r.mp.volume - cf) / cf).toExponential(2) + ' on attempt 1 (was ' + ((old.v - cf) / cf).toExponential(2) + ' on attempt ' + old.at + ')';
    });
    test('rfPI: the same round with the hole wholly inside the round\'s ring (.52 from the boss\'s axis): the closed form to 1e-8 (was 3.7e-6)', function () {
      var cf = rfPIclosed(4.1143, 0.9035, 0.25, 4.375, 0.45, 0.25, 0.225, 0.5), r = build(rfPIpart(0.45));
      noErrors(r);
      assert(rfPIedges(r.body) === 0, 'closed: ' + rfPIedges(r.body));
      nearRel(r.mp.volume, cf, 1e-8, 'volume against the closed form');
      var old = rfPIwith(K.openGuard, 'loopCurves', false, function () { return build(rfPIpart(0.45)).mp.volume; });
      assert(Math.abs(old - cf) / cf > 2e-6, 'with the switch off: ' + ((old - cf) / cf).toExponential(2));
      return 'rel ' + ((r.mp.volume - cf) / cf).toExponential(2) + ' (was ' + ((old - cf) / cf).toExponential(2) + ')';
    });
    test('rfPI: a round whose ball does rest on a hole\'s rim still rests there (R.4 beside a Ø.5 hole, SolidWorks 8.8128518: the rails, not the kept surface, which is 1.4e-4 heavier), and the guard says so', function () {
      var r = build(IN + 'p.sketch("Top").centerRect(0, 0, 4, 4).end().extrude(0.5);\np.sketch("Top", 0.5).circle(0, 0, 0.5).end().extrude(1);\np.sketch("Top", 0.5).circle(1, 0, 0.25).end().cut("through", { reverse: true });\np.fillet(0.4, [[0.5, 0.5, 0]]);');
      noErrors(r);
      assert(K.openGuard.last && !K.openGuard.last.falls && !K.openGuard.last.plain, 'the guard: ' + JSON.stringify(K.openGuard.last));
      nearRel(r.mp.volume, 8.8128518, 3e-5, 'SolidWorks');
      return 'rel ' + ((r.mp.volume - 8.8128518) / 8.8128518).toExponential(2);
    });
    // ---------------------------------------------------------------- 2. the second generation
    var rfPILOFT = IN + 'var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).centerRect(0, 0, 4, 4).id();\np.loft([a, b, c]);\n';
    function rfPIhole(pl, x, y, r) { return 'p.sketch("' + pl + '").circle(' + x + ', ' + y + ', ' + r + ').end().extrude(10, { cut: true, both: true });\n'; }
    function rfPIvol(b) { return K.massProps(K.meshFromBody(b.body), 1).volume; }
    function rfPIimport(m) { return X.importFile('rfPI.step', X.exportSTEP(m, K.rebuild(m)), { units: 'in' }); }
    // the loft written and read, drilled by two crossing holes, written and read again: the import to drill again
    function rfPIsecond() {
      var m0 = K.newModel('rfPI'); K.runScript(m0, rfPILOFT);
      var m1 = X.newPartFromImport(rfPIimport(m0));
      K.runScript(m1, rfPIhole('Right', 0, 0.6, 0.25) + rfPIhole('Front', 0, 0.6, 0.25));
      return rfPIimport(m1);
    }
    test('rfPI: a drilled loft read from STEP and drilled again: four further holes each leave a closed body with no error, and a file that reads back closed at the volume to 2e-6 (were 9 and 5 open edges and one refusal as zero-thickness geometry); the re-read faces have no neighbouring facets a hair off each other\'s planes', function () {
      if (!X) fail('exchange.js is not loaded');
      var res = rfPIsecond(), out = [];
      // neighbouring triangles of the re-read body with the far corner 1e-9 .. 1e-5 off the other's plane
      function inBand(body) {
        var m = X.bodyMesh(body), t = m.triangles, P = m.positions, edge = {}, n = 0;
        function pt(i) { return [P[3 * i], P[3 * i + 1], P[3 * i + 2]]; }
        for (var i = 0; i < t.length; i += 3) for (var k = 0; k < 3; k++) { var a = t[i + k], b = t[i + (k + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a; (edge[key] || (edge[key] = [])).push([i, t[i + (k + 2) % 3]]); }
        Object.keys(edge).forEach(function (key) {
          var l = edge[key];
          if (l.length !== 2) return;
          var i0 = l[0][0], a = pt(t[i0]), u = pt(t[i0 + 1]), w = pt(t[i0 + 2]), q = pt(l[1][1]);
          var nx = (u[1] - a[1]) * (w[2] - a[2]) - (u[2] - a[2]) * (w[1] - a[1]), ny = (u[2] - a[2]) * (w[0] - a[0]) - (u[0] - a[0]) * (w[2] - a[2]), nz = (u[0] - a[0]) * (w[1] - a[1]) - (u[1] - a[1]) * (w[0] - a[0]), ln = Math.hypot(nx, ny, nz);
          if (!(ln > 0)) return;
          var d = Math.abs((q[0] - a[0]) * nx + (q[1] - a[1]) * ny + (q[2] - a[2]) * nz) / ln;
          if (d >= 1e-9 && d < 1e-5) n++;
        });
        return n;
      }
      var b0 = K.rebuild(X.newPartFromImport(res)), band = inBand(b0.body);
      assert(band === 0, band + ' pairs of facets in the boolean\'s band');
      [['Front', 0.9, 2.3, 0.2], ['Front', -0.9, 2.3, 0.2], ['Front', 0.9, 2.3, 0.3], ['Right', 0, 2.4, 0.25]].forEach(function (q) {
        var m2 = X.newPartFromImport(res);
        K.runScript(m2, rfPIhole(q[0], q[1], q[2], q[3]));
        var b2 = K.rebuild(m2), v = rfPIvol(b2);
        assert(!Object.keys(b2.errors || {}).length, q.join(' ') + ': ' + JSON.stringify(b2.errors));
        assert(rfPIedges(b2.body) === 0, q.join(' ') + ': the drilled body has ' + rfPIedges(b2.body) + ' open or non-manifold edges');
        assert(v < rfPIvol(b0) - 0.05, q.join(' ') + ': the hole removed ' + (rfPIvol(b0) - v));
        var r2 = X.importFile('rfPI2.step', X.exportSTEP(m2, b2), { units: 'in' }), v2 = rfPIvol(K.rebuild(X.newPartFromImport(r2)));
        assert(r2.stats.openEdges === 0, q.join(' ') + ': the file reads back with ' + r2.stats.openEdges + ' open edges');
        nearRel(v2, v, 2e-6, q.join(' ') + ': read-back volume');
        out.push(((v2 - v) / v).toExponential(1));
      });
      // as it was: every interior point moved on its own
      var old = rfPIwith(X.importOptions, 'rowFix', false, function () {
        var r0 = rfPIsecond(), m2 = X.newPartFromImport(r0), bb = inBand(K.rebuild(m2).body);
        K.runScript(m2, rfPIhole('Front', 0.9, 2.3, 0.2));
        return { band: bb, open: rfPIedges(K.rebuild(m2).body) };
      });
      assert(old.band > 100 && old.open > 0, 'with the switch off: ' + JSON.stringify(old));
      return 'read-back rel ' + out.join(', ') + '; with the rows moved point by point ' + old.band + ' pairs in the band, ' + old.open + ' open edges';
    });
    test('rfPI: the re-read drilled loft keeps its volume with the rows moved as lines (the part\'s to 1e-6, as before)', function () {
      if (!X) fail('exchange.js is not loaded');
      var m0 = K.newModel('rfPI'); K.runScript(m0, rfPILOFT);
      var m1 = X.newPartFromImport(rfPIimport(m0));
      K.runScript(m1, rfPIhole('Right', 0, 0.6, 0.25) + rfPIhole('Front', 0, 0.6, 0.25));
      var v1 = rfPIvol(K.rebuild(m1)), v2 = rfPIvol(K.rebuild(X.newPartFromImport(rfPIimport(m1))));
      var vOld = rfPIwith(X.importOptions, 'rowFix', false, function () { return rfPIvol(K.rebuild(X.newPartFromImport(rfPIimport(m1)))); });
      nearRel(v2, v1, 1e-6, 'read-back volume');
      nearRel(v2, vOld, 1e-8, 'against the points moved one by one');
      return 'rel ' + ((v2 - v1) / v1).toExponential(2) + ' (point by point ' + ((vOld - v1) / v1).toExponential(2) + ')';
    });
    // ---------------------------------------------------------------- 3. STEP out
    function rfPIcount(s, re) { return (s.match(re) || []).length; }
    test('rfPI: a hole straight through the slanted face of a wedge goes to STEP as a cylinder between a circle and one closed ELLIPSE, 7 faces, and reads back closed at the volume to 1e-9 (the export threw a TypeError); two through holes and a blind one: 3 ELLIPSEs', function () {
      if (!X) fail('exchange.js is not loaded');
      var W = IN + 'p.sketch("Front").polyline([[0, 0], [4, 0], [4, 1], [0, 3]], true).end().extrude(3);\n', out = [];
      [[W + 'p.sketch("Top", 4).circle(2, -1.5, 0.4).end().cut("through", { reverse: true });\n', 7, 1],
        [W + 'p.sketch("Top", 4).circle(1, -1, 0.3).circle(3, -2, 0.25).end().cut("through", { reverse: true });\np.sketch("Top", 4).circle(2, -1.5, 0.2).end().cut(3.5, { reverse: true });\n', 10, 3]].forEach(function (c) {
        var r = build(c[0]);
        noErrors(r);
        var s = X.exportSTEP(r.model, r.build), res = X.importFile('rfPI.step', s, { units: 'in' }), v2 = rfPIvol(K.rebuild(X.newPartFromImport(res)));
        assert(rfPIcount(s, /=ADVANCED_FACE\(/g) === c[1] && rfPIcount(s, /=ELLIPSE\(/g) === c[2], 'faces ' + rfPIcount(s, /=ADVANCED_FACE\(/g) + ', ellipses ' + rfPIcount(s, /=ELLIPSE\(/g));
        assert(res.stats.openEdges === 0 && !res.warnings.length, 'open edges ' + res.stats.openEdges + ' ' + res.warnings);
        nearRel(v2, r.mp.volume, 1e-9, 'read-back volume');
        out.push(((v2 - r.mp.volume) / r.mp.volume).toExponential(1));
      });
      return 'read-back rel ' + out.join(', ');
    });
    test('rfPI: a hole across the corner of a spline loft (the loft then keeps its facets): the hole\'s rim is chords of the facets, no ELLIPSE, and the file reads back closed at the volume to 1e-4 (was an ELLIPSE per facet: Anvil\'s reader refused the file, OpenCascade read it as not valid and 1e-2 off)', function () {
      if (!X) fail('exchange.js is not loaded');
      var out = [];
      [['Front', 1, 2, 0.2], ['Top', 1.2, 1.2, 0.2]].forEach(function (q) {
        var r = build(rfPILOFT + rfPIhole(q[0], q[1], q[2], q[3]));
        noErrors(r);
        var s = X.exportSTEP(r.model, r.build), res = X.importFile('rfPI.step', s, { units: 'in' }), v2 = rfPIvol(K.rebuild(X.newPartFromImport(res)));
        assert(rfPIcount(s, /=ELLIPSE\(/g) === 0, q.join(' ') + ': ' + rfPIcount(s, /=ELLIPSE\(/g) + ' ellipses');
        assert(res.stats.openEdges === 0, q.join(' ') + ': open edges ' + res.stats.openEdges);
        nearRel(v2, r.mp.volume, 1e-4, q.join(' ') + ': read-back volume');
        out.push(((v2 - r.mp.volume) / r.mp.volume).toExponential(1));
      });
      return 'read-back rel ' + out.join(', ');
    });
    // ---------------------------------------------------------------- 4. the sample window
    test('rfPI: Mass Properties of a part read from STEP: the bounding-plane search compares the one cell sampled before; it opens the cells and gives the correction, to the last bit, that comparing the last 8 or all of them does', function () {
      if (!X) fail('exchange.js is not loaded');
      assert(K.massOptions.sampleWindow === 1, 'sampleWindow ' + K.massOptions.sampleWindow);
      var r = build(IN + 'p.sketch("Top").polyline([[0, 0], [40, 0], [40, -0.5], [0, -0.3]], true).end().extrude(0.06);\np.sketch("Top", 0.06).circle(0.6, -0.15, 0.03).end().extrude(1, { cut: true, through: true, both: true });\np.linearPattern({ dir: "x", spacing: 1.3, count: 30 });\np.fillet(0.03, [[20, 0.06, 0]]);\n');
      noErrors(r);
      var polys = K.rebuild(X.newPartFromImport(X.importFile('rfPI.step', X.exportSTEP(r.model, r.build), { units: 'in' }))).body.polygons;
      function corr() { var C = K._.cellOps, q0 = C.query, s0 = C.samples, c = K.curveCorrection(polys); return { json: JSON.stringify(c), query: C.query - q0, samples: C.samples - s0 }; }
      var a = corr(), b = rfPIwith(K.massOptions, 'sampleWindow', 8, corr), c = rfPIwith(K.massOptions, 'sampleWindow', Infinity, corr);
      assert(a.json === b.json && a.json === c.json, 'the correction differs');
      assert(a.query === b.query && a.query === c.query && a.samples === c.samples && a.samples > 0, 'cells opened ' + a.query + ' / ' + b.query + ' / ' + c.query);
      return a.samples + ' samples, ' + a.query + ' cells opened all three ways';
    });
  })();
