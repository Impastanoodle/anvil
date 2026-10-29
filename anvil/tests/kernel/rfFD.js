  // --- rfFD (2026-10-29, lane FD: selection) --- Lasso Selection geometry (ui-select.js BoxSelect.lasso / inLoop /
  // crossesLoop): a free-form loop selects what lies wholly inside it (the window rule), a concave loop included.
  (function () {
    group('rfFD: lasso selection geometry (ui-select.js BoxSelect.lasso)');
    var BS = window.BoxSelect;
    // a U-shaped loop: the notch x 4..6, y 0..8 is outside it
    var U = [[0, 0], [4, 0], [4, 8], [6, 8], [6, 0], [10, 0], [10, 10], [0, 10]];

    test('rfFD: lasso region: bounding box, window mode, points inside / outside a concave loop', function () {
      assert(BS && BS.lasso, 'BoxSelect.lasso missing (ui-select.js)');
      var r = BS.lasso(U);
      assert(r.mode === 'window' && r.x0 === 0 && r.x1 === 10 && r.y0 === 0 && r.y1 === 10 && r.lasso.length === 8, JSON.stringify(r));
      assert(BS.inside([2, 5], r) && BS.inside([8, 5], r) && BS.inside([5, 9], r), 'inside the arms and the bridge');
      assert(!BS.inside([5, 4], r), 'the notch is outside');
      assert(!BS.inside([11, 5], r) && !BS.inside([5, -1], r), 'outside the bounding box');
      return 'ok';
    });

    test('rfFD: lasso segments and polylines: both ends inside is not enough when the segment leaves a concave loop', function () {
      var r = BS.lasso(U);
      assert(BS.segment([1, 5], [3, 5], r, 'window'), 'inside one arm');
      assert(!BS.segment([2, 5], [8, 5], r, 'window'), 'crosses the notch');
      assert(BS.segment([2, 9], [8, 9], r, 'window'), 'over the bridge');
      assert(BS.crossesLoop([2, 5], [8, 5], U) && !BS.crossesLoop([2, 9], [8, 9], U), 'crossesLoop');
      assert(BS.polyline([[1, 1], [3, 1], [3, 9], [1, 9]], true, r, 'window'), 'a closed loop in the left arm');
      assert(!BS.polyline([[1, 1], [9, 1]], false, r, 'window'), 'a line across the notch');
      assert(BS.polyline([[2, 2]], false, r, 'window') && !BS.polyline([[5, 2]], false, r, 'window'), 'single points');
      return 'ok';
    });

    test('rfFD: lasso triangles (faces): every corner inside and no side leaving the loop; a triangle bridging the notch is out', function () {
      var r = BS.lasso(U);
      assert(BS.triangles([1, 1, 3, 1, 1, 7], r, 'window'), 'left arm');
      assert(!BS.triangles([1, 1, 9, 1, 5, 9.5], r, 'window'), 'corners inside, sides cross the notch');
      assert(BS.triangles([1, 9, 9, 9, 5, 9.5], r, 'window'), 'along the bridge');
      // from / to slice as the box version
      var arr = [1, 1, 9, 1, 5, 9.5, 1, 1, 3, 1, 1, 7];
      assert(BS.triangles(arr, r, 'window', 6, 12) && !BS.triangles(arr, r, 'window', 0, 12), 'slice');
      // a box region is unchanged by the lasso code (no lasso field)
      var box = BS.rect([0, 0], [10, 10]);
      assert(BS.triangles([1, 1, 9, 1, 5, 9.5], box, 'window') && BS.segment([2, 5], [8, 5], box, 'window'), 'box window as before');
      return 'ok';
    });
  })();
