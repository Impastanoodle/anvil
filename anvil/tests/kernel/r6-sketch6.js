  // --- r6/sketch6 ---
  (function () {
    group('r6/sketch6: Offset Entities adds a driving offset dimension (radial for circles, parallel for lines)');
    if (typeof SketchSolver === 'undefined') return;
    var SS = SketchSolver;
    test('circle offset: Concentric + a radial distance (dir r) = 2; changing it to 5 grows the copy to r 15 and keeps it concentric', function () {
      var s = { entities: [{ t: 'circle', cx: 3, cy: 4, r: 10 }], rels: [{ type: 'fix', refs: ['0'] }] };
      s.entities.push(SS.offsetEntity(s.entities[0], 2));
      s.rels = s.rels.concat(SS.offsetRelations(s, 0, 1));
      var added = SS.offsetDimensions(s, 0, 1, 2);
      assert(added.length === 1 && s.rels[added[0]].dir === 'r' && s.rels[added[0]].v === 2, JSON.stringify(s.rels));
      near(SS.measure(s, 'distance', ['0', '1'], 'r'), 2, 1e-9, 'measure radial');
      assert(SS.analyze(s).dof === 0, 'fully defined, dof ' + SS.analyze(s).dof);
      var r = SS.setRelValue(s, added[0], 5);
      assert(r.ok, r.error);
      near(s.entities[1].r, 15, 1e-7, 'r'); near(s.entities[1].cx, 3, 1e-7, 'cx');
    });
    test('line offset: a parallel copy d along the left normal, Parallel + a parallel distance that drives it', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }], rels: [{ type: 'fix', refs: ['0'] }] };
      var o = SS.offsetEntity(s.entities[0], 3);
      assert(o.t === 'line' && Math.abs(o.y1 - 3) < 1e-12 && Math.abs(o.y2 - 3) < 1e-12, JSON.stringify(o));
      s.entities.push(o);
      s.rels = s.rels.concat(SS.offsetRelations(s, 0, 1));
      var added = SS.offsetDimensions(s, 0, 1, 3);
      assert(added.length === 1 && s.rels[added[0]].type === 'distance', JSON.stringify(s.rels));
      assert(SS.setRelValue(s, added[0], 7).ok, 'set');
      near(s.entities[1].y1, 7, 1e-7, 'y1'); near(s.entities[1].y2, 7, 1e-7, 'y2 (stays parallel)');
    });
    test('rectangle / polygon offsets are fully defined by the copy relations and the offset dimensions', function () {
      var s = { entities: [{ t: 'rect', x: 0, y: 0, w: 40, h: 20 }], rels: [{ type: 'fix', refs: ['0.v0'] }, { type: 'fix', refs: ['0.v2'] }] };
      s.entities.push(SS.offsetEntity(s.entities[0], 2));
      s.rels = s.rels.concat(SS.offsetRelations(s, 0, 1));
      assert(SS.offsetDimensions(s, 0, 1, 2).length === 1 && SS.analyze(s).dof === 0, 'rect dof ' + SS.analyze(s).dof);   // r9/sketch9: one dimension, the Offset relation links the sides
      var h = { entities: [{ t: 'poly', cx: 0, cy: 0, r: 10, n: 6, rot: 0 }], rels: [{ type: 'fix', refs: ['0.c'] }, { type: 'fix', refs: ['0.v0'] }] };
      h.entities.push(SS.offsetEntity(h.entities[0], 2));
      h.rels = h.rels.concat(SS.offsetRelations(h, 0, 1));
      assert(SS.offsetDimensions(h, 0, 1, 2).length === 1 && SS.analyze(h).dof === 0, 'poly dof ' + SS.analyze(h).dof);
    });
  })();
  // --- end r6/sketch6 ---
