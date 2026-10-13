  // ------------------------------------------------------------------ rfAQ: sketch Chamfer Dimension, Path Length, Angular Running, Autodimension
  (function () {
    var S = typeof SketchSolver !== 'undefined' ? SketchSolver : null;
    if (!S || !S.addChamferDim) return;
    group('rfAQ: sketch Chamfer Dimension, Path Length Dimension, Angular Running Dimension');
    function rfAQPlate() {
      return { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: [
        { t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 10, y1: 0, x2: 10, y2: 4 }, { t: 'line', x1: 10, y1: 4, x2: 8, y2: 6 },
        { t: 'line', x1: 8, y1: 6, x2: 0, y2: 6 }, { t: 'arc', cx: 0, cy: 3, r: 3, a0: 90, a1: 270 }],
        rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }] };
    }
    function rfAQRound(f) {
      var m = K.newModel('rt');
      m.features.push(f);
      var src = K.generateScript(m), m2 = K.newModel('x');
      K.runScript(m2, src);
      return { src: src, f: m2.features.filter(function (x) { return x.type === 'sketch'; })[0] };
    }
    test('rfAQ: Chamfer Dimension — 2 X 45° read off a chamfer line and the line next to it; the distance and the angle both drive (3 X 30°); it survives the script round trip', function () {
      var f = rfAQPlate(), r = S.addChamferDim(f, '2', '3', { lo: [1, 1] });
      assert(r.ok && !r.driven, JSON.stringify(r));
      var rel = f.rels[r.index];
      near(rel.v, 2, 1e-9, 'distance'); near(rel.cang, 45, 1e-9, 'angle');
      assert(S.setRelValue(f, r.index, 3).ok, 'distance 3');
      assert(S.setChamferAngle(f, r.index, 30).ok, 'angle 30');
      near(S.measure(f, 'chamfer', ['2', '3']), 3, 1e-6, 'measured distance'); near(S.chamferAngle(f, ['2', '3']), 30, 1e-6, 'measured angle');
      assert(!S.setChamferAngle(f, r.index, 95).ok, '95° refused');
      assert(!S.addChamferDim(f, '0.p1', '3').ok && !S.addChamferDim(f, '3', '3').ok, 'a point or the same line refused');
      var rt = rfAQRound(f), g = rt.f, rr = g.rels.filter(function (x) { return x.type === 'chamfer'; })[0];
      assert(/\.rfaq\(/.test(rt.src), 'script has .rfaq');
      near(rr.v, 3, 1e-6, 'round trip distance'); near(rr.cang, 30, 1e-6, 'round trip angle');
      assert(rr.lo && rr.lo[0] === 1, 'label place kept');
      near(S.chamferAngle(g, ['2', '3']), 30, 1e-5, 'round trip geometry');
      return '3 X 30°';
    });
    test('rfAQ: Path Length — two lines and a half circle R3 add up (10 + 4 + 3π); driving it to 30 re-solves the chain; driven when it would over-define', function () {
      var f = rfAQPlate();
      var p = S.addPathLength(f, ['0', '1', '4']);
      assert(p.ok && !p.driven, JSON.stringify(p));
      near(f.rels[p.index].v, 10 + 4 + 3 * Math.PI, 1e-9, 'length');
      assert(S.setRelValue(f, p.index, 30).ok, 'drive 30');
      near(S.measure(f, 'pathlength', ['0', '1', '4']), 30, 1e-6, 'measured');
      assert(!S.addPathLength(f, ['0.p1']).ok, 'a point is not a path');
      // lengths all fixed by dimensions: the path length comes in driven
      var g = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 5, y2: 0 }], dims: [{ e: 0, k: 'len' }] };
      var q = S.addPathLength(g, ['0']);
      assert(q.ok && q.driven && g.rels[q.index].driven, 'driven ' + JSON.stringify(q));
      var rt = rfAQRound(f), rr = rt.f.rels.filter(function (x) { return x.type === 'pathlength'; })[0];
      near(rr.v, 30, 1e-6, 'round trip');
      return 'ok';
    });
    test('rfAQ: Angular Running — 0° datum along +X, members at 90°, 225° and a hole at 45° (one set); 225° driven to 200° turns its line; Delete the set; round trip keeps the set', function () {
      var g = { id: 2, type: 'sketch', name: 'Sketch2', plane: { ref: 'Front', offset: 0 }, entities: [
        { t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 0, y2: 10 }, { t: 'line', x1: 0, y1: 0, x2: -5, y2: -5 }, { t: 'circle', cx: 3, cy: 3, r: 0.5 }],
        rels: [{ type: 'coincident', refs: ['0.p1', '1.p1'] }, { type: 'coincident', refs: ['0.p1', '2.p1'] }, { type: 'fix', refs: ['0'] }] };
      var a = S.addRunningAngle(g, { vertex: '0.p1', datum: '0.p2', target: '1.p2', off: 4 });
      var b = S.addRunningAngle(g, { run: a.run, target: '2.p2' }), c = S.addRunningAngle(g, { run: a.run, target: '3.c' });
      assert(a.ok && b.ok && c.ok && a.run === b.run && b.run === c.run, JSON.stringify([a, b, c]));
      near(g.rels[a.index].v, 90, 1e-9, '90'); near(g.rels[b.index].v, 225, 1e-9, '225'); near(g.rels[c.index].v, 45, 1e-9, '45');
      assert(!S.addRunningAngle(g, { run: a.run, target: '3.c' }).ok, 'twice refused');
      assert(S.setRelValue(g, b.index, 200).ok, 'drive 200');
      var e = g.entities[2];
      near(Math.atan2(e.y2 - e.y1, e.x2 - e.x1) * 180 / Math.PI + 360, 200, 1e-6, 'line at 200°');
      var sets = S.runningSets(g);
      assert(sets[a.run] && sets[a.run].members.length === 3 && sets[a.run].off === 4, JSON.stringify(sets));
      var rt = rfAQRound(g), s2 = S.runningSets(rt.f);
      assert(s2[a.run] && s2[a.run].members.length === 3, 'round trip set ' + JSON.stringify(s2));
      near(rt.f.rels[s2[a.run].members[1]].v, 200, 1e-6, 'round trip value');
      assert(S.deleteRunningSet(g, a.run) === 3 && !Object.keys(S.runningSets(g)).length, 'set deleted');
      return 'ok';
    });
    test('rfAQ: Autodimension engine — a line datum (the left edge): every X measured from it, only the edge itself left free; chain from the origin: Fully Defined', function () {
      var mk = function () { return { entities: [{ t: 'rect', x: 0, y: 0, w: 8, h: 5 }, { t: 'circle', cx: 2, cy: 3, r: 0.5 }, { t: 'circle', cx: 6, cy: 3, r: 0.5 }] }; };
      var f = mk(), r = S.fullyDefine(f, { hDatum: '0.e3', vDatum: 'O', hScheme: 'baseline', vScheme: 'chain' });
      assert(r.dof === 1, 'baseline from a line ' + r.status + ' ' + r.dof);
      assert(f.rels.some(function (x) { return x.type === 'distance' && x.refs[0] === '0.e3'; }), 'measured from the line');
      var g = mk(), r2 = S.fullyDefine(g, { hScheme: 'chain', vScheme: 'chain' });
      assert(r2.status === 'full', 'chain ' + r2.status);
      return 'ok';
    });
  })();
  // --- end rfAQ ---
