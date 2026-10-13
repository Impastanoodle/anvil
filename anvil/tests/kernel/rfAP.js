  // ------------------------------------------------------------------ rfAP: Constrain All, Modify Sketch, Segment, Equation Driven Curve
  (function () {
    var S = typeof SketchSolver !== 'undefined' ? SketchSolver : null;
    if (!S || !S.constrainAll) return;
    group('rfAP: Constrain All, Modify Sketch, Segment, Equation Driven Curve');
    function blank() {
      return { entities: [{ t: 'line', x1: 0, y1: 0, x2: 9, y2: 1e-7 }, { t: 'arc', cx: 9, cy: 1, r: 1, a0: 270, a1: 360 }, { t: 'line', x1: 10, y1: 1, x2: 10, y2: 6 },
        { t: 'line', x1: 10, y1: 6, x2: 0, y2: 6 }, { t: 'line', x1: 0, y1: 6, x2: 0, y2: 0 }, { t: 'circle', cx: 5, cy: 3, r: 0.5 }] };
    }
    test('rfAP: constrainAll — an unrelated imported blank gets Coincident ends (one on the origin), Horizontal / Vertical, Tangent at the R1 corner, then dimensions: Fully Defined, no redundancy', function () {
      var sk = blank(), r = S.constrainAll(sk);
      assert(r.ok, r.error);
      assert(r.added.coincident === 6 && r.added.horizontal === 2 && r.added.vertical === 2 && r.added.tangent === 2, JSON.stringify(r.added));
      var an = S.analyze(sk);
      assert(an.status === 'full' && an.redundant === 0 && an.conflicts === 0, an.status + ' ' + an.redundant + ' ' + an.conflicts);
      near(sk.entities[0].y2, 0, 1e-12, 'level');
      // again: nothing new
      var r2 = S.constrainAll(sk, { fullyDefine: false });
      assert(r2.ok && r2.relations === 0, 'second run added ' + r2.relations);
      return r.relations + ' relations, ' + r.dims + ' dims';
    });
    test('rfAP: constrainAll — ends 0.01 apart are left alone at the default tolerance and joined with tol 0.02; a rectangle drawn as four lines needs no redundant H / V', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'line', x1: 4.01, y1: 0, x2: 4, y2: 3 }] };
      var r = S.constrainAll(sk, { fullyDefine: false });
      assert(r.added.coincident === 1, 'only the origin: ' + JSON.stringify(r.added));
      r = S.constrainAll(sk, { fullyDefine: false, tol: 0.02 });
      assert(r.added.coincident === 1 && S.analyze(sk).conflicts === 0, 'joined: ' + JSON.stringify(r.added));
      return 'ok';
    });
    test('rfAP: modifySketch — translate, rotate 90° about the origin, scale ×2 and flip keep every relation satisfied; a flipped arc keeps its Tangent / Coincident ends; origin relations are dropped', function () {
      var sk = blank();
      S.constrainAll(sk, { fullyDefine: false });
      var r = S.modifySketch(sk, { dx: 2, dy: -1 });
      assert(r.ok && r.dropped === 1, 'translate ' + JSON.stringify(r));
      var b = S.sketchBox(sk);
      near(b.x0, 2, 1e-9); near(b.y0, -1, 1e-9);
      r = S.modifySketch(sk, { rot: 90, cx: 0, cy: 0 });
      b = S.sketchBox(sk);
      assert(r.ok, r.error); near(b.x0, -5, 1e-9); near(b.y1, 12, 1e-9);
      r = S.modifySketch(sk, { s: 2, cx: 0, cy: 0 });
      b = S.sketchBox(sk);
      assert(r.ok, r.error); near(b.x1 - b.x0, 12, 1e-9); near(b.y1 - b.y0, 20, 1e-9);
      r = S.modifySketch(sk, { flip: 'h', cx: 0 });
      assert(r.ok, r.error);
      b = S.sketchBox(sk); near(b.x0, -2, 1e-9); near(b.x1, 10, 1e-9);
      var an = S.analyze(sk);
      assert(an.conflicts === 0 && an.redundant === 0, 'after flip: ' + an.conflicts + ' / ' + an.redundant);
      assert(sk.rels.filter(function (x) { return x.type === 'tangent'; }).length === 2, 'tangents kept');
      r = S.modifySketch(sk, { s: 0 });
      assert(!r.ok, 'scale 0 refused');
      return 'ok';
    });
    test('rfAP: segmentEntity — 4 segments on a line: 3 points at 2, 4, 6 Coincident with it; 6 round a circle; an arc split into 3 equal arcs (Concentric, Equal)', function () {
      var sk = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 8, y2: 0 }, { t: 'circle', cx: 20, cy: 0, r: 2 }, { t: 'arc', cx: 0, cy: 0, r: 5, a0: 0, a1: 90 }] };
      var r = S.segmentEntity(sk, 0, 4);
      assert(r.ok && r.added.length === 3, JSON.stringify(r));
      assert(r.points.map(function (p) { return p[0]; }).join() === '2,4,6', 'points ' + JSON.stringify(r.points));
      r = S.segmentEntity(sk, 1, 6);
      assert(r.ok && r.added.length === 6, 'circle');
      r = S.segmentEntity(sk, 2, 3, { split: true });
      assert(r.ok, r.error);
      var arcs = sk.entities.filter(function (e) { return e.t === 'arc'; });
      assert(arcs.length === 3, 'arcs ' + arcs.length);
      arcs.forEach(function (a) { near(a.a1 - a.a0, 30, 1e-9, 'sweep'); });
      assert(S.analyze(sk).conflicts === 0, 'conflicts');
      assert(!S.segmentEntity(sk, 0, 1).ok, 'one segment refused');
      return 'ok';
    });
    test('rfAP: equationPoints — y = 2*sin(x) over 0..pi peaks at 2; x = cos(t), y = sin(t) is on the unit circle; unknown names refused; the curve round-trips through the script', function () {
      var r = S.equationPoints({ kind: 'explicit', y: '2*sin(x)', x0: '0', x1: 'pi', n: 24 });
      assert(r.ok && r.pts.length === 25, r.error);
      near(r.pts[12][1], 2, 1e-9); near(r.pts[24][0], Math.PI, 1e-9); near(r.pts[24][1], 0, 1e-12);
      r = S.equationPoints({ kind: 'parametric', x: 'cos(t)', y: 'sin(t)', t0: 0, t1: '2*pi', n: 12 });
      assert(r.ok, r.error);
      r.pts.forEach(function (p) { near(Math.hypot(p[0], p[1]), 1, 1e-9); });
      assert(!S.equationPoints({ kind: 'explicit', y: 'window.x', x0: 0, x1: 1 }).ok, 'refused');
      assert(!S.equationPoints({ kind: 'explicit', y: 'x^2', x0: 1, x1: 1 }).ok, 'empty range refused');
      var pts = S.equationPoints({ kind: 'explicit', y: 'x^2', x0: 0, x1: 2, n: 4 }).pts;
      var m = K.newModel('eq');
      m.features.push({ id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: [{ t: 'spline', pts: pts, eq: { kind: 'explicit', y: 'x^2', x0: 0, x1: 2, n: 4 } }] });
      var src = K.generateScript(m), m2 = K.newModel('x');
      K.runScript(m2, src);
      var sp = m2.features.filter(function (f) { return f.type === 'sketch'; })[0].entities[0];
      assert(sp.eq && sp.eq.y === 'x^2' && sp.pts.length === 5, 'round trip ' + JSON.stringify(sp));
      return 'ok';
    });
  })();
  // --- end rfAP ---

