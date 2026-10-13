  // --- r15/tangent15 ---
  // A line ending (or starting) on a circle / arc square to its radius there infers Tangent with the on-curve Coincident.
  (function () {
    group('r15/tangent15: Line tool tangent to circles and arcs');
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    function types(s) { return SS.inferCandidates(s, s.entities.length - 1).map(function (c) { return c.type + ':' + c.refs.join(','); }).sort().join(' '); }
    function rl(s) { return (s.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }).join(' '); }
    // the tangent points from P to the circle (cx, cy, r): c + r (cos(th ± al), sin(th ± al)), al = acos(r / d)
    function tanPts(P, cx, cy, r) {
      var d = Math.hypot(P[0] - cx, P[1] - cy), th = Math.atan2(P[1] - cy, P[0] - cx), al = Math.acos(r / d);
      return [th + al, th - al].map(function (a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
    }
    test('a line from a free point ending exactly tangent to a circle infers Tangent + the end\'s Coincident (both ok, nothing moves, Under Defined); 1e-3 off the tangent point only the Coincident', function () {
      var P = [30, 7], T = tanPts(P, 2, -1, 10)[0];
      var s = { entities: [{ t: 'circle', cx: 2, cy: -1, r: 10 }, { t: 'line', x1: P[0], y1: P[1], x2: T[0], y2: T[1] }] };
      assert(types(s) === 'coincident:1.p2,0 tangent:1,0', 'exact: ' + types(s));
      var before = JSON.stringify(s.entities), added = SS.infer(s, 1), an = SS.analyze(s);
      assert(added.length === 2 && rl(s) === 'coincident:1.p2,0 tangent:1,0', rl(s));
      assert(an.rels.every(function (x) { return x === 'ok'; }) && !an.redundant && !an.conflicts && an.status === 'under', JSON.stringify(an.rels) + ' ' + an.status);
      var r = SS.solve(s);
      assert(r.ok && r.moved < 1e-9 && JSON.stringify(s.entities) === before, 'moved ' + r.moved);
      // Add Relations ▸ Tangent on the line already exactly tangent (end Coincident on the circle): ok, nothing moves
      var s2 = { entities: JSON.parse(before), rels: [{ type: 'coincident', refs: ['1.p2', '0'] }] }, ad = SS.addRelation(s2, 'tangent', ['1', '0']);
      assert(ad.ok && ad.status === 'ok' && JSON.stringify(s2.entities) === before, 'addRelation ' + ad.status);
      // the end on the circle, 1e-3 rad round from the tangent point: on the circle, not tangent
      var a = Math.atan2(T[1] + 1, T[0] - 2) + 1e-3, Q = [2 + 10 * Math.cos(a), -1 + 10 * Math.sin(a)];
      var s3 = { entities: [{ t: 'circle', cx: 2, cy: -1, r: 10 }, { t: 'line', x1: P[0], y1: P[1], x2: Q[0], y2: Q[1] }] };
      assert(types(s3) === 'coincident:1.p2,0', 'off by 1e-3: ' + types(s3));
      return 'ok';
    });
    test('a line starting on a circle and leaving it along the tangent infers Tangent + Coincident; along the radius only the Coincident; a common tangent of two circles gets both Tangents', function () {
      var a = 0.7, Q = [10 * Math.cos(a), 10 * Math.sin(a)], t = [-Math.sin(a), Math.cos(a)];
      var s = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 10 }, { t: 'line', x1: Q[0], y1: Q[1], x2: Q[0] + 12 * t[0], y2: Q[1] + 12 * t[1] }] };
      assert(types(s) === 'coincident:1.p1,0 tangent:1,0', 'start tangent: ' + types(s));
      SS.infer(s, 1); var an = SS.analyze(s);
      assert(rl(s) === 'coincident:1.p1,0 tangent:1,0' && !an.redundant && !an.conflicts, rl(s));
      var s2 = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 10 }, { t: 'line', x1: Q[0], y1: Q[1], x2: Q[0] * 2, y2: Q[1] * 2 }] };
      assert(types(s2) === 'coincident:1.p1,0', 'radial: ' + types(s2));
      // circles R 10 at (0, 0) and (30, 40): the outer common tangent runs from (-8, 6) to (22, 46)
      var s3 = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 10 }, { t: 'circle', cx: 30, cy: 40, r: 10 }, { t: 'line', x1: -8, y1: 6, x2: 22, y2: 46 }] };
      assert(types(s3) === 'coincident:2.p1,0 coincident:2.p2,1 tangent:2,0 tangent:2,1', 'both ends: ' + types(s3));
      SS.infer(s3, 2); an = SS.analyze(s3);
      assert((s3.rels || []).length === 4 && !an.redundant && !an.conflicts && an.status === 'under', rl(s3) + ' ' + an.status);
      return 'ok';
    });
    test('arcs: a line ending tangent at a point inside the arc\'s sweep infers Tangent + Coincident; the same point outside the sweep infers neither', function () {
      var P = [0, 30], T = tanPts(P, 0, 0, 10);
      // T[1] lies at angle < 90 on the right (th = 90, al = acos(1/3)), T[0] on the left
      var aR = Math.atan2(T[1][1], T[1][0]) * 180 / Math.PI;
      var inArc = { t: 'arc', cx: 0, cy: 0, r: 10, a0: aR - 30, a1: aR + 30 }, outArc = { t: 'arc', cx: 0, cy: 0, r: 10, a0: aR + 20, a1: aR + 120 };
      var s = { entities: [inArc, { t: 'line', x1: P[0], y1: P[1], x2: T[1][0], y2: T[1][1] }] };
      assert(types(s) === 'coincident:1.p2,0 tangent:1,0', 'inside the sweep: ' + types(s));
      SS.infer(s, 1); var an = SS.analyze(s);
      assert(rl(s) === 'coincident:1.p2,0 tangent:1,0' && !an.redundant && !an.conflicts, rl(s));
      var s2 = { entities: [outArc, { t: 'line', x1: P[0], y1: P[1], x2: T[1][0], y2: T[1][1] }] };
      assert(types(s2) === '', 'outside the sweep: ' + types(s2));
      return 'ok';
    });
  })();
  // --- end r15/tangent15 ---

