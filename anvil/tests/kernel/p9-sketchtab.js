  // --- p9-sketchtab: Line Properties / Rectangle / Point values drive the geometry through the solver
  // (SketchSolver.driveEntity), and the 3 Point Corner / 3 Point Center Rectangle and Parallelogram tools make four lines
  // with Coincident corners, Parallel sides and (rectangles) a Perpendicular corner (ui-sketch-lines.js) ---
  (function () {
    group('p9-sketchtab: driven entity values, 3 Point rectangles and parallelograms as related lines');
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    function copy(o) { return JSON.parse(JSON.stringify(o)); }
    // the relations ui-sketch-lines.js gives four lines through corners K (counter-clockwise)
    function quad(K, perp) {
      var s = { entities: [], rels: [] };
      for (var k = 0; k < 4; k++) s.entities.push({ t: 'line', x1: K[k][0], y1: K[k][1], x2: K[(k + 1) % 4][0], y2: K[(k + 1) % 4][1] });
      for (k = 0; k < 4; k++) s.rels.push({ type: 'coincident', refs: [k + '.p2', ((k + 1) % 4) + '.p1'] });
      s.rels.push({ type: 'parallel', refs: ['0', '2'] }, { type: 'parallel', refs: ['1', '3'] });
      if (perp) s.rels.push({ type: 'perpendicular', refs: ['0', '1'] });
      return s;
    }
    function script(s, depth) {
      var c = 'p.sketch("Front")';
      s.entities.forEach(function (e) { c += '.line(' + [e.x1, e.y1, e.x2, e.y2].join(', ') + ')'; });
      s.rels.forEach(function (r) { c += '.rel("' + r.type + '", ' + JSON.stringify(r.refs) + ')'; });
      return c + '.extrude(' + depth + ');';
    }
    test('driveEntity: a line\'s End X moves it along its Horizontal relation; a Start Y the origin Coincident holds is refused with the sketch unchanged', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }], rels: [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['0.p1', 'O'] }] };
      var r = SS.driveEntity(s, 0, 1, function (E) { return [E[0].x2 - 55]; }, { guess: function (E) { E[0].x2 = 55; } });
      assert(r.ok, 'End X refused: ' + r.error);
      near(s.entities[0].x2, 55, 1e-9, 'x2'); near(s.entities[0].y2, 0, 1e-9, 'y2'); near(s.entities[0].x1, 0, 1e-9, 'x1');
      var before = copy(s.entities);
      r = SS.driveEntity(s, 0, 1, function (E) { return [E[0].y1 - 5]; }, { guess: function (E) { E[0].y1 = 5; } });
      assert(!r.ok && /over-define/.test(r.error), 'Start Y taken: ' + JSON.stringify(r));
      assert(JSON.stringify(s.entities) === JSON.stringify(before), 'sketch changed by a refused value');
      return r.error;
    });
    test('3 Point Corner Rectangle: four related lines at 36.87° are Under Defined with 5 DOF and nothing redundant; a dragged corner keeps the right angle; extruded 10 it is 50 × 20 × 10 = 10000', function () {
      var K = [[0, 0], [30, 40], [14, 52], [-16, 12]], s = quad(K, true), an = SS.analyze(s);
      assert(an.status === 'under' && an.dof === 5 && !an.redundant && !an.conflicts, 'analysis ' + JSON.stringify({ st: an.status, dof: an.dof, red: an.redundant }));
      var r = SS.driveEntity(s, 2, 1, function (E) { return [SS.refPoint({ entities: E }, '2.p1')[0] - 18]; });
      assert(r.ok, 'corner refused: ' + r.error);
      var e0 = s.entities[0], e1 = s.entities[1];
      near((e0.x2 - e0.x1) * (e1.x2 - e1.x1) + (e0.y2 - e0.y1) * (e1.y2 - e1.y1), 0, 1e-6, 'right angle');
      near(SS.refPoint(s, '2.p1')[0], 18, 1e-9, 'corner x');
      var b = build(script(quad(K, true), 10));
      noErrors(b);
      near(b.mp.volume, 10000, 1e-6, 'volume');
      return 'dof ' + an.dof + ', volume ' + b.mp.volume;
    });
    test('Parallelogram: no Perpendicular, 6 DOF, nothing redundant; base 40 × height 20 extruded 5 = 4000; its sketch DXF is 4 LINEs', function () {
      var s = quad([[0, 0], [40, 0], [50, 20], [10, 20]], false), an = SS.analyze(s);
      assert(an.dof === 6 && !an.redundant && !an.conflicts, 'analysis dof ' + an.dof + ' redundant ' + an.redundant);
      var b = build(script(s, 5));
      near(b.mp.volume, 4000, 1e-6, 'volume');
      var dxf = K.exportDXFSketch(s, 'mm'), n = (dxf.match(/\n0\nLINE\n/g) || []).length;
      assert(n === 4, 'DXF LINEs ' + n);
      return 'dof ' + an.dof + ', ' + n + ' LINEs';
    });
    test('3 Point Center Rectangle with construction diagonals and a center point (Midpoint of the first diagonal) on the origin: nothing redundant, 3 DOF (angle, width, height)', function () {
      var s = quad([[-20, -10], [20, -10], [20, 10], [-20, 10]], true);
      s.entities.push({ t: 'line', x1: -20, y1: -10, x2: 20, y2: 10, construction: true }, { t: 'line', x1: 20, y1: -10, x2: -20, y2: 10, construction: true }, { t: 'point', x: 0, y: 0 });
      s.rels.push({ type: 'coincident', refs: ['4.p1', '0.p1'] }, { type: 'coincident', refs: ['4.p2', '2.p1'] }, { type: 'coincident', refs: ['5.p1', '1.p1'] }, { type: 'coincident', refs: ['5.p2', '3.p1'] },
        { type: 'midpoint', refs: ['6', '4'] }, { type: 'coincident', refs: ['6', 'O'] });
      var an = SS.analyze(s);
      assert(!an.redundant && !an.conflicts && an.dof === 3, 'analysis dof ' + an.dof + ' redundant ' + an.redundant);
      // the center stays on the origin when a corner is driven
      var r = SS.driveEntity(s, 1, 1, function (E) { return [SS.refPoint({ entities: E }, '1.p1')[0] - 30]; });
      assert(r.ok, r.error);
      near(SS.refPoint(s, '3.p1')[0], -30, 1e-6, 'opposite corner mirrors through the center');
      return 'dof ' + an.dof;
    });
    test('Midpoint Line: a line with Midpoint on the origin stays symmetric when its end is driven', function () {
      var s = { entities: [{ t: 'line', x1: -20, y1: -10, x2: 20, y2: 10 }], rels: [{ type: 'midpoint', refs: ['O', '0'] }] };
      assert(SS.analyze(s).status === 'under', 'status');
      var r = SS.driveEntity(s, 0, 2, function (E) { return [E[0].x2 - 30, E[0].y2 - 5]; });
      assert(r.ok, r.error);
      near(s.entities[0].x1, -30, 1e-9, 'x1'); near(s.entities[0].y1, -5, 1e-9, 'y1');
      return JSON.stringify(s.entities[0]);
    });
  })();
  // --- end p9-sketchtab ---
