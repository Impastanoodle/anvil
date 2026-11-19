  // --- rfQL (local-2026-11-18b, lane sketchflow10, report test-reports/2026-11-19-sketch-flow-10.md): solver-level pins of
  // the sketch jobs driven in smoke rfQL.
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var S = SketchSolver;
    function L(x1, y1, x2, y2, c) { var e = { t: 'line', x1: x1, y1: y1, x2: x2, y2: y2 }; if (c) e.construction = true; return e; }
    function rect() {
      return { entities: [L(-1, 0, 1, 0), L(1, 0, 1, 1), L(1, 1, -1, 1), L(-1, 1, -1, 0), L(0, -0.5, 0, 2, true)],
        rels: [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['3'] },
          { type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] },
          { type: 'coincident', refs: ['3.p2', '0.p1'] }, { type: 'vertical', refs: ['4'] }] };
    }
    group('rfQL: Symmetric that repeats part of a Horizontal / Vertical');
    test('rfQL: Symmetric of a rectangle\'s two sides about a vertical centerline, or of a horizontal line\'s two ends, adds the midpoint on the axis and stays Under Defined (it was Over Defined: its square-to-the-axis rows repeat the Horizontals); a Symmetric that adds nothing stays redundant', function () {
      var f = rect(), d0 = S.analyze(f).dof;
      var r = S.addRelation(f, 'symmetric', ['1', '3', '4']);
      assert(r.ok && r.status === 'ok', 'sides: ' + r.status);
      var an = S.analyze(f);
      assert(an.status === 'under' && an.dof === d0 - 1, 'one DOF less, not over: ' + an.status + ' ' + an.dof);
      assert(f.rels.length === 10 && f.rels.slice(0, 9).every(function (x) { return !x.implied; }), 'the Horizontals / Verticals are kept');
      var g = rect();
      r = S.addRelation(g, 'symmetric', ['2.p1', '2.p2', '4']);
      assert(r.ok && r.status === 'ok' && S.analyze(g).status === 'under' && S.analyze(g).dof === d0 - 1, 'top ends: ' + r.status + ' ' + S.analyze(g).status);
      near(g.entities[2].x1 + g.entities[2].x2, 0, 1e-9, 'the top centred on the axis');
      // the bottom's ends then add nothing (the top's Symmetric and the rectangle say it all): redundant (Over Defined) as before
      r = S.addRelation(g, 'symmetric', ['0.p1', '0.p2', '4']);
      assert(r.ok && r.status === 'redundant' && S.analyze(g).status === 'over', 'a full repeat: ' + r.status);
    });
    group('rfQL: a global variable renamed or deleted');
    test('rfQL: W renamed WIDTH in the equation list (its row in place, its value kept; a row whose value changes too is a delete and an add): every =W (sketch dimensions, relations, a feature depth, another variable) names WIDTH; WIDTH deleted: the sketch still builds with its last values and each dimension that used it is an equation error D1@Sketch1 (before: the sketch failed, rels.N.expr: Unknown variable)', function () {
      var code = 'p.units("in");\np.equations({ W: 6, H: 4, HALF: "=W/2" });\n' +
        'p.sketch("Front", 0, "Sketch1").line(0, 0, 6, 0).line(6, 0, 6, 2).line(6, 2, 0, 2).line(0, 2, 0, 0)' +
        '.rel("coincident", ["0.p1", "O"]).rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["3.p2", "0.p1"])' +
        '.rel("horizontal", ["0"]).rel("horizontal", ["2"]).rel("vertical", ["1"]).rel("vertical", ["3"])' +
        '.dim(0, "len").dim(1, "len").dimProps([[0, { expr: "=W" }], [1, { expr: "=H/2" }]]).extrude("=W/3");\n';
      var r = build(code);
      noErrors(r);
      var m = r.model, sk = m.features.filter(function (x) { return x.type === 'sketch'; })[0], ex = m.features.filter(function (x) { return x.type === 'extrude'; })[0];
      Kernel.applyEquations(m, [{ name: 'WIDTH', expr: '6' }, { name: 'H', expr: '4' }, { name: 'HALF', expr: 'W/2' }]);
      Kernel.applyEquations(m, [{ name: 'WIDTH', expr: '8' }, { name: 'H', expr: '4' }, { name: 'HALF', expr: 'WIDTH/2' }]);
      assert(m.equations[2].expr === 'WIDTH/2', 'the other variable: ' + JSON.stringify(m.equations));
      assert(sk.dims[0].expr === '=WIDTH' && sk.dims[1].expr === '=H/2' && ex.depth === '=WIDTH/3', 'renamed: ' + JSON.stringify([sk.dims, ex.depth]));
      var rm = Kernel.resolvedModel(m);
      assert(!Object.keys(rm.featureErrors).length && !Object.keys(rm.errors || {}).length, 'no error: ' + JSON.stringify([rm.featureErrors, rm.errors]));
      var s2 = rm.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      near(s2.entities[0].x2 - s2.entities[0].x1, 8, 1e-9, 'the width follows WIDTH = 8');
      // a list that only changes values renames nothing
      Kernel.applyEquations(m, [{ name: 'WIDTH', expr: '10' }, { name: 'H', expr: '4' }, { name: 'HALF', expr: 'WIDTH/2' }]);
      assert(sk.dims[0].expr === '=WIDTH', 'kept');
      // WIDTH deleted (and HALF with it, as the dialog cannot keep a row in error)
      Kernel.applyEquations(m, [{ name: 'H', expr: '4' }]);
      rm = Kernel.resolvedModel(m);
      assert(!rm.featureErrors[sk.id], 'the sketch builds: ' + JSON.stringify(rm.featureErrors));
      assert(rm.featureErrors[ex.id] && /WIDTH/.test(rm.featureErrors[ex.id]), 'the extrude depth =WIDTH/3 is an error: ' + JSON.stringify(rm.featureErrors));
      assert(/Unknown variable "WIDTH"/.test((rm.errors || {})['D1@Sketch1'] || ''), 'D1@Sketch1 named: ' + JSON.stringify(rm.errors));
      assert(!(rm.errors || {})['D2@Sketch1'], 'D2 (=H/2) is fine');
      assert(sk.dims[0].expr === '=WIDTH', 'the equation is kept on the dimension');
      s2 = rm.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      near(s2.entities[0].x2 - s2.entities[0].x1, 6, 1e-9, 'the width keeps its last solved value (the model sketch was never re-solved here)');
    });
  })();
