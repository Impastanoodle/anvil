  // --- rfKZ (local-2026-11-11a, lane sketchflow2) --- sketch dimensions linked to a global variable keep their
  // equation (expr) through generateScript / runScript; an Offset of a closed chain of fixed (On Edge) construction
  // lines, as Offset Entities now makes from a face's edges, is one Offset relation and one dimension, fully defined
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var K = Kernel, S = SketchSolver;
    group('rfKZ: linked sketch dimensions, face offset chain');
    test('rfKZ: generateScript and runScript keep a dimension\'s and a distance relation\'s equation (expr "=W", "=W/2")', function () {
      var model = K.newModel('rfKZ');
      K.runScript(model, 'p.units("in");\np.equations({ W: 3.5 });\np.sketch("Front");');
      var sk = model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      sk.entities = [{ t: 'line', x1: 0, y1: 0, x2: 3.5, y2: 0 }, { t: 'point', x: 1.75, y: 1 }];
      sk.rels = [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'distance', refs: ['O', '1'], v: 1.75, dir: 'h', expr: '=W/2' }];
      sk.dims = [{ e: 0, k: 'len', off: -0.5, expr: '=W' }];
      var code = K.generateScript(model);
      assert(/"expr":"=W"/.test(code) && /"expr":"=W\/2"/.test(code), 'script carries expr: ' + code);
      var m2 = K.newModel('x');
      K.runScript(m2, code);
      var s2 = m2.features.filter(function (x) { return x.type === 'sketch'; })[0];
      assert(s2.dims && s2.dims[0] && s2.dims[0].expr === '=W', 'dim expr: ' + JSON.stringify(s2.dims));
      var rl = s2.rels.filter(function (r) { return r.type === 'distance'; })[0];
      assert(rl && rl.expr === '=W/2' && Math.abs(rl.v - 1.75) < 1e-12, 'rel expr: ' + JSON.stringify(rl));
      return code.split('\n').length + ' lines';
    });
    test('rfKZ: Offset of a closed chain of fixed construction lines (a face outline, 6 x 2) inward .25: one Offset relation, one .25 dimension, fully defined; the dimension drives', function () {
      var f = { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 },
        entities: [{ t: 'line', x1: 6, y1: 2.12, x2: 6, y2: 0.12 }, { t: 'line', x1: 0, y1: 0.12, x2: 6, y2: 0.12 }, { t: 'line', x1: 0, y1: 0.12, x2: 0, y2: 2.12 }, { t: 'line', x1: 0, y1: 2.12, x2: 6, y2: 2.12 }],
        rels: [] };
      f.entities.forEach(function (e, i) { e.construction = true; S.addRelation(f, 'onEdge', [String(i)]); });
      var r = S.offsetSelection(f, [0, 1, 2, 3], { d: 0.25, reverse: true, chain: true, dims: true });
      assert(r.ok, r.error);
      assert(r.added.length === 4, 'four lines: ' + r.added.length);
      var off = f.rels.filter(function (x) { return x.type === 'offset'; }), dist = f.rels.filter(function (x) { return x.type === 'distance'; });
      assert(off.length === 1 && dist.length === 1 && Math.abs(dist[0].v - 0.25) < 1e-12, 'one offset relation and dimension: ' + JSON.stringify(f.rels));
      assert(S.analyze(f).status === 'full', 'fully defined: ' + S.analyze(f).status);
      var xs = r.added.map(function (i) { var e = f.entities[i]; return Math.min(e.x1, e.x2); });
      near(Math.min.apply(null, xs), 0.25, 1e-9, 'inside the outline');
      var s = S.setRelValue(f, f.rels.indexOf(dist[0]), 0.5);
      assert(s.ok !== false, s && s.error);
      var ys = r.added.map(function (i) { var e = f.entities[i]; return Math.min(e.y1, e.y2); });
      near(Math.min.apply(null, ys), 0.62, 1e-9, 'offset .5 from the bottom edge');
      return 'ok';
    });
  })();
