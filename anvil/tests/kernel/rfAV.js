  // --- rfAV ---
  (function () {
    var S = window.SketchSolver;
    if (!S) return;
    group('rfAV: the solver never shrinks a line to nothing');
    function len(e) { return Math.hypot(e.x2 - e.x1, e.y2 - e.y1); }
    test('rfAV: Horizontal + Vertical on one line is a conflict and the line keeps its length; deleting Horizontal (or Vertical) turns it at the same length', function () {
      var g = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 0.2 }] };
      assert(S.addRelation(g, 'horizontal', ['0']).status === 'ok', 'H');
      near(len(g.entities[0]), 3, 1e-9, 'H levels the ends');
      var L0 = len(g.entities[0]), v = S.addRelation(g, 'vertical', ['0']);
      assert(v.ok && v.status === 'conflict', 'V on a horizontal line is a conflict: ' + v.status);
      near(len(g.entities[0]), L0, 1e-9, 'not collapsed by the conflict');
      S.deleteRelation(g, 0);
      var r = S.solve(g), e = g.entities[0];
      assert(r.ok, 'solves with Vertical alone');
      near(e.x2 - e.x1, 0, 1e-6, 'vertical');
      near(len(e), L0, 1e-6, 'same length after Horizontal is deleted');
      // the other way round: a vertical line given Horizontal, then Vertical deleted
      var g2 = { entities: [{ t: 'line', x1: 1, y1: 1, x2: 1.1, y2: 5 }] };
      S.addRelation(g2, 'vertical', ['0']); var L2 = len(g2.entities[0]);
      assert(S.addRelation(g2, 'horizontal', ['0']).status === 'conflict', 'H on a vertical line conflicts');
      S.deleteRelation(g2, 0); assert(S.solve(g2).ok, 'solves');
      near(g2.entities[0].y2 - g2.entities[0].y1, 0, 1e-6, 'horizontal'); near(len(g2.entities[0]), L2, 1e-6, 'same length');
      return 'length ' + L0.toFixed(4);
    });
    test('rfAV: a line still shortens and moves freely (a length dimension, a Coincident end) and a line already of zero length is left alone', function () {
      var g = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }], dims: [{ e: 0, k: 'len' }] };
      assert(S.setDim(g, 0, 0.01).ok, 'a 0.01 line');
      near(len(g.entities[0]), 0.01, 1e-9, 'shortened');
      var z = { entities: [{ t: 'line', x1: 2, y1: 2, x2: 2, y2: 2 }, { t: 'line', x1: 0, y1: 0, x2: 5, y2: 0 }] };
      assert(S.addRelation(z, 'coincident', ['0.p1', '1.p2']).ok, 'a zero-length line still takes relations');
      return 'ok';
    });
  })();
  // --- end rfAV ---
