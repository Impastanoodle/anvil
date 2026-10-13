  // --- r4/sketch4 ---
  (function () {
    group('r4/sketch4: horizontal / vertical distances, virtual sharps in scripts, tangent arcs');
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    test('a horizontal / vertical distance between two points holds that component only (dir h / v), reads it, edits it, and is named so', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 20 }], rels: [{ type: 'coincident', refs: ['0.p1', 'O'] }] };
      near(SS.measure(s, 'distance', ['0.p1', '0.p2'], 'h'), 30, 1e-12, 'measured h');
      near(SS.measure(s, 'distance', ['0.p1', '0.p2'], 'v'), 20, 1e-12, 'measured v');
      var r = SS.addRelation(s, 'distance', ['0.p1', '0.p2'], { dir: 'h', off: 25 });
      assert(r.ok && s.rels[1].dir === 'h' && s.rels[1].v === 30, JSON.stringify(s.rels));
      var sv = SS.setRelValue(s, 1, 45);
      assert(sv.ok, JSON.stringify(sv));
      near(s.entities[0].x2 - s.entities[0].x1, 45, 1e-9, 'horizontal component');
      assert(SS.describe(s, s.rels[1]).indexOf('Horizontal Distance') === 0, SS.describe(s, s.rels[1]));
      var r2 = SS.addRelation(s, 'distance', ['0.p1', '0.p2'], { dir: 'v' });
      assert(r2.ok && s.rels[2].v === 20 && SS.analyze(s).status === 'full', 'fully defined by H and V: ' + SS.analyze(s).status);
      // a line ref ignores the direction (distance to a line is square to it)
      var s2 = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'point', x: 5, y: 10 }] };
      var r3 = SS.addRelation(s2, 'distance', ['1', '0'], { dir: 'h' });
      assert(r3.ok && !s2.rels[0].dir && s2.rels[0].v === 10, JSON.stringify(s2.rels));
      return SS.describe(s, s.rels[1]);
    });
    test('virtual sharp: a line\'s horizontal / vertical dimensions (dx / dy, driven too) move to the sharp as horizontal / vertical distances that still drive', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 50, y2: 10 }, { t: 'line', x1: 50, y1: 10, x2: 40, y2: 40 }], rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['0.p1', 'O'] }],
        dims: [{ e: 0, k: 'dx', off: -5 }, { e: 1, k: 'dy', off: 4 }, { e: 0, k: 'dy', off: 3, driven: true }] };
      var r = SS.filletCorner(s, SS.lineCorner(s, [50, 10], 1), 3);
      assert(r.ok && r.sharp >= 0, JSON.stringify(r));
      var d = s.rels.filter(function (x) { return x.type === 'distance'; });
      assert(d.length === 3, JSON.stringify(d));
      assert(d[0].dir === 'h' && d[0].v === 50 && d[0].refs.join() === '0.p1,' + r.sharp && d[0].off === -5, 'dx ' + JSON.stringify(d[0]));
      assert(d[1].dir === 'v' && d[1].v === 30 && d[1].refs.join() === r.sharp + ',1.p2', 'dy ' + JSON.stringify(d[1]));
      assert(d[2].dir === 'v' && d[2].driven, 'driven dy ' + JSON.stringify(d[2]));
      assert(!(s.dims || []).some(function (x) { return x.k === 'dx' || x.k === 'dy'; }), 'no dx / dy left on the trimmed lines');
      var i = s.rels.indexOf(d[0]), sv = SS.setRelValue(s, i, 60);
      assert(sv.ok, JSON.stringify(sv));
      near(s.entities[r.sharp].x, 60, 1e-9, 'the sharp follows the horizontal distance');
      near(d[2].v, Math.abs(s.entities[r.sharp].y), 1e-9, 'driven vertical distance follows');
      return 'sharp ' + r.sharp;
    });
    test('script round trip keeps virtual sharps (.sharp) and horizontal / vertical distances ({ dir })', function () {
      var m = K.newModel();
      K.runScript(m, 'p.sketch("Front").line(0,0,50,0).line(50,0,50,30).id();');
      var f = m.features.filter(function (x) { return x.type === 'sketch'; })[0];
      f.rels = [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }];
      f.dims = [{ e: 0, k: 'len', off: -3 }];
      var r = SS.filletCorner(f, SS.lineCorner(f, [50, 0], 1), 4);
      assert(r.ok && r.sharp >= 0, JSON.stringify(r));
      SS.addRelation(f, 'distance', ['0.p1', '1.p2'], { dir: 'v', off: 60 });
      var src = K.generateScript(m);
      assert(src.indexOf('.sharp([' + r.sharp + '])') > 0, 'sharp in the script: ' + src);
      assert(/"dir":"v"/.test(src), 'dir in the script');
      var m2 = K.newModel();
      K.runScript(m2, src);
      var g = m2.features.filter(function (x) { return x.type === 'sketch'; })[0];
      assert(g.entities[r.sharp].sharp === true && g.entities[r.sharp].construction, 'sharp flag back: ' + JSON.stringify(g.entities[r.sharp]));
      var key = function (x) { return JSON.stringify((x.rels || []).map(function (q) { return [q.type, q.refs, q.dir || '', q.v != null ? Math.round(q.v * 1e6) : '']; })); };
      assert(key(g) === key(f), 'relations ' + key(g) + ' vs ' + key(f));
      near(g.entities[0].x2, f.entities[0].x2, 1e-9, 'geometry');
      assert(K.generateScript(m2) === src, 'stable script');
      return 'ok';
    });
    test('dimension labels placed off the middle (tx) survive the script: .dimText for Smart Dimensions, { tx } on distances', function () {
      var m = K.newModel();
      K.runScript(m, 'p.sketch("Front").line(0,0,40,0).line(0,10,30,30).dim(0, "len", { off: -5 }).id();');
      var f = m.features.filter(function (x) { return x.type === 'sketch'; })[0];
      f.dims[0].tx = 27.5;
      var r = SS.addRelation(f, 'distance', ['1.p1', '1.p2'], { dir: 'h', off: 25, tx: -12 });
      assert(r.ok && f.rels[0].tx === -12, JSON.stringify(f.rels));
      var src = K.generateScript(m);
      assert(src.indexOf('.dimText([[0,27.5]])') > 0 && /"tx":-12/.test(src), src);
      var m2 = K.newModel();
      K.runScript(m2, src);
      var g = m2.features.filter(function (x) { return x.type === 'sketch'; })[0];
      assert(g.dims[0].tx === 27.5 && g.rels[0].tx === -12 && g.rels[0].dir === 'h', JSON.stringify([g.dims, g.rels]));
      assert(K.generateScript(m2) === src, 'stable script');
      return 'ok';
    });
  })();
  // --- end r4/sketch4 ---
