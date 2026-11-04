  // --- rfHP (2026-11-04, lane sw-sketch): sketch tools against numbers measured on a live SolidWorks 2022 over its API
  // (test-reports/2026-11-04-sketch-solidworks.md). Autodimension rows sit Document Properties ▸ Dimensions ▸ Offset
  // distances off the sketch (10 mm from the model, 6 mm between rows); Segment divides splines at equal arc length; a
  // DXF with blocks written by SolidWorks comes in as block instances. ---
  (function () {
    group('rfHP: sketch tools vs a live SolidWorks (Autodimension offsets, Segment on splines, SolidWorks DXF blocks)');
    var S = SketchSolver;
    function rfHPRect() { return { entities: [{ t: 'rect', x: 1, y: 1, w: 4, h: 2 }, { t: 'circle', cx: 3, cy: 2, r: 0.25 }] }; }
    function rfHPSine() { var e = { t: 'spline', pts: [] }; for (var k = 0; k < 9; k++) e.pts.push([0.5 * k, 0.5 * Math.sin(0.5 * k)]); return e; }
    function rfHPDist(f, dir) { return f.rels.filter(function (r) { return r.type === 'distance' && r.dir === dir; }).sort(function (a, b) { return a.v - b.v; }); }

    test('rfHP: Autodimension Baseline, inch document: rows 0.3937 / 0.6299 / 0.8661 in off the sketch box with the origin, nearest value first (SolidWorks: D2 1.0, D3 3.0, D4 5.0 at y -0.3937, -0.6299, -0.8661; D5-D7 at x -0.3937 …)', function () {
      var f = rfHPRect(), r = S.fullyDefine(f, { hScheme: 'baseline', vScheme: 'baseline', units: 'in' });
      assert(r.status === 'full', 'status ' + r.status);
      var h = rfHPDist(f, 'h'), v = rfHPDist(f, 'v');
      assert(h.map(function (q) { return q.v; }).join() === '1,3,5' && v.map(function (q) { return q.v; }).join() === '1,2,3', 'values h ' + h.map(function (q) { return q.v; }) + ' v ' + v.map(function (q) { return q.v; }));
      [-0.3937, -0.6299, -0.8661].forEach(function (o, k) { near(h[k].off, o, 1e-9, 'horizontal row ' + k); near(v[k].off, -o, 1e-9, 'vertical row ' + k); });
      assert(f.dims && f.dims.length === 1 && f.dims[0].k === 'dia', 'the Ø .500 ' + JSON.stringify(f.dims));
    });
    test('rfHP: Autodimension offsets: Chain in one row 0.3937 in off, Ordinate base 0.3937 in off, millimetres 10 / 6, a given gap or the UI floor still wins', function () {
      var f = rfHPRect();
      S.fullyDefine(f, { hScheme: 'chain', vScheme: 'chain', units: 'in' });
      var Y = { 'O': 0, '0.v0': 1, '1.c': 2 }, hc = rfHPDist(f, 'h');
      assert(hc.length === 3, 'chain ' + JSON.stringify(hc));
      hc.forEach(function (q) { near(Y[q.refs[0]] + q.off, -0.3937, 1e-9, 'chain row ' + JSON.stringify(q)); });
      f = rfHPRect();
      S.fullyDefine(f, { hScheme: 'ordinate', vScheme: 'ordinate', units: 'in' });
      assert(f.rels.filter(function (q) { return q.ord; }).every(function (q) { return Math.abs(q.ordAt + 0.3937) < 1e-9; }), 'ordinate ' + JSON.stringify(f.rels));
      var g = S.placeGaps({ units: 'mm' }, [0, 0], [100, 50]);
      assert(g[0] === 10 && g[1] === 6, 'mm ' + g);
      g = S.placeGaps({ units: 'in', minGap: 0.3 }, [0, 0], [5, 3]);
      near(g[0], 10 / 25.4, 1e-12, 'first'); near(g[1], 0.3, 1e-12, 'floor');
      g = S.placeGaps({ gap: 2, units: 'in' }, [0, 0], [5, 3]);
      assert(g[0] === 2 && g[1] === 2, 'gap ' + g);
      g = S.placeGaps({}, [0, 0], [10, 5]);
      near(g[0], 0.8, 1e-12, 'no units: 8 % of the size');
    });
    test('rfHP: Segment on a spline: equal arc length, as SolidWorks (sine spline, 5 pieces: points within .001 in of SolidWorks\' 0.7776,.3509 / 1.6134,.4994 / 2.4439,.3212 / 3.2179,-.0382; 4 pieces split at 0.9810 / 2.0363 / 3.0269)', function () {
      var sk = { entities: [rfHPSine()] }, r = S.segmentEntity(sk, 0, 5);
      assert(r.ok, r.error);
      var SW = [[0.777643, 0.350942], [1.613434, 0.499438], [2.443895, 0.321221], [3.217862, -0.038175]];
      assert(r.points.length === 4 && r.added.length === 4, 'points ' + JSON.stringify(r.points));
      SW.forEach(function (p, k) { near(r.points[k][0], p[0], 1e-3, 'x' + k); near(r.points[k][1], p[1], 1e-3, 'y' + k); });
      assert(sk.rels.length === 4 && sk.rels.every(function (q) { return q.type === 'coincident' && q.refs[1] === '0'; }), 'on the spline ' + JSON.stringify(sk.rels));
      var an = S.analyze(sk);
      assert(!an.conflicts, 'conflicts');
      // equal arc length on Anvil's own curve
      var e0 = rfHPSine(), fc = S.freeCurve(e0), L = S.freeEqualLength(e0, 2).L, last = 0, parts = [];
      near(L, 4.26854, 5e-4, 'length (SolidWorks 4.26854)');
      r.points.concat([e0.pts[8]]).forEach(function (p) {
        var t = S.freeClosest(fc, p).t, s = 0, N = 2000;
        for (var k = 0; k < N; k++) { var a = fc.pt(t * k / N), b = fc.pt(t * (k + 1) / N); s += Math.hypot(b[0] - a[0], b[1] - a[1]); }
        parts.push(s - last); last = s;
      });
      parts.forEach(function (q, k) { near(q, L / 5, 1e-4, 'piece ' + k); });
      sk = { entities: [rfHPSine()] };
      r = S.segmentEntity(sk, 0, 4, { split: true });
      assert(r.ok && sk.entities.length === 4 && sk.entities.every(function (q) { return q.t === 'spline'; }), 'split ' + (r.error || sk.entities.length));
      [[0.981008, 0.415551], [2.036333, 0.446819], [3.026928, 0.057195]].forEach(function (p, k) { near(r.points[k][0], p[0], 1e-3, 'split x' + k); near(r.points[k][1], p[1], 1e-3, 'split y' + k); });
      for (var k = 0; k + 1 < 4; k++) { var a = sk.entities[k].pts, b = sk.entities[k + 1].pts; near(Math.hypot(a[a.length - 1][0] - b[0][0], a[a.length - 1][1] - b[0][1]), 0, 1e-9, 'pieces join ' + k); }
    });
    test('rfHP: Segment on an ellipse: 4 points at its quadrants (closed: n points, the first at its start); a parabola-free entity still refused', function () {
      var sk = { entities: [{ t: 'ellipse', cx: 0, cy: 0, rx: 2, ry: 1, rot: 0 }] }, r = S.segmentEntity(sk, 0, 4);
      assert(r.ok && r.points.length === 4, r.error);
      [[2, 0], [0, 1], [-2, 0], [0, -1]].forEach(function (p, k) { near(r.points[k][0], p[0], 1e-9, 'x' + k); near(r.points[k][1], p[1], 1e-9, 'y' + k); });
      sk = { entities: [{ t: 'rect', x: 0, y: 0, w: 1, h: 1 }] };
      assert(!S.segmentEntity(sk, 0, 3).ok, 'a rectangle is not segmented');
    });
    test('rfHP: a DXF with blocks as SolidWorks 2022 writes it (BLOCK Block1 at 0,0; INSERT at 8,4 scale 1.5 angle 30 and at 2,2): two instances of one definition, geometry where SolidWorks put it', function () {
      function rec(code, v) { return code + '\n' + v + '\n'; }
      var blk = rec(0, 'BLOCK') + rec(8, '0') + rec(2, 'Block1') + rec(70, 0) + rec(10, '0.0') + rec(20, '0.0') + rec(30, '0.0') + rec(3, 'Block1') +
        rec(0, 'CIRCLE') + rec(8, '0') + rec(10, '1.0') + rec(20, '0.5') + rec(30, '0.0') + rec(40, '0.2499999999999999');
      [[0, 0, 2, 0], [2, 0, 2, 1], [2, 1, 0, 1], [0, 1, 0, 0]].forEach(function (l) { blk += rec(0, 'LINE') + rec(8, '0') + rec(10, l[0]) + rec(20, l[1]) + rec(30, 0) + rec(11, l[2]) + rec(21, l[3]) + rec(31, 0); });
      blk += rec(0, 'ENDBLK') + rec(8, '0');
      var txt = rec(0, 'SECTION') + rec(2, 'HEADER') + rec(9, '$INSUNITS') + rec(70, 1) + rec(0, 'ENDSEC') +
        rec(0, 'SECTION') + rec(2, 'BLOCKS') + blk + rec(0, 'ENDSEC') +
        rec(0, 'SECTION') + rec(2, 'ENTITIES') +
        rec(0, 'INSERT') + rec(8, '0') + rec(2, 'Block1') + rec(10, '8.0') + rec(20, '4.0') + rec(30, '0.0') + rec(41, '1.5') + rec(42, '1.5') + rec(43, '1.5') + rec(50, '30.0') +
        rec(0, 'INSERT') + rec(8, '0') + rec(2, 'Block1') + rec(10, '2.0') + rec(20, '2.0') + rec(30, '0.0') +
        rec(0, 'ENDSEC') + rec(0, 'EOF');
      var p = DxfImport.parse(txt, { blocks: true });
      assert(p.units === 'in', 'units ' + p.units);
      var ins = p.entities.filter(function (e) { return e.blkDef != null; });
      assert(ins.length === 2 && ins.every(function (e) { return e.blkDef === 'Block1'; }), 'instances ' + JSON.stringify(ins));
      near(ins[0].x, 8, 1e-12, 'x'); near(ins[0].y, 4, 1e-12, 'y'); near(ins[0].blkAng, 30, 1e-12, 'angle'); near(ins[0].blkS, 1.5, 1e-12, 'scale');
      near(ins[1].blkAng, 0, 1e-12, 'angle 2'); near(ins[1].blkS, 1, 1e-12, 'scale 2');
      var big = p.entities.filter(function (e) { return e.blk === ins[0].blk && e.t === 'line'; }), mx = -Infinity, my = -Infinity;
      big.forEach(function (l) { mx = Math.max(mx, l.x1, l.x2); my = Math.max(my, l.y1, l.y2); });
      near(mx, 10.598076, 1e-6, 'max x (SolidWorks extents 10.598076)'); near(my, 6.799038, 1e-6, 'max y (6.799038)');
      var c = p.entities.filter(function (e) { return e.blk === ins[0].blk && e.t === 'circle'; })[0];
      near(c.r, 0.375, 1e-9, 'scaled circle'); near(c.cx, 8.924038105677, 1e-9, 'circle x');
    });
  })();
