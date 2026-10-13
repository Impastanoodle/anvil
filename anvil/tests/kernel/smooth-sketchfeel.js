  // --- smooth/sketchfeel ---
  (function () {
    group('smooth/sketchfeel: dragging solves only the geometry tied to what is dragged');
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    function copy(o) { return JSON.parse(JSON.stringify(o)); }
    test('a drag in one piece of a two-piece sketch leaves the other piece alone (bit for bit) and is not blocked by a conflict there; the dragged piece keeps its relations', function () {
      // piece A: an L of two lines from the origin (Horizontal, Vertical, corner Coincident); piece B: two circles held
      // Equal but dimensioned 10 and 16 (a conflict)
      var s = { entities: [
        { t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'line', x1: 20, y1: 0, x2: 20, y2: 15 },
        { t: 'circle', cx: 60, cy: 0, r: 5 }, { t: 'circle', cx: 80, cy: 0, r: 8 }
      ], rels: [
        { type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'vertical', refs: ['1'] }, { type: 'coincident', refs: ['1.p1', '0.p2'] },
        { type: 'equal', refs: ['2', '3'] }
      ], dims: [{ e: 2, k: 'dia' }, { e: 3, k: 'dia' }] };
      var B = JSON.stringify(s.entities.slice(2));
      var r = SS.drag(s, '1.p2', [31, 22], copy(s.entities));
      assert(r.ok, 'the drag is not blocked by the conflicting circles');
      assert(JSON.stringify(s.entities.slice(2)) === B, 'the other piece moved: ' + JSON.stringify(s.entities.slice(2)));
      near(s.entities[1].x1, 31, 1e-6, 'corner follows in x'); near(s.entities[1].y2, 22, 1e-6, 'end follows in y');
      near(s.entities[0].y1, 0, 1e-9, 'still horizontal'); near(s.entities[0].x1, 0, 1e-9, 'still on the origin');
      near(s.entities[1].x2, s.entities[1].x1, 1e-9, 'still vertical'); near(s.entities[0].x2, s.entities[1].x1, 1e-9, 'corner still coincident');
      return 'corner at (' + s.entities[1].x1 + ', ' + s.entities[1].y2 + ')';
    });
    test('the sparse J·Jᵀ / Jᵀ·J products solve as the dense ones did: a Line-tool rectangle solved from a skewed start lands on 50 × 30 exactly, Fully Defined', function () {
      var s = { entities: [
        { t: 'line', x1: 0.3, y1: -0.2, x2: 47, y2: 1 }, { t: 'line', x1: 47, y1: 1, x2: 49, y2: 33 },
        { t: 'line', x1: 49, y1: 33, x2: -1, y2: 29 }, { t: 'line', x1: -1, y1: 29, x2: 0.3, y2: -0.2 }
      ], rels: [
        { type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['3'] },
        { type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'coincident', refs: ['1.p1', '0.p2'] }, { type: 'coincident', refs: ['2.p1', '1.p2'] }, { type: 'coincident', refs: ['3.p1', '2.p2'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] }
      ], dims: [{ e: 0, k: 'len' }, { e: 1, k: 'len' }] };
      var r = SS.setDim(s, 0, 50);
      assert(r.ok, JSON.stringify(r));
      r = SS.setDim(s, 1, 30);
      assert(r.ok, JSON.stringify(r));
      var want = [[0, 0, 50, 0], [50, 0, 50, 30], [50, 30, 0, 30], [0, 30, 0, 0]];
      s.entities.forEach(function (e, i) { [e.x1, e.y1, e.x2, e.y2].forEach(function (v, k) { near(v, want[i][k], 1e-9, 'line ' + i + '[' + k + ']'); }); });
      assert(SS.analyze(s).status === 'full', 'fully defined');
    });
  })();
  // --- end smooth/sketchfeel ---
