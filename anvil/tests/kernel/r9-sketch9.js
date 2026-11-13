  // --- r9/sketch9 ---
  (function () {
    group('r9/sketch9: Offset Entities on rectangles and slots: one linked offset dimension');
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    [['rect', { t: 'rect', x: 0, y: 0, w: 40, h: 20 }], ['crect', { t: 'crect', cx: 5, cy: 5, w: 40, h: 20 }]].forEach(function (c) {
      test(c[0] + ' offset: Coincident centres + Offset + ONE distance; changing it to 5 moves every side by 5 (w 50, h 30), fully defined', function () {
        var s = { entities: [c[1]], rels: [{ type: 'fix', refs: ['0.v0'] }, { type: 'fix', refs: ['0.v2'] }] };
        s.entities.push(SS.offsetEntity(s.entities[0], 2));
        s.rels = s.rels.concat(SS.offsetRelations(s, 0, 1));
        assert(s.rels.some(function (r) { return r.type === 'offset' && r.refs.join() === '0,1'; }), JSON.stringify(s.rels));
        var added = SS.offsetDimensions(s, 0, 1, 2);
        assert(added.length === 1 && s.rels[added[0]].type === 'distance' && s.rels[added[0]].v === 2, JSON.stringify(s.rels));
        var an = SS.analyze(s);
        assert(an.dof === 0 && an.status === 'full', 'status ' + an.status + ' dof ' + an.dof);
        assert(SS.setRelValue(s, added[0], 5).ok, 'set 5');
        near(s.entities[1].w, 50, 1e-7, 'w'); near(s.entities[1].h, 30, 1e-7, 'h');
        var cA = SS.refPoint(s, '0.c'), cB = SS.refPoint(s, '1.c');
        near(cA[0], cB[0], 1e-7, 'cx'); near(cA[1], cB[1], 1e-7, 'cy');
        var orel = s.rels.filter(function (r) { return r.type === 'offset'; })[0];
        assert(SS.describe(s, orel) === 'Offset: Rectangle1, Rectangle2', SS.describe(s, orel));
        assert(SS.applicable(s, ['0', '1']).indexOf('offset') < 0, 'never offered in Add Relations');
      });
    });
    test('inward rectangle offset (Reverse): the copy stays inside, 3 all round after the edit', function () {
      var s = { entities: [{ t: 'rect', x: 0, y: 0, w: 40, h: 20 }], rels: [{ type: 'fix', refs: ['0.v0'] }, { type: 'fix', refs: ['0.v2'] }] };
      s.entities.push(SS.offsetEntity(s.entities[0], -2));
      s.rels = s.rels.concat(SS.offsetRelations(s, 0, 1));
      var added = SS.offsetDimensions(s, 0, 1, -2);
      assert(added.length === 1 && SS.analyze(s).dof === 0, 'dof ' + SS.analyze(s).dof);
      assert(SS.setRelValue(s, added[0], 3).ok, 'set');
      near(s.entities[1].w, 34, 1e-7, 'w'); near(s.entities[1].h, 14, 1e-7, 'h');
    });
    test('slot offset: Coincident centres + a radial offset dimension (half the width difference); editing it widens the copy; fully defined', function () {
      var s = { entities: [{ t: 'slot', x1: 0, y1: 0, x2: 30, y2: 10, w: 8 }], rels: [{ type: 'fix', refs: ['0'] }] };
      s.entities.push(SS.offsetEntity(s.entities[0], 2));
      s.rels = s.rels.concat(SS.offsetRelations(s, 0, 1));
      var added = SS.offsetDimensions(s, 0, 1, 2);
      assert(added.length === 1 && s.rels[added[0]].dir === 'r' && s.rels[added[0]].v === 2, JSON.stringify(s.rels));
      near(SS.measure(s, 'distance', ['0', '1'], 'r'), 2, 1e-9, 'measure');
      assert(SS.analyze(s).dof === 0, 'dof ' + SS.analyze(s).dof);
      assert(SS.setRelValue(s, added[0], 4.5).ok, 'set');
      near(s.entities[1].w, 17, 1e-7, 'w'); near(s.entities[1].x2, 30, 1e-7, 'x2');
    });
    test('script round trip: .rel("offset", ...) and a radial slot distance survive generateScript / runScript', function () {
      var m = K.newModel('Off9');
      new K.Builder(m).sketch('Front').rect(0, 0, 40, 20).rect(-2, -2, 44, 24).slot(0, 40, 30, 40, 8).slot(0, 40, 30, 40, 12)
        .rel('fix', ['0.v0']).rel('fix', ['0.v2']).rel('coincident', ['0.c', '1.c']).rel('offset', ['0', '1']).rel('distance', ['0.e0', '1.e0'], { value: 2 })
        .rel('fix', ['2']).rel('coincident', ['2.p1', '3.p1']).rel('coincident', ['2.p2', '3.p2']).rel('distance', ['2', '3'], { value: 2, dir: 'r' }).id();
      var f = m.features[0];
      assert(SS.analyze(f).status === 'full', SS.analyze(f).status);
      var s1 = K.generateScript(m);
      assert(/\.rel\("offset", \["0","1"\]\)/.test(s1) && /"dir":"r"/.test(s1), s1);
      var m2 = K.newModel('x');
      K.runScript(m2, s1);
      assert(JSON.stringify(m2.features[0].rels) === JSON.stringify(f.rels), JSON.stringify(m2.features[0].rels));
    });
    test('inference: a level / upright slot gets Horizontal / Vertical; a Center Rectangle / Polygon started on the origin is Coincident with it; an end at the middle of a rectangle edge gets Midpoint', function () {
      var s = { entities: [{ t: 'slot', x1: 0, y1: 5, x2: 20, y2: 5, w: 4 }] };
      SS.infer(s, 0);
      assert((s.rels || []).some(function (r) { return r.type === 'horizontal' && r.refs.join() === '0'; }), JSON.stringify(s.rels));
      s.entities.push({ t: 'slot', x1: 40, y1: 0, x2: 40, y2: 20, w: 4 }); SS.infer(s, 1);
      assert(s.rels.some(function (r) { return r.type === 'vertical' && r.refs.join() === '1'; }), JSON.stringify(s.rels));
      var c = { entities: [{ t: 'crect', cx: 0, cy: 0, w: 80, h: 50 }] };
      SS.infer(c, 0);
      assert((c.rels || []).some(function (r) { return r.type === 'coincident' && r.refs.join() === '0.c,O'; }), 'crect centre ' + JSON.stringify(c.rels));
      var p = { entities: [{ t: 'poly', cx: 0, cy: 0, r: 10, n: 6, rot: 0 }] };
      SS.infer(p, 0);
      assert((p.rels || []).some(function (r) { return r.type === 'coincident' && r.refs.join() === '0.c,O'; }), 'polygon centre ' + JSON.stringify(p.rels));
      var r = { entities: [{ t: 'rect', x: 0, y: 0, w: 40, h: 20 }] };
      SS.infer(r, 0);
      assert(!(r.rels || []).some(function (x) { return x.refs.indexOf('0.c') >= 0; }), 'a corner rectangle centre infers nothing');
      c.entities.push({ t: 'line', x1: 0, y1: 25, x2: 0, y2: -25, construction: true });
      SS.infer(c, 1);
      var ks = c.rels.map(function (x) { return x.type + ':' + x.refs.join(); }).join(' ');
      // rfMM (2026-11-13): both ends at edge midpoints keep Midpoint (SolidWorks); the Vertical they make redundant goes
      assert(ks.indexOf('midpoint:1.p1,0.e2') >= 0 && ks.indexOf('midpoint:1.p2,0.e0') >= 0 && ks.indexOf('vertical:1') < 0, ks);
      assert(SS.analyze(c).redundant === 0, 'nothing redundant: ' + ks);
    });
  })();
  // --- end r9/sketch9 ---
