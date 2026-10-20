  // --- rfCY (2026-10-20, lane CY: sketch follow-ups) --- every trim, extend and split path of SketchSolver keeps the
  // entity's layer and construction flag on each piece it leaves (QUEUE 2026-10-07T13: "trims drop the layer"). The
  // entity under test is on layer CUT (a construction one on BEND); the cutting entities are on no layer.
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    group('rfCY: trims keep the layer');
    var SS = SketchSolver;
    function sk(ents) { return { entities: JSON.parse(JSON.stringify(ents)), layers: [{ name: 'CUT' }, { name: 'BEND' }] }; }
    // every entity that is not one of the cutters (no layer given) is on `layer` (and construction when `con`)
    function kept(f, n, layer, con, label, axis) {   // axis: a slot drawn as SolidWorks draws it has a construction centreline (on the slot's layer)
      var mine = f.entities.filter(function (e) { return e.layer != null || e.construction; });
      assert(mine.length >= n, label + ': ' + mine.length + ' pieces, expected ' + n + ': ' + JSON.stringify(f.entities));
      mine.forEach(function (e) { assert(e.layer === layer && (!!e.construction === !!con || (axis && e.construction)), label + ': a piece lost its layer / flag: ' + JSON.stringify(e)); });
    }
    var VL = { t: 'line', x1: 5, y1: -20, x2: 5, y2: 20 }, VL2 = { t: 'line', x1: 15, y1: -20, x2: 15, y2: 20 }, HL = { t: 'line', x1: -20, y1: 0, x2: 30, y2: 0 };
    test('rfCY: Trim to closest keeps the layer on lines, rectangles, slots, circles, arcs, polygons, splines, ellipses, polylines and infinite lines', function () {
      var cases = [
        ['line', [{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0, layer: 'CUT' }, VL, VL2], [10, 0], 2],
        ['rect', [{ t: 'rect', x: 0, y: -5, w: 20, h: 10, layer: 'CUT' }, VL], [12, -5], 4],
        ['slot', [{ t: 'slot', x1: 0, y1: 0, x2: 20, y2: 0, w: 4, layer: 'CUT' }, VL, VL2], [10, 2], 4],
        ['circle', [{ t: 'circle', cx: 0, cy: 0, r: 5, layer: 'CUT' }, HL], [0, 5], 1],
        ['arc', [{ t: 'arc', cx: 0, cy: 0, r: 5, a0: 0, a1: 180, layer: 'CUT' }, { t: 'line', x1: 0, y1: -10, x2: 0, y2: 10 }], [3, 4], 1],
        ['poly', [{ t: 'poly', cx: 0, cy: 0, r: 5, rot: 0, n: 6, layer: 'CUT' }, { t: 'line', x1: -10, y1: 0.5, x2: 10, y2: 0.5 }], [0, 4.3], 1],
        ['spline', [{ t: 'spline', pts: [[0, 0], [10, 6], [20, 0]], layer: 'CUT' }, VL, VL2], [10, 6], 2],
        ['ellipse', [{ t: 'ellipse', cx: 0, cy: 0, rx: 5, ry: 3, rot: 0, layer: 'CUT' }, HL], [0, 3], 1],
        ['polyline', [{ t: 'polyline', pts: [[0, 0], [20, 0], [20, 10]], layer: 'CUT' }, VL], [2, 0], 1],
        ['infinite line', [{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0, layer: 'CUT', infinite: true }, VL, VL2], [10, 0], 2]
      ];
      cases.forEach(function (c) {
        var f = sk(c[1]), r = SS.trimAt(f, 0, c[2], {});
        assert(r && r.ok, c[0] + ': ' + JSON.stringify(r));
        kept(f, c[3], 'CUT', false, c[0], c[0] === 'slot');
      });
      // a construction line on BEND stays construction on BEND
      var g = sk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0, layer: 'BEND', construction: true }, VL, VL2]);
      assert(SS.trimAt(g, 0, [10, 0], {}).ok, 'construction trim');
      kept(g, 2, 'BEND', true, 'construction');
    });
    test('rfCY: Keep trimmed entities as construction — the piece kept is construction on the same layer; Power trim, Trim away inside / outside, Corner, Extend and Split keep the layer', function () {
      var f = sk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0, layer: 'CUT' }, VL]);
      assert(SS.trimAt(f, 0, [15, 0], { keepConstruction: true }).ok, 'keep as construction');
      var con = f.entities.filter(function (e) { return e.construction; }), solid = f.entities.filter(function (e) { return e.layer && !e.construction; });
      assert(con.length === 1 && con[0].layer === 'CUT' && solid.length === 1, 'kept span ' + JSON.stringify(f.entities));
      f = sk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0, layer: 'CUT' }, VL, VL2]);
      assert(SS.powerTrim(f, [10, -1], [10, 1], null, {}) === 1, 'power trim');
      kept(f, 2, 'CUT', false, 'power trim');
      f = sk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0, layer: 'CUT' }, VL, VL2]);
      assert(SS.trimBetween(f, 0, [10, 0], [1, 2], false, {}).ok, 'trim inside');
      kept(f, 2, 'CUT', false, 'trim away inside');
      f = sk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0, layer: 'CUT' }, VL, VL2]);
      assert(SS.trimBetween(f, 0, [10, 0], [1, 2], true, {}).ok, 'trim outside');
      kept(f, 1, 'CUT', false, 'trim away outside');
      f = sk([{ t: 'line', x1: 0, y1: 0, x2: 8, y2: 0, layer: 'CUT' }, { t: 'line', x1: 10, y1: 2, x2: 10, y2: 10, layer: 'CUT' }]);
      assert(SS.cornerTrim(f, 0, [4, 0], 1, [10, 6]).ok, 'corner');
      kept(f, 2, 'CUT', false, 'corner');
      near(f.entities[0].x2, 10, 1e-9, 'corner: the lines meet');
      f = sk([{ t: 'line', x1: 0, y1: 0, x2: 8, y2: 0, layer: 'CUT' }, VL2]);
      var ex = SS.extendEntity(f, 0, [8, 0]);
      assert(ex && ex.ok !== false && f.entities[0].x2 === 15, 'extend ' + JSON.stringify(ex) + ' ' + JSON.stringify(f.entities[0]));
      kept(f, 1, 'CUT', false, 'extend');
      f = sk([{ t: 'spline', pts: [[0, 0], [10, 6], [20, 0]], layer: 'CUT' }]);
      assert(SS.freeSplit(f, 0, [[10, 6]]).ok, 'split a spline');
      kept(f, 2, 'CUT', false, 'split');
    });
    test('rfCY: SketchSolver.withSkip leaves entities out of Power trim\'s trail and Extend\'s targets (the UI passes a hidden layer\'s), and only inside it', function () {
      function hid(e) { return e.layer === 'BEND'; }
      var f = sk([{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0, layer: 'BEND' }, { t: 'line', x1: 0, y1: 5, x2: 20, y2: 5 }, VL]);
      var n = SS.withSkip(hid, function () { return SS.powerTrim(f, [10, -1], [10, 6], null, {}); });
      assert(n === 1 && f.entities[0].x1 === 0 && f.entities[0].x2 === 20, 'only the shown line: ' + n + ' ' + JSON.stringify(f.entities));
      var g = sk([{ t: 'line', x1: 0, y1: 0, x2: 2, y2: 0, layer: 'CUT' }, { t: 'line', x1: 5, y1: -9, x2: 5, y2: 9, layer: 'BEND' }, VL2]);
      var r = SS.withSkip(hid, function () { return SS.extendEntity(g, 0, [2, 0]); });
      assert(r && r.ok !== false && g.entities[0].x2 === 15, 'past the skipped line: ' + JSON.stringify(g.entities[0]));
      var h = sk([{ t: 'line', x1: 0, y1: 0, x2: 2, y2: 0, layer: 'CUT' }, { t: 'line', x1: 5, y1: -9, x2: 5, y2: 9, layer: 'BEND' }, VL2]);
      assert(SS.extendEntity(h, 0, [2, 0]).ok !== false && h.entities[0].x2 === 5, 'outside withSkip it stops at the first line: ' + JSON.stringify(h.entities[0]));
      var threw = false;
      try { SS.withSkip(hid, function () { throw new Error('x'); }); } catch (e) { threw = true; }
      var k = sk([{ t: 'line', x1: 0, y1: 0, x2: 2, y2: 0 }, { t: 'line', x1: 5, y1: -9, x2: 5, y2: 9, layer: 'BEND' }]);
      assert(threw && SS.extendEntity(k, 0, [2, 0]).ok !== false && k.entities[0].x2 === 5, 'the skip is gone after a throw');
    });
  })();
