  // --- r15/snapaudit15: what a snapped point commits (SketchSolver.inferCandidates / infer). A test named
  // "(known: …)" pins down an open defect in sketch-solver.js: it asserts today's behaviour and is flipped with the fix.
  (function () {
    group('r15/snapaudit15: inference commits exactly the relation the snap promised');
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    function rl(sk) { return (sk.rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
    function line(a, b) { return { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; }
    test('r15/snapaudit15: one relation per snapped end — a line end on a line end is Coincident, on a line midpoint Midpoint (not also Coincident), on a circle centre Coincident, a circle centre on an arc centre Concentric; each added once and never over-defining', function () {
      var base = [line([0, 0], [40, 0]), { t: 'circle', cx: 60, cy: 0, r: 5 }, { t: 'arc', cx: 0, cy: 30, r: 6, a0: 0, a1: 90 }];
      var cases = [
        [line([40, 0], [40, 20]), 'coincident:3.p1,0.p2 vertical:3'],
        [line([20, 0], [20, -15]), 'midpoint:3.p1,0 vertical:3'],
        [line([60, 0], [70, 12]), 'coincident:3.p1,1.c'],
        [{ t: 'circle', cx: 0, cy: 30, r: 3 }, 'concentric:3,2']
      ];
      cases.forEach(function (c) {
        var sk = { entities: base.map(function (e) { return JSON.parse(JSON.stringify(e)); }).concat([c[0]]) };
        SS.infer(sk, 3);
        var got = rl(sk).sort().join(' ');
        assert(got === c[1], JSON.stringify(c[0]) + ' -> ' + got);
        var an = SS.analyze(sk);
        assert(!an.redundant && !an.conflicts, 'over-defined: ' + got);
      });
    });
    test('r15/snapaudit15: the solver infers on-curve Coincident only for a point the UI put on the curve — the projection onto a line or circle infers it at any scale (10 mm and 100 m), 1e-5 mm off it at 10 mm (0.1 mm at 100 m) does not', function () {
      [1, 1e4].forEach(function (k) {
        var L = line([0, 0], [40 * k, 10 * k]), t = 0.37, P = [L.x1 + t * (L.x2 - L.x1), L.y1 + t * (L.y2 - L.y1)];
        var C = { t: 'circle', cx: 0, cy: 50 * k, r: 7 * k }, a = 1.1, Q = [C.cx + C.r * Math.cos(a), C.cy + C.r * Math.sin(a)];
        function on(pt) { var sk = { entities: [L, C, { t: 'point', x: pt[0], y: pt[1] }] }; return SS.inferCandidates(sk, 2).map(function (c) { return c.type + ':' + c.refs.join(','); }).join(' '); }
        assert(on(P) === 'coincident:2,0', 'scale ' + k + ' on the line: ' + on(P));
        assert(on(Q) === 'coincident:2,1', 'scale ' + k + ' on the circle: ' + on(Q));
        var off = 1e-5 * k;
        assert(on([P[0], P[1] + off]) === '' && on([Q[0] + off, Q[1]]) === '', 'scale ' + k + ' off the curves: ' + on([P[0], P[1] + off]) + ' / ' + on([Q[0] + off, Q[1]]));
      });
    });
    test('r15/snapaudit15: an end at the crossing of two lines gets Coincident with both — the Line tool snaps to the intersection, inferCandidates adds two point-on-line relations', function () {
      var sk = { entities: [line([0, 0], [60, 30]), line([0, 30], [30, 0]), line([20, 10], [20, -20])] };
      var got = SS.inferCandidates(sk, 2).map(function (c) { return c.type + ':' + c.refs.join(','); }).sort().join(' ');
      assert(got === 'coincident:2.p1,0 coincident:2.p1,1 vertical:2', got);
    });
    test('r15/snapaudit15: a line end on a Polygon / Center Rectangle centre infers Coincident (they are sketch points); a Corner Rectangle centre, which is no sketch point, infers nothing', function () {
      [{ t: 'poly', cx: 20, cy: 20, r: 8, n: 6, rot: 0 }, { t: 'crect', cx: 20, cy: 20, w: 10, h: 6 }, { t: 'rect', x: 15, y: 17, w: 10, h: 6 }].forEach(function (shape) {
        var sk = { entities: [shape, line([0, 0], [20, 20])] };
        var got = SS.inferCandidates(sk, 1).map(function (c) { return c.type + ':' + c.refs.join(','); }).join(' ');
        assert(got === (shape.t === 'rect' ? 'coincident:1.p1,O' : 'coincident:1.p1,O coincident:1.p2,0.c'), shape.t + ': ' + got);
      });
    });
  })();
  // --- end r15/snapaudit15 ---

