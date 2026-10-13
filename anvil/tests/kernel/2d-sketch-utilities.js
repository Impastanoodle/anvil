  // ------------------------------------------------------------------ 2D sketch utilities
  group('2D utilities');
  function bbox2(pts) {
    var min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    pts.forEach(function (p) { min[0] = Math.min(min[0], p[0]); min[1] = Math.min(min[1], p[1]); max[0] = Math.max(max[0], p[0]); max[1] = Math.max(max[1], p[1]); });
    return { min: min, max: max, w: max[0] - min[0], h: max[1] - min[1] };
  }
  var SQUARE = [[0, 0], [10, 0], [10, 10], [0, 10]];
  test('offsetLoop grows a CCW square outward by d', function () {
    var o = K.offsetLoop(SQUARE, 1), b = bbox2(o);
    assert(o.length === 4, 'points = ' + o.length);
    near(b.w, 12, 1e-9, 'width'); near(b.h, 12, 1e-9, 'height');
    near(b.min[0], -1, 1e-9, 'min x'); near(K.signedArea(o), 144, 1e-9, 'area');
  });
  test('offsetLoop with negative d shrinks; CW input also goes outward for positive d', function () {
    var inner = bbox2(K.offsetLoop(SQUARE, -1));
    near(inner.w, 8, 1e-9, 'shrunk width');
    var cw = SQUARE.slice().reverse(), o = K.offsetLoop(cw, 1), b = bbox2(o);
    near(b.w, 12, 1e-9, 'CW width'); near(Math.abs(K.signedArea(o)), 144, 1e-9, 'CW area');
  });
  test('offsetLoop mitres a 45° corner without exploding', function () {
    var tri = [[0, 0], [10, 0], [0, 10]];
    var o = K.offsetLoop(tri, 1);
    assert(o.length === 3, 'points = ' + o.length);
    o.forEach(function (p, i) { assert(Math.abs(p[0]) < 30 && Math.abs(p[1]) < 30, 'point ' + i + ' ran away: ' + p); });
    assert(K.signedArea(o) > 50, 'offset triangle area ' + K.signedArea(o) + ' should exceed the original 50');
  });
  test('filletPolyline replaces a corner with a tangent arc of the right radius', function () {
    var o = K.filletPolyline(SQUARE, 1, 2);
    assert(o.length > 4, 'arc points added (got ' + o.length + ')');
    // the arc centre for corner (10,0) with r=2 is (8,2); every new point is r away from it, and the original corner is gone
    o.forEach(function (p) {
      var onOriginal = SQUARE.some(function (q) { return q !== SQUARE[1] && Math.abs(q[0] - p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9; });
      if (onOriginal) return;
      near(Math.hypot(p[0] - 8, p[1] - 2), 2, 1e-9, 'distance to arc centre');
    });
    assert(!o.some(function (p) { return p[0] === 10 && p[1] === 0; }), 'corner vertex should be replaced');
    assert(K.signedArea(o) < 100 && K.signedArea(o) > 100 - (4 - Math.PI) - 0.2, 'area ' + K.signedArea(o) + ' should be just under 100');
  });
  test('filletPolyline rejects a radius larger than the adjacent edges allow', function () {
    var threw = false;
    try { K.filletPolyline(SQUARE, 1, 20); } catch (e) { threw = /too large/i.test(e.message); }
    assert(threw, 'expected "too large" error');
  });

