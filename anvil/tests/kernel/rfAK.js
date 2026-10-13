  // ---- rfAK (2026-10-12): Split Entities on splines and style splines; Tangent on a style spline's control polygon leg
  (function () {
    group('rfAK: Split Entities on a spline / style spline, asymmetric tangent weighting, Tangent on a control polygon leg');
    var SS = SketchSolver;
    function rfAKDev(orig, pieces) {   // the farthest the original curve gets from the pieces
      var fo = SS.freeCurve(orig), m = 0;
      for (var k = 0; k <= 300; k++) {
        var p = fo.pt(fo.t0 + (fo.t1 - fo.t0) * k / 300), best = Infinity;
        pieces.forEach(function (e) { best = Math.min(best, SS.freeClosest(SS.freeCurve(e), p).d); });
        m = Math.max(m, best);
      }
      return m;
    }
    function rfAKCopy(o) { return JSON.parse(JSON.stringify(o)); }
    var WAVE = { t: 'spline', pts: [[0, 0], [1, 1], [2, 0.5], [3, 1.5], [4, 0]] };
    test('rfAK: an open spline split at one and at two points: the pieces are exactly the curve it was (the cut spans too), joined end to end by Coincident; at its own point; a click at an end or one point on a closed spline is refused with the sketch unchanged', function () {
      var out = [];
      [[[1.6, 0.8]], [[1.6, 0.8], [3.5, 1]], [[2, 0.5]]].forEach(function (pts, n) {
        var f = { entities: [{ t: 'line', x1: -5, y1: -5, x2: -4, y2: -5 }, rfAKCopy(WAVE)] }, r = SS.freeSplit(f, 1, pts);
        assert(r.ok && r.pieces.length === pts.length + 1 && f.entities.length === pts.length + 2, n + ': ' + JSON.stringify(r));
        var pcs = r.pieces.map(function (i) { return f.entities[i]; }), dv = rfAKDev(WAVE, pcs);
        assert(dv < 1e-5, n + ': the pieces lie on the original curve: ' + dv);
        pcs.forEach(function (e, j) { assert(e.t === 'spline' && !e.style && e.pts.length >= 2, n + ': piece ' + j); });
        for (var j = 0; j + 1 < pcs.length; j++) {
          var a = pcs[j].pts[pcs[j].pts.length - 1], b = pcs[j + 1].pts[0];
          assert(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-12, n + ': pieces meet');
          assert((f.rels || []).some(function (x) { return x.type === 'coincident' && x.refs.join() === (r.pieces[j] + '.p2,' + r.pieces[j + 1] + '.p1'); }), n + ': Coincident ' + JSON.stringify(f.rels));
          // the same direction leaving the split point on both sides (tangent continuity kept)
          var ta = pcs[j].tans[pcs[j].tans.length - 1], tb = pcs[j + 1].tans[0];
          near(ta[0], tb[0], 1e-9, n + ': the same tangent angle on both sides');
        }
        var an = SS.analyze(f);
        assert(an.redundant === 0 && an.conflicts === 0, n + ': not over-defined ' + JSON.stringify([an.redundant, an.conflicts]));
        out.push(dv.toExponential(1));
      });
      var g = { entities: [rfAKCopy(WAVE)] }, before = JSON.stringify(g);
      var r1 = SS.freeSplit(g, 0, [[0, 0]]);
      assert(!r1.ok && /away from its ends/.test(r1.error) && JSON.stringify(g) === before, 'an end: refused');
      var c = { entities: [{ t: 'spline', closed: true, pts: [[0, 0], [2, 0], [2, 2], [0, 2]] }] }, cb = JSON.stringify(c);
      var r2 = SS.freeSplit(c, 0, [[1, -0.3]]);
      assert(!r2.ok && /two points/.test(r2.error) && JSON.stringify(c) === cb, 'a closed spline needs two points');
      var orig = rfAKCopy(c.entities[0]), r3 = SS.freeSplit(c, 0, [[1, -0.3], [1, 2.3]]);
      assert(r3.ok && c.entities.length === 2 && !c.entities[0].closed && !c.entities[1].closed, 'closed: two open splines');
      assert(rfAKDev(orig, c.entities) < 1e-5, 'closed: on the original curve ' + rfAKDev(orig, c.entities));
      assert((c.rels || []).filter(function (x) { return x.type === 'coincident'; }).length === 2, 'closed: two Coincidents ' + JSON.stringify(c.rels));
      return out.join(', ');
    });
    test('rfAK: a style spline split is two style splines of its degree (its own Bézier sub-spans, exactly) joined by Coincident and Tangent; moving a vertex next to the join keeps the end legs in line', function () {
      [[[0, 0], [1, 2], [3, 2], [4, 0]], [[0, 0], [1, 2], [2, 3], [3, 2], [4, 1], [5, 0]]].forEach(function (P) {
        var e = { t: 'spline', style: true, pts: P }, f = { entities: [rfAKCopy(e)] }, r = SS.freeSplit(f, 0, [K.bzPoint(P, 0.4)]);
        assert(r.ok && f.entities.length === 2, 'split ' + JSON.stringify(r));
        f.entities.forEach(function (q) { assert(q.style && q.pts.length === P.length, 'degree ' + (P.length - 1)); });
        assert(rfAKDev(e, f.entities) < 1e-5, 'exact: ' + rfAKDev(e, f.entities));
        assert((f.rels || []).some(function (x) { return x.type === 'tangent' && x.refs.join() === '0,1'; }), 'Tangent ' + JSON.stringify(f.rels));
        var an = SS.analyze(f);
        assert(an.redundant === 0 && an.conflicts === 0, 'not over-defined');
        // drag the second piece's first inner vertex: the first piece's last leg turns with it
        f.entities[1].pts[1][1] += 0.5;
        SS.solve(f, { mob: { 1: 1e-4 } });
        var A = f.entities[0].pts, B = f.entities[1].pts, la = [A[A.length - 1][0] - A[A.length - 2][0], A[A.length - 1][1] - A[A.length - 2][1]], lb = [B[1][0] - B[0][0], B[1][1] - B[0][1]];
        assert(Math.abs(la[0] * lb[1] - la[1] * lb[0]) < 1e-6 * Math.hypot(la[0], la[1]) * Math.hypot(lb[0], lb[1]), 'end legs in line after the move');
      });
      return 'degree 3 and 5';
    });
    test('rfAK: tans [angle, weight, weightIn] give the arriving span its own speed (splineGeom), mirror / script keep it; generateScript writes a split spline (and Maintain internal continuity off) and runScript reads back the same entities', function () {
      var g = K.splineGeom({ t: 'spline', pts: [[0, 0], [1, 0], [2, 0]], tans: [null, [90, 1, 2], null] });
      near(g.bez[0][2][1], 0 - 1 / 3 * 2, 1e-12, 'arriving: weightIn 2 over the chord 1');
      near(g.bez[1][1][1], 0 + 1 / 3 * 1, 1e-12, 'leaving: weight 1');
      var m = K.newModel('rfAKs');
      K.runScript(m, 'p.sketch("Front").spline(' + JSON.stringify(WAVE.pts) + ', false).spline([[0, 3], [1, 4], [2, 3.5], [3, 4.2]], false, null, { local: true });');
      var f = m.features[0];
      assert(f.entities[1].local === true, 'local from the script');
      assert(SS.freeSplit(f, 0, [[1.6, 0.8]]).ok, 'split');
      var src = K.generateScript(m);
      assert(src.indexOf('{ local: true }') >= 0 && /\.spline\(\[\[0,0\],\[1,1\],\[1\.527573,0\.694994\]\], false, \[null,\[[^\]]+,[^\]]+,[^\]]+\]/.test(src), 'script ' + src);
      var m2 = K.newModel('rfAKs2');
      K.runScript(m2, src);
      assert(JSON.stringify(m2.features[0].entities) === JSON.stringify(f.entities), 'same entities: ' + JSON.stringify(m2.features[0].entities) + ' vs ' + JSON.stringify(f.entities));
      assert(JSON.stringify(m2.features[0].rels) === JSON.stringify(f.rels), 'same relations');
      return 'round trip';
    });
    test('rfAK: a closed spline profile split in two still extrudes to the same volume', function () {
      var m = K.newModel('rfAKv');
      K.runScript(m, 'p.sketch("Front").spline([[0, 0], [4, -0.5], [5, 3], [1, 4]], true).extrude(2);');
      var v0 = K.massProps(K.meshFromBody(K.rebuild(m).body), 1).volume, f = m.features[0];
      var r = SS.freeSplit(f, 0, [[2, -0.6], [3, 3.9]]);
      assert(r.ok && f.entities.length === 2, 'split');
      var b = K.rebuild(m);
      noErrors({ errors: b.errors });
      var v1 = K.massProps(K.meshFromBody(b.body), 1).volume;
      nearRel(v1, v0, 1e-5, 'volume');
      return v0.toFixed(5) + ' -> ' + v1.toFixed(5);
    });
    test('rfAK: a style spline\'s control polygon leg (\'0.e1\') is a line for relations: Tangent to a line (along it) and to an arc at a shared vertex (square to the radius) are offered and hold; two plain lines are never Tangent', function () {
      var s = { entities: [{ t: 'line', x1: -3, y1: 0, x2: 0, y2: 0 }, { t: 'spline', style: true, pts: [[0, 0], [1, 0.5], [3, 2], [4, 0]] }, { t: 'arc', cx: 4, cy: -2, r: 2, a0: 0, a1: 90 }], rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }] };
      assert(SS.refKind(s, '1.e0') === 'line' && SS.refKind(s, '1.e3') === null, 'legs 0..2 are lines');
      assert(SS.refName(s, '1.e1') === 'Spline2 control polygon line 2', SS.refName(s, '1.e1'));
      assert(SS.applicable(s, ['1.e0', '0']).indexOf('tangent') >= 0, 'leg + line: Tangent offered');
      assert(SS.applicable({ entities: [s.entities[0], { t: 'line', x1: 0, y1: 1, x2: 1, y2: 2 }] }, ['0', '1']).indexOf('tangent') < 0, 'two lines: no Tangent');
      assert(SS.addRelation(s, 'tangent', ['1.e0', '0']).status === 'ok', 'added');
      var P = s.entities[1].pts, L = s.entities[0], d = [P[1][0] - P[0][0], P[1][1] - P[0][1]], ld = [L.x2 - L.x1, L.y2 - L.y1];
      assert(Math.abs(d[0] * ld[1] - d[1] * ld[0]) < 1e-9 * Math.hypot(d[0], d[1]) * Math.hypot(ld[0], ld[1]), 'first leg along the line');
      s.rels.push({ type: 'coincident', refs: ['1.p2', '2.p2'] });
      assert(SS.applicable(s, ['1.e2', '2']).indexOf('tangent') >= 0, 'leg + arc: Tangent offered');
      assert(SS.addRelation(s, 'tangent', ['1.e2', '2']).status === 'ok', 'added to the arc');
      P = s.entities[1].pts; var A = s.entities[2], q = P[3], leg = [P[3][0] - P[2][0], P[3][1] - P[2][1]], rad = [q[0] - A.cx, q[1] - A.cy];
      assert(Math.abs(leg[0] * rad[0] + leg[1] * rad[1]) < 1e-7 * Math.hypot(leg[0], leg[1]) * Math.hypot(rad[0], rad[1]), 'last leg square to the radius at the shared vertex');
      var src = K.generateScript({ name: 'x', features: [{ id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: s.entities, rels: s.rels }] });
      assert(src.indexOf('"1.e0"') >= 0 && src.indexOf('"1.e2"') >= 0, 'the leg relations are scripted');
      return 'tangent to a line and an arc';
    });
  })();
  // --- end rfAK ---

