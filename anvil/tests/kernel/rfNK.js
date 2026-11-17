  // --- rfNK (local-2026-11-15b, lane sketchflow round 5) --- the engine side of test-reports/2026-11-15-sketch-flow-5.md:
  // a big pattern's copies named by nothing else are left out of the solve and placed after it (condensePatterns), with
  // the same geometry as the full solve; the doubled distance from a centerline to a parallel line; Min / Max arc
  // conditions
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var S = SketchSolver;
    group('rfNK: condensed pattern solves, doubled line distance, arc conditions');
    function rfNKSk(E, R, D) { return { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: JSON.parse(JSON.stringify(E)), rels: JSON.parse(JSON.stringify(R || [])), dims: JSON.parse(JSON.stringify(D || [])) }; }
    function rfNKSame(a, b, tol) { return a.length === b.length && a.every(function (e, i) { return Object.keys(e).every(function (k) { return typeof e[k] !== 'number' || Math.abs(e[k] - b[i][k]) < tol; }); }); }
    function rfNKPlate(nx, ny) {
      var f = rfNKSk([{ t: 'circle', cx: 1, cy: 1, r: 0.125 }], [{ type: 'fix', refs: ['0.c'] }], [{ e: 0, k: 'dia' }]);
      var r = S.linearPattern(f, [0], { angle1: 0, spacing1: 2.4, count1: nx, angle2: 90, spacing2: 1.15, count2: ny, dimX: true, dimY: true });
      assert(r.ok, r.error);
      return f;
    }

    test('rfNK: a 20 x 20 linear pattern: a spacing change solves to the same holes with and without the copies condensed', function () {
      var f = rfNKPlate(20, 20), g = JSON.parse(JSON.stringify(f));
      assert(f.entities.filter(function (e) { return e.t === 'circle'; }).length === 400, '400 holes');
      var ri = f.rels.map(function (x, i) { return x.type === 'distance' && Math.abs(x.v - 2.4) < 1e-9 ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      assert(ri != null, 'the X spacing dimension');
      var a = S.setRelValue(f, ri, 2.25);
      assert(a.ok, a.error);
      var xs = f.entities.filter(function (e) { return e.t === 'circle'; }).map(function (e) { return e.cx; });
      near(Math.max.apply(null, xs) - Math.min.apply(null, xs), 19 * 2.25, 1e-9, 'columns 2.25 apart');
      g.rels[ri].v = 2.25;
      var b = S.solve(g, { noCondense: true });
      assert(b.ok, 'the full solve');
      assert(rfNKSame(f.entities, g.entities, 1e-7), 'the same geometry');
    });

    test('rfNK: a seed drag in a condensed pattern: every copy follows, a copy carrying a dimension stays a solver unknown', function () {
      var f = rfNKSk([{ t: 'circle', cx: 1, cy: 1, r: 0.125 }], [], [{ e: 0, k: 'dia' }]);
      assert(S.linearPattern(f, [0], { angle1: 0, spacing1: 1, count1: 12, angle2: 90, spacing2: 1, count2: 3, dimX: true, dimY: true }).ok);
      var last = f.entities.length - 1;
      f.dims.push({ e: last, k: 'dia', driven: true });
      var c0 = JSON.parse(JSON.stringify(f.entities));
      var r = S.drag(f, '0.c', [1.5, 1.25], c0);
      assert(r.ok, 'drag');
      var d = [f.entities[0].cx - c0[0].cx, f.entities[0].cy - c0[0].cy];
      assert(Math.hypot(d[0], d[1]) > 0.1, 'the seed moved');
      f.entities.forEach(function (e, i) { if (e.t === 'circle') { near(e.cx - c0[i].cx, d[0], 1e-7, 'copy ' + i + ' x'); near(e.cy - c0[i].cy, d[1], 1e-7, 'copy ' + i + ' y'); } });
    });

    test('rfNK: a distance from a centerline to a parallel line with the doubled condition holds twice the gap', function () {
      var f = rfNKSk([{ t: 'line', x1: 3, y1: -1, x2: 3, y2: 4, construction: true }, { t: 'line', x1: 5, y1: 0, x2: 5, y2: 2 }],
        [{ type: 'vertical', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'fix', refs: ['0'] }]);
      near(S.measure(f, 'distance', ['0', '1'], null, null, ['dbl', 'c']), 4, 1e-12, 'measured doubled');
      var r = S.addRelation(f, 'distance', ['0', '1'], { value: 5, ac: ['dbl', 'c'] });
      assert(r.ok, r.error);
      near(f.entities[1].x1, 5.5, 1e-9, 'the line 2.5 off the centerline');
    });

    test('rfNK: Min and Max arc conditions on a line-to-circle distance', function () {
      var f = rfNKSk([{ t: 'line', x1: 0, y1: 0, x2: 6, y2: 0 }, { t: 'circle', cx: 3, cy: 2, r: 0.5 }]);
      near(S.measure(f, 'distance', ['0', '1'], null, null, ['c', 'max']), 2.5, 1e-12, 'max');
      near(S.measure(f, 'distance', ['0', '1'], null, null, ['c', 'min']), 1.5, 1e-12, 'min');
    });
  })();
