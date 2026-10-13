  // ------------------------------------------------------------------ box selection geometry (ui-select.js)
  (function () {
    group('box selection geometry (ui-select.js BoxSelect)');
    var BS = window.BoxSelect;
    test('rect: left-to-right drag is a window, right-to-left a crossing box; corners normalised', function () {
      assert(BS, 'BoxSelect missing (ui-select.js not loaded)');
      var w = BS.rect([10, 50], [110, 0]), c = BS.rect([110, 0], [10, 50]);
      assert(w.mode === 'window' && c.mode === 'crossing', w.mode + ' / ' + c.mode);
      assert(w.x0 === 10 && w.x1 === 110 && w.y0 === 0 && w.y1 === 50 && c.x0 === 10 && c.y1 === 50, JSON.stringify(c));
      assert(BS.rect([5, 5], [5, 9]).mode === 'window', 'a vertical drag counts as a window');
      return 'ok';
    });
    test('segments: window needs both ends inside; crossing any touch (through the box, a corner graze, a boundary point), not a near miss', function () {
      var r = BS.rect([0, 0], [10, 10]);
      assert(BS.segment([2, 2], [8, 3], r, 'window') && BS.segment([2, 2], [8, 3], r, 'crossing'), 'inside');
      assert(!BS.segment([-5, 5], [15, 5], r, 'window') && BS.segment([-5, 5], [15, 5], r, 'crossing'), 'through');
      assert(BS.segHits([-5, 5], [5, -5], r), 'grazes the corner (0, 0)');
      assert(BS.segHits([-5, 5.01], [5.01, -5], r), 'cuts the corner');
      assert(!BS.segHits([-5, 4.99], [4.99, -5.01], r), 'passes just outside the corner');
      assert(BS.segHits([10, 20], [10, 10], r) && !BS.segHits([10.001, 20], [10.001, -5], r), 'boundary point in, parallel just outside out');
      assert(BS.segHits([3, 3], [3, 3], r) && !BS.segHits([11, 3], [11, 3], r), 'degenerate (end-on) segments');
      return 'ok';
    });
    test('triangles: box inside a triangle, triangle inside the box, edge crossing, and a miss whose bounding boxes overlap', function () {
      var r = BS.rect([4, 4], [6, 6]);
      assert(BS.triHits([0, 0], [20, 0], [0, 20], r) && BS.pointInTri([5, 5], [0, 0], [20, 0], [0, 20]), 'box inside the triangle');
      var big = BS.rect([-10, -10], [30, 30]);
      assert(BS.triangles([0, 0, 20, 0, 0, 20], big, 'window') && BS.triangles([0, 0, 20, 0, 0, 20], big, 'crossing'), 'triangle inside the box');
      assert(!BS.triangles([0, 0, 20, 0, 0, 20], r, 'window') && BS.triangles([0, 0, 20, 0, 0, 20], r, 'crossing'), 'window vs crossing');
      assert(BS.triHits([5, -5], [5.5, 20], [30, 5], r), 'an edge passes through the box');
      var miss = BS.rect([8, 8], [9, 9]);       // inside the bounding box of the triangle, outside the hypotenuse x + y = 10
      assert(!BS.triHits([0, 0], [10, 0], [0, 10], miss) && !BS.triangles([0, 0, 10, 0, 0, 10], miss, 'crossing'), 'bounding boxes overlap but no hit');
      // a two-triangle face given as a slice of a larger array (from / to)
      var arr = [100, 100, 101, 100, 100, 101, 0, 0, 2, 0, 0, 2, 2, 0, 2, 2, 0, 2];
      assert(BS.triangles(arr, BS.rect([-1, -1], [3, 3]), 'window', 6, 18) && !BS.triangles(arr, BS.rect([-1, -1], [3, 3]), 'window', 0, 18), 'from / to slice');
      assert(!BS.triangles(arr, BS.rect([-1, -1], [3, 3]), 'window', 6, 6), 'an empty slice is not selected');
      return 'ok';
    });
    test('polylines (sketch entities): window = every point inside, crossing = any segment touches; closed loops test the closing segment', function () {
      var r = BS.rect([0, 0], [10, 10]);
      var sq = [[2, 2], [8, 2], [8, 8], [2, 8]];
      assert(BS.polyline(sq, true, r, 'window') && BS.polyline(sq, true, r, 'crossing'), 'square inside');
      var open = [[20, 5], [20, 20], [5, 20]];        // an L outside the box whose closing segment (5,20)-(20,5) cuts no corner
      assert(!BS.polyline(open, false, r, 'crossing') && !BS.polyline(open, true, r, 'crossing'), 'L outside');
      var hook = [[15, 5], [15, 15], [5, 15]];          // its closing segment (5,15)-(15,5) passes through (10,10)
      assert(!BS.polyline(hook, false, r, 'crossing') && BS.polyline(hook, true, r, 'crossing'), 'the closing segment touches the corner');
      assert(BS.polyline([[3, 3]], false, r, 'crossing') && !BS.polyline([[13, 3]], false, r, 'crossing') && !BS.polyline([], false, r, 'window'), 'points and empty');
      return 'ok';
    });
    test('combine: replace / add (union, order kept) / toggle (removes what is there, adds the rest)', function () {
      function key(s) { return s.kind + ':' + s.index; }
      var a = { kind: 'edge', index: 1 }, b = { kind: 'edge', index: 2 }, c = { kind: 'face', index: 1 };
      function ks(l) { return l.map(key).join(' '); }
      assert(ks(BS.combine([a, b], [c], 'replace', key)) === 'face:1', 'replace');
      assert(ks(BS.combine([a, b], [b, c], 'add', key)) === 'edge:1 edge:2 face:1', 'add');
      assert(ks(BS.combine([a, b], [b, c], 'toggle', key)) === 'edge:1 face:1', 'toggle');
      assert(ks(BS.combine([a], [{ kind: 'edge', index: 1 }], 'toggle', key)) === '', 'toggle by key, not identity');
      return 'ok';
    });
    test('Instant3D ruler: 1-2-5 steps at least 8 px apart, and snapping to them', function () {
      near(BS.rulerStep(1 / 0.35, 8), 5, 0, '0.35 units/px -> 5');
      near(BS.rulerStep(40, 8), 0.2, 0, '40 px/unit -> 0.2');
      near(BS.rulerStep(8, 8), 1, 0, 'exactly 8 px -> 1');
      near(BS.rulerStep(0.08, 8), 100, 0, '0.08 px/unit -> 100');
      near(BS.snap(29.7, 0.5), 29.5, 0, 'snap 29.7 / 0.5'); near(BS.snap(29.76, 0.5), 30, 0, 'snap 29.76');
      near(BS.snap(0.30000000000000004, 0.1), 0.3, 0, 'no float noise');
      return 'ok';
    });
  })();
