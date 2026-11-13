  // --- rfMM (local-2026-11-13a, lane sketchleft) --- the sketch items left open by the 2026-11-11 sketch-flow report:
  // a centerline between the midpoints of a rectangle's two sides keeps both Midpoints (the inferred Horizontal goes);
  // dragging a rectangle corner leaves an original that is Symmetric to a copy where it was (the copy follows the
  // centerline); Autodimension of a straight slot dimensions its first centre and the centre distance
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var K = Kernel, S = SketchSolver;
    group('rfMM: centerline Midpoints, drags that move as little as they can, slot Autodimension');
    function rfMMRect() {
      var E = [{ t: 'line', x1: 1, y1: 0.5, x2: 5, y2: 0.5 }, { t: 'line', x1: 5, y1: 0.5, x2: 5, y2: 2.5 }, { t: 'line', x1: 5, y1: 2.5, x2: 1, y2: 2.5 }, { t: 'line', x1: 1, y1: 2.5, x2: 1, y2: 0.5 }];
      var R = [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] },
        { type: 'horizontal', refs: ['0'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['1'] }, { type: 'vertical', refs: ['3'] }];
      return { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: E, rels: R };
    }
    test('rfMM: a centerline from the midpoint of a rectangle\'s left side to the midpoint of its right side infers Midpoint at both ends and no Horizontal (it gave Coincident at the second end)', function () {
      var f = rfMMRect();
      f.entities.push({ t: 'line', x1: 1, y1: 1.5, x2: 5, y2: 1.5, construction: true });
      var a0 = S.analyze(f);
      var added = S.infer(f, 4, { placed: [[1, 1.5], [5, 1.5]] });
      var types = added.map(function (r) { return r.type + ' ' + r.refs.join(','); }).sort();
      assert(types.length === 2 && types[0] === 'midpoint 4.p1,3' && types[1] === 'midpoint 4.p2,1', 'two Midpoints: ' + JSON.stringify(types));
      var a = S.analyze(f);
      assert(a.redundant === 0 && a.conflicts === 0 && a.dof === a0.dof - 4, 'nothing over defined, the centerline held: dof ' + a.dof + ' (rectangle ' + a0.dof + ')');
      return types.join('; ');
    });
    test('rfMM: dragging a rectangle corner 1 in out leaves a circle that is Symmetric to a copy about the centerline where it was; the copy follows the centerline (both moved half way)', function () {
      var f = rfMMRect();
      f.entities.push({ t: 'line', x1: 3, y1: 2.5, x2: 3, y2: 0.5, construction: true });
      f.entities.push({ t: 'circle', cx: 2, cy: 1.5, r: 0.25 }, { t: 'circle', cx: 4, cy: 1.5, r: 0.25 });
      f.rels.push({ type: 'midpoint', refs: ['4.p1', '2'] }, { type: 'midpoint', refs: ['4.p2', '0'] }, { type: 'symmetric', refs: ['5', '6', '4'] });
      var start = JSON.parse(JSON.stringify(f.entities));
      for (var k = 1; k <= 10; k++) { var r = S.drag(f, '1.p2', [5 + k * 0.1, 2.5], start); assert(r.ok, 'drag step ' + k); }
      var c0 = f.entities[5], c1 = f.entities[6], cl = f.entities[4];
      near(c0.cx, 2, 1e-3, 'original x'); near(c0.cy, 1.5, 1e-3, 'original y');
      near(c1.cx, 2 * cl.x1 - c0.cx, 1e-6, 'copy mirrored about the centerline');
      near(f.entities[1].x1, 6, 1e-3, 'the right side went with the corner');
      return 'original (' + c0.cx.toFixed(4) + ', ' + c0.cy.toFixed(4) + '), copy x ' + c1.cx.toFixed(4) + ', centerline x ' + cl.x1.toFixed(4);
    });
    test('rfMM: Autodimension of SolidWorks\' reference sketch (head-tools/sw-reference/ref3_auto.py: 4 x 3 corner rectangle, Ø.5 at (1, 1), a .5 slot 2.5 → 3.5 at y 1), baseline: the slot by x 2.5 (first end centre) and x 3.0 (its centre), no centre-to-centre length (it was 1.0 + centre); Fully Defined', function () {
      var f = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'line', x1: 4, y1: 0, x2: 4, y2: 3 }, { t: 'line', x1: 4, y1: 3, x2: 0, y2: 3 }, { t: 'line', x1: 0, y1: 3, x2: 0, y2: 0 },
        { t: 'circle', cx: 1, cy: 1, r: 0.25 }, { t: 'slot', x1: 2.5, y1: 1, x2: 3.5, y2: 1, w: 0.5 }],
        rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] }, { type: 'coincident', refs: ['0.p1', 'O'] },
          { type: 'horizontal', refs: ['0'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['1'] }, { type: 'vertical', refs: ['3'] }] };
      S.explodeSlot(f, 5);
      var r = S.fullyDefine(f, { relations: false, hScheme: 'baseline', vScheme: 'baseline', units: 'in' });
      assert(r.status === 'full', 'status ' + r.status);
      var cl = f.entities.reduce(function (a, e, i) { return e.t === 'line' && e.construction ? i : a; }, -1);
      var d = (f.rels || []).filter(function (q) { return q.type === 'distance' && q.dir === 'h' && (q.refs[1] === cl + '.mid' || q.refs[1] === cl + '.p1' || q.refs[1] === cl + '.p2'); });
      var desc = d.map(function (q) { return q.refs[1] + ' ' + q.v; }).join(', ');
      assert(d.length === 2, 'two horizontal slot dimensions: ' + desc);
      near(d.filter(function (q) { return q.refs[1] === cl + '.p1'; })[0].v, 2.5, 1e-12, 'first end centre');
      near(d.filter(function (q) { return q.refs[1] === cl + '.mid'; })[0].v, 3, 1e-12, 'slot centre');
      assert(!(f.dims || []).some(function (q) { return q.k === 'len'; }), 'no centre-to-centre length: ' + JSON.stringify(f.dims));
      return desc;
    });
  })();
