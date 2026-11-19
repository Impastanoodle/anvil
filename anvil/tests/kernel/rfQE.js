  // --- rfQE (lane stepread, 2026-11-19; report test-reports/2026-11-19-solids-fidelity-7.md): STEP files Anvil writes
  // read back by Anvil's own reader as closed solids at the part's volume (the rfON fuzz's refused and open files), and
  // the drilled lofts closed.
  (function () {
    group('rfQE: solids fidelity 7: every STEP Anvil writes reads back closed in Anvil');
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    function rfQEopen(b) { var n = 0; (b.bodies || []).forEach(function (x) { var c = Evaluate.checkBody(x); n += c.openEdges.length + c.nonManifoldEdges.length; }); return n; }
    function rfQEcount(re, s) { return (s.match(re) || []).length; }
    // the part out to STEP and back through Anvil's reader (base: a part written to STEP and read back first, the
    // fuzz's kind 'step') -> { rel, open, cyl, faces }
    function rfQEtrip(code, base) {
      if (!X) fail('exchange.js is not loaded');
      var m = K.newModel('rfQE');
      if (base) { K.runScript(m, base); var b0 = K.rebuild(m); m = X.newPartFromImport(X.importFile('b.step', X.exportSTEP(m, b0), { units: 'in' })); }
      K.runScript(m, code);
      var b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      assert(rfQEopen(b) === 0, 'the part itself is open');
      var v = K.massProps(K.meshFromBody(b.body), 1).volume, st = X.exportSTEP(m, b), back = K.rebuild(X.newPartFromImport(X.importFile('rfQE.step', st, { units: 'in' })));
      assert(back.body && back.body.polygons.length, 'Anvil\'s reader gave no body');
      return { rel: (K.massProps(K.meshFromBody(back.body), 1).volume - v) / v, open: rfQEopen(back), cyl: rfQEcount(/=CYLINDRICAL_SURFACE\(/g, st), faces: rfQEcount(/=ADVANCED_FACE\(/g, st) };
    }
    var BAR = 'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).end().extrude(1);\n';
    // 1. exchange.js saddleCurve: a run of the curve where two cylinders meet that passes the point where they touch
    //    (normals parallel: a corner of the curve, two branches crossing) is cut there, a cubic each side joined by a
    //    knot of multiplicity 3, the tangent at the corner the branch's own; and points left out go back in where the
    //    curve strays more than 1e-7 off a cylinder. One C2 spline swung 1e-3 / 5.6e-4 off both cylinders and Anvil's
    //    reader refused the face ("trimmed by curves other than circles and rulings"): fuzz t6001, t6033, t6051, t6059.
    //    2. paramPatch: a band's cut starts clear of every hole's points (t6055, t6082: a cross hole's vertex on the
    //    seam; the edge from the circle's start to it was shared by four faces). 3. surfPatch: a run of chords (degree
    //    1 B-spline) is held to the surface by its corners (p6169: a hole's rim against a round that keeps its facets).
    //    4. the ELLIPSE sense from the whole run's turn (f6003: a run that steps back at a mesh fold, written 358 deg).
    [
      ['a boss on a bar, tangent to the bar\'s outermost ruling (the boss end inside the bar)', BAR + 'p.sketch("Front", 1).circle(0.125, 0.4612, 0.375).end().extrude(1, { reverse: true });\n', null, 1e-7],
      ['a cross hole near the bar\'s wall (fuzz t6033)', 'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).end().extrude(2.5);\np.sketch("Front", 1.5).circle(-0.4012, 1.1624, 0.09375).end().cut("through", { reverse: true });\n', null, 1e-7],
      ['fuzz t6001 (rim round, cross hole, boss tangent to the bar, hole in the boss)', 'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).end().extrude(1);\np.fillet(0.125, [[-0.4006,1,0.2992]]);\np.sketch("Front", 1.5).circle(0, 0.5843, 0.125).end().cut("through", { reverse: true });\np.sketch("Front", 1).circle(0.125, 0.4612, 0.375).end().extrude(1, { reverse: true });\np.sketch("Front", 2).circle(0.125, 0.4612, 0.225).end().cut(2, { reverse: true });\n', null, 1e-7],
      // (head, after lane solidcracks: the rows fuzz t6055 and t6082 were cross holes tangent to the bar's wall; they are refused as zero-thickness geometry now, kernel rfQJ pins that)
      ['fuzz s6017 (a tube with a cross hole and a groove read from STEP, then drilled)', 'p.units("in");\np.sketch("Top", 9).circle(0.4, 0.35, 0.15625).end().cut("through", { reverse: true });\n', 'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).circle(0, 0, 0.3).end().extrude(0.75);\np.sketch("Front", 1.5).circle(0, 0.3895, 0.25).end().cut("through", { reverse: true });\np.sketch("Front").rect(0.375, 0.3709, 0.375, 0.0625).end().revolveCut(360);\n', 1e-7],
      ['fuzz f6003 (a rectangle-to-circle loft drilled down its axis and across its corner)', 'p.units("in");\nvar a = p.sketch("Top").centerRect(0, 0, 2, 2.5).id();\nvar b = p.sketch("Top", 3).circle(0, 0, 0.7).id();\np.loft([a, b]);\np.sketch("Top", 4).circle(0, 0, 0.21).end().cut("through", { reverse: true });\np.sketch("Front", 2.5).circle(0.7, 1.4325, 0.25).end().cut("through", { reverse: true });\n', null, 1e-7]
    ].forEach(function (c) {
      test('rfQE: ' + c[0] + ': Anvil\'s reader takes its STEP back (it refused it: a cylinder "trimmed by curves other than circles and rulings"), closed, at the volume to ' + c[3], function () {
        var t = rfQEtrip(c[1], c[2]);
        assert(t.open === 0, t.open + ' open or non-manifold edges read back');
        assert(t.cyl >= 1, 'no CYLINDRICAL_SURFACE in the file');
        assert(Math.abs(t.rel) < c[3], 'read back ' + t.rel.toExponential(2));
        return t.faces + ' faces, ' + t.cyl + ' cylinders, read back ' + t.rel.toExponential(1);
      });
    });
    test('rfQE: fuzz p6169 (a hole tangent to the side under a top round, others beside it): Anvil\'s reader takes the file back closed at the volume to 1e-8 (the hole\'s rim against the round\'s facets is a run of chords)', function () {
      var m = K.newModel('rfQE');
      K.runScript(m, 'p.units("in");\np.sketch("Top").centerRect(0, 0, 3.5, 5).end().extrude(0.135);\np.fillet(0.0608, [[-1.44,0.135,2.5]]);\np.sketch("Top", 1.135).circle(0.2256, -2.25, 0.25).end().cut("through", { reverse: true });\n');
      var b = K.rebuild(m);
      if (Object.keys(b.errors).length) return 'refused: ' + JSON.stringify(b.errors);
      var v = K.massProps(K.meshFromBody(b.body), 1).volume, st = X.exportSTEP(m, b), back = K.rebuild(X.newPartFromImport(X.importFile('rfQE.step', st, { units: 'in' })));
      var rel = (K.massProps(K.meshFromBody(back.body), 1).volume - v) / v;
      assert(Math.abs(rel) < 1e-8, 'read back ' + rel.toExponential(2));
      return 'read back ' + rel.toExponential(1) + ', ' + rfQEopen(back) + ' open (a hole tangent to the side touches it along a line: see the report)';
    });
  })();
  // --- end rfQE ---
