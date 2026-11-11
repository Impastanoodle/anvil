  // --- rfKU (local-2026-11-11a, lane sketchflow) --- the doubled (linear diameter) distance from a centerline, as
  // SolidWorks' Smart Dimension placed on the far side of a centerline: a distance relation whose arc-condition entry
  // on the centerline ref is 'dbl' holds twice the distance (solve, measure, drive, flip side kept, script round trip)
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var K = Kernel, S = SketchSolver;
    group('rfKU: doubled distance from a centerline');
    // a horizontal centerline y = 2 (x 0..8, fixed) and a free point at (3, 3.1); the point's x held
    function rfKUSketch() {
      return { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 },
        entities: [{ t: 'line', x1: 0, y1: 2, x2: 8, y2: 2, construction: true }, { t: 'point', x: 3, y: 3.1 }],
        rels: [{ type: 'fix', refs: ['0'] }, { type: 'distance', refs: ['O', '1'], v: 3, dir: 'h' }] };
    }
    test('rfKU: a doubled distance (ac dbl on the centerline) reads twice the distance, drives the point to half the value, and keeps the side it started on', function () {
      var f = rfKUSketch();
      near(S.measure(f, 'distance', ['0', '1'], undefined, undefined, ['dbl', 'c']), 2.2, 1e-12, 'measures 2 × 1.1');
      near(S.measure(f, 'distance', ['0', '1']), 1.1, 1e-12, 'plain distance unchanged');
      var r = S.addRelation(f, 'distance', ['0', '1'], { ac: ['dbl', 'c'] });
      assert(r.ok, 'added: ' + r.error);
      var rel = f.rels[f.rels.length - 1];
      assert(Array.isArray(rel.ac) && rel.ac[0] === 'dbl', 'ac kept: ' + JSON.stringify(rel.ac));
      near(rel.v, 2.2, 1e-12, 'value read doubled');
      var s = S.setRelValue(f, f.rels.length - 1, 5);
      assert(s.ok !== false, 'driven: ' + (s && s.error));
      near(f.entities[1].y, 4.5, 1e-9, 'point 2.5 above the centerline');
      near(f.entities[1].x, 3, 1e-9, 'x held');
      assert(S.analyze(f).status === 'full', 'fully defined: ' + S.analyze(f).status);
      return 'y ' + f.entities[1].y;
    });
    test('rfKU: a doubled distance to a circle centre below the centerline stays below; plain and doubled side by side solve', function () {
      var f = rfKUSketch();
      f.entities.push({ t: 'circle', cx: 5, cy: 1.2, r: 0.25 });
      f.rels.push({ type: 'distance', refs: ['O', '2'], v: 5, dir: 'h' });
      var r = S.addRelation(f, 'distance', ['2', '0'], { ac: ['c', 'dbl'], value: 3 });
      assert(r.ok, r.error);
      near(f.entities[2].cy, 0.5, 1e-9, 'centre 1.5 below the centerline');
      var r2 = S.addRelation(f, 'distance', ['0', '1'], { value: 0.5 });
      assert(r2.ok, r2.error);
      near(f.entities[1].y, 2.5, 1e-9, 'plain distance .5');
      return 'cy ' + f.entities[2].cy;
    });
    test('rfKU: generateScript and runScript keep the doubled distance (ac ["dbl","c"]) and its value', function () {
      var model = K.newModel('rfKU');
      K.runScript(model, 'p.units("in");\np.sketch("Front");');
      var sk = model.features.filter(function (x) { return x.type === 'sketch'; })[0], f = rfKUSketch();
      sk.entities = f.entities; sk.rels = f.rels;
      var r = S.addRelation(sk, 'distance', ['0', '1'], { ac: ['dbl', 'c'], value: 4 });
      assert(r.ok, r.error);
      var code = K.generateScript(model);
      assert(/"ac":\["dbl","c"\]/.test(code), 'script line: ' + code);
      var m2 = K.newModel('x');
      K.runScript(m2, code);
      var s2 = m2.features.filter(function (x) { return x.type === 'sketch'; })[0], rl = s2.rels[s2.rels.length - 1];
      assert(rl.type === 'distance' && rl.ac && rl.ac[0] === 'dbl' && Math.abs(rl.v - 4) < 1e-12, 'round trip: ' + JSON.stringify(rl));
      near(s2.entities[1].y, 4, 1e-9, 'point 2 above');
      return code.split('\n').length + ' lines';
    });
  })();
