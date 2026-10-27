  // --- rfDM (2026-10-27, lane DM: sketch leftovers) --- (1) a Smart Dimension on a spline's curvature control
  // ({ e, k: 'curv', i }): Kernel.dimGeometry reads the radius of curvature 1 / |tans[i][3]|, setDimValue / the solver's
  // setDim drive the control (keeping the side it bends to), it adds no equation and never over-defines; null on a point
  // without a control; (2) an angle dimension between two lines keeps its value and stays solved when their shared
  // vertex moves; (3) a Sketch Text's insertion point ('0') ends distance dimensions and takes Coincident: the text
  // moves with the solver.
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    group('rfDM: sketch leftovers');
    var SS = SketchSolver;
    function rfDMSk(ents, rels, dims) { var f = { id: 1, type: 'sketch', plane: { ref: 'Front' }, entities: JSON.parse(JSON.stringify(ents)), rels: rels ? JSON.parse(JSON.stringify(rels)) : [] }; if (dims) f.dims = JSON.parse(JSON.stringify(dims)); return f; }
    var SPL = { t: 'spline', pts: [[0, 0], [10, 10], [20, 0], [30, -10], [40, 0]], tans: [null, [0, 0.7071, null, -0.3], null, null, null] };
    test('rfDM: Smart Dimension on a spline curvature control reads R = 1 / |curvature| and drives the control', function () {
      var f = rfDMSk([SPL], [], [{ e: 0, k: 'curv', i: 1, ang: 60, off: 5 }]), d = f.dims[0];
      var g = Kernel.dimGeometry(f.entities[0], d);
      assert(g && g.type === 'radial' && g.prefix === 'R' && g.curv, 'a radius: ' + JSON.stringify(g));
      near(g.value, 1 / 0.3, 1e-12, 'R = 1 / 0.3');
      near(g.C[0], 10, 1e-12, 'the leader starts at the spline point x'); near(g.C[1], 10, 1e-12, 'y');
      near(g.centre[1], 10 - 1 / 0.3, 1e-9, 'the centre of curvature below the point (bends right)');
      assert(Kernel.dimGeometry(f.entities[0], { e: 0, k: 'curv', i: 2 }) == null, 'no dimension where there is no curvature control');
      assert(SS.analyze(f).dims[0] === 'ok', 'satisfied, not over-defining: ' + SS.analyze(f).dims[0]);
      assert(!SS.overDefines(f, 'dim', 0), 'never asks to make it driven');
      var r = SS.setDim(f, 0, 1.5);
      assert(r.ok, 'setDim: ' + r.error);
      near(f.entities[0].tans[1][3], -1 / 1.5, 1e-12, 'the control is now R1.5 on the same side');
      var k = Kernel.splineCurvatureAt(f.entities[0], 1);
      near(k.out, -1 / 1.5, 1e-9, 'the curve bends at R1.5 after the point'); near(k['in'], -1 / 1.5, 1e-9, 'and before it');
      near(Kernel.dimValue(f.entities[0], d), 1.5, 1e-12, 'the dimension reads 1.5');
      assert(f.entities[0].pts[1][0] === 10 && f.entities[0].pts[1][1] === 10, 'the spline point stayed');
      var bad = SS.setDim(f, 0, -2);
      assert(!bad.ok, 'a negative radius is refused');
    });
    test('rfDM: an angle dimension between two lines meeting at a vertex stays satisfied at its value when the vertex moves', function () {
      var f = rfDMSk([{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 2, y2: 3 }],
        [{ type: 'coincident', refs: ['0.p1', '1.p1'] }, { type: 'fix', refs: ['0.p2'] }, { type: 'fix', refs: ['1.p2'] }]);
      var r = SS.addRelation(f, 'angle', ['0', '1'], { off: 1 });
      assert(r.ok, 'angle added');
      var ai = f.rels.length - 1, v0 = f.rels[ai].v;
      near(v0, Math.atan2(3, 2) * 180 / Math.PI, 1e-9, 'the angle it read');
      // the vertex dragged: the solver keeps the angle (the fixed far ends: the vertex moves on the circle that sees the chord at that angle)
      f.entities[0].x1 = f.entities[1].x1 = -1; f.entities[0].y1 = f.entities[1].y1 = 0.5;
      var s = SS.solve(f);
      assert(s.ok, 'solved');
      near(SS.measure(f, 'angle', ['0', '1']), v0, 1e-6, 'still the dimension value');
      var a = SS.analyze(f);
      assert(a.rels[ai] === 'ok', 'not dangling / conflicting: ' + a.rels[ai]);
    });
    test('rfDM: a Sketch Text insertion point ends a distance dimension and takes Coincident; the text moves with the solver', function () {
      var f = rfDMSk([{ t: 'text', x: 2, y: 1, str: 'AB', h: 0.125 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 3 }, { t: 'point', x: 4, y: 2 }],
        [{ type: 'fix', refs: ['1'] }]);
      assert(SS.pointRefs(f, 0).some(function (p) { return p.ref === '0'; }), 'the insertion point is a sketch point ref');
      var r = SS.addRelation(f, 'distance', ['0', '1'], { off: 1 });
      assert(r.ok, 'distance text to line');
      var di = f.rels.length - 1;
      near(f.rels[di].v, 2, 1e-12, 'reads 2');
      assert(SS.setRelValue(f, di, 2.5).ok, 'set 2.5');
      near(f.entities[0].x, 2.5, 1e-9, 'the text moved (the line is fixed)');
      var rh = SS.addRelation(f, 'distance', ['0', '2'], { dir: 'v' });
      assert(rh.ok, 'vertical distance text to point');
      var vi = f.rels.length - 1;
      near(f.rels[vi].v, 1, 1e-9, 'reads 1');
      assert(SS.setRelValue(f, vi, 0.75).ok, 'set 0.75');
      near(Math.abs(f.entities[2].y - f.entities[0].y), 0.75, 1e-9, 'vertical 0.75');
      f.rels.splice(vi, 1);
      var rc = SS.addRelation(f, 'coincident', ['0', '2']);
      assert(rc.ok, 'coincident');
      near(f.entities[0].x, f.entities[2].x, 1e-9, 'text on the point x'); near(f.entities[0].y, f.entities[2].y, 1e-9, 'y');
      near(f.entities[0].x, 2.5, 1e-9, 'the dimension still holds');
    });
  })();
