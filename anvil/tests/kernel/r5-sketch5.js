  // --- r5/sketch5 ---
  (function () {
    group('r5/sketch5: angle dimensions by quadrant (supplementary), label positions kept through explode / scripts');
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    function anchor(e, d) {   // where a linear dimension's label sits (ui-sketch.js dimAnchor without the screen default)
      var g = K.dimGeometry(e, d), n = [-g.dir[1], g.dir[0]], t = g.value / 2 + (d.tx || 0);
      return [g.P[0] + n[0] * d.off + g.dir[0] * t, g.P[1] + n[1] * d.off + g.dir[1] * t];
    }
    test('an angle placed in the obtuse quadrant (sup) measures and drives the supplementary angle; q / ta are kept', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 0, y1: 0, x2: 30, y2: 30 }], rels: [{ type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['1.p1', 'O'] }] };
      near(SS.measure(s, 'angle', ['0', '1']), 45, 1e-9, 'plain');
      near(SS.measure(s, 'angle', ['0', '1'], null, true), 135, 1e-9, 'supplementary');
      var r = SS.addRelation(s, 'angle', ['0', '1'], { sup: true, q: -1, ta: 12.5, off: 10 });
      var rel = s.rels[3];
      assert(r.ok && rel.sup === true && rel.q === -1 && rel.ta === 12.5 && Math.abs(rel.v - 135) < 1e-9, JSON.stringify(rel));
      var sv = SS.setRelValue(s, 3, 120);
      assert(sv.ok, JSON.stringify(sv));
      var e = s.entities[1], a = Math.atan2(e.y2 - e.y1, e.x2 - e.x1) * 180 / Math.PI;
      near(a, 60, 1e-6, 'the line turned to 60° (120° on the other side)');
      near(SS.measure(s, 'angle', ['0', '1'], null, true), 120, 1e-6, 'reads 120');
      var r2 = SS.addRelation(s, 'angle', ['0', '1'], { driven: true, sup: true });
      assert(r2.ok && Math.abs(s.rels[4].v - 120) < 1e-6, 'driven supplementary angle ' + JSON.stringify(s.rels[4]));
      return 'angle ' + a.toFixed(3);
    });
    test('script round trip keeps an angle\'s quadrant and label place ({ sup, q, ta })', function () {
      var m = K.newModel();
      K.runScript(m, 'p.sketch("Front").line(0,0,40,0).line(0,0,30,30).id();');
      var f = m.features.filter(function (x) { return x.type === 'sketch'; })[0];
      var r = SS.addRelation(f, 'angle', ['0', '1'], { sup: true, q: -1, ta: -20, off: 12 });
      assert(r.ok, JSON.stringify(r));
      var src = K.generateScript(m);
      assert(/"sup":true/.test(src) && /"q":-1/.test(src) && /"ta":-20/.test(src), src);
      var m2 = K.newModel();
      K.runScript(m2, src);
      var g = m2.features.filter(function (x) { return x.type === 'sketch'; })[0], rel = g.rels[0];
      assert(rel.sup === true && rel.q === -1 && rel.ta === -20 && rel.off === 12 && Math.abs(rel.v - 135) < 1e-9, JSON.stringify(rel));
      assert(K.generateScript(m2) === src, 'stable script');
      return 'ok';
    });
    test('a rectangle that becomes four lines keeps its width / height labels where they were (tx flips with the top / left lines)', function () {
      var rect = { t: 'rect', x: 0, y: 0, w: 40, h: 20 };
      var s = { entities: [rect], dims: [{ e: 0, k: 'w', i: 2, off: 6, tx: 9 }, { e: 0, k: 'h', off: -5, tx: -4 }, { e: 0, k: 'w', off: -6, tx: 7 }] };
      var before = s.dims.map(function (d) { return anchor(rect, d); });
      SS.explodeRect(s, 0);
      var after = s.dims.map(function (d) { return anchor(s.entities[d.e], d); });
      before.forEach(function (p, k) { near(after[k][0], p[0], 1e-9, 'label ' + k + ' x'); near(after[k][1], p[1], 1e-9, 'label ' + k + ' y'); });
      return JSON.stringify(after);
    });
  })();
  // --- end r5/sketch5 ---

