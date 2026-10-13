  // ------------------------------------------------------------------ planes and frames
  group('planes');
  test('standard planes are right-handed (x × y = n)', function () {
    ['Front', 'Top', 'Right'].forEach(function (r) {
      var p = K.STD_PLANES[r];
      nearVec(V.cross(p.x, p.y), p.n, 1e-12, r);
    });
  });
  test('to3D / to2D round-trip on every standard plane', function () {
    ['Front', 'Top', 'Right'].forEach(function (r) {
      var pl = K.makePlane(r, 7);
      var w = K.to3D(pl, 3, -4);
      var uv = K.to2D(pl, w);
      near(uv[0], 3, 1e-12, r + ' u'); near(uv[1], -4, 1e-12, r + ' v');
      near(V.dot(V.sub(w, pl.origin), pl.n), 0, 1e-12, r + ' on plane');
      near(V.dot(w, pl.n), 7, 1e-12, r + ' offset');
    });
  });
  test('Top plane maps sketch v to world -z', function () {
    var w = K.to3D(K.makePlane('Top', 0), 0, -5);
    nearVec(w, [0, 0, 5], 1e-12, 'world');
  });
  test('planeFromFace gives an orthonormal frame through the point', function () {
    var pl = K.planeFromFace([1, 1, 0], [2, 2, 9]);
    near(V.len(pl.x), 1, 1e-9, '|x|'); near(V.len(pl.y), 1, 1e-9, '|y|'); near(V.len(pl.n), 1, 1e-9, '|n|');
    near(V.dot(pl.x, pl.y), 0, 1e-9, 'x·y'); near(V.dot(pl.x, pl.n), 0, 1e-9, 'x·n');
    nearVec(V.cross(pl.x, pl.y), pl.n, 1e-9, 'handedness');
    near(V.dot(V.sub([2, 2, 9], pl.origin), pl.n), 0, 1e-9, 'point on plane');
  });
  test('resolvePlane errors on a missing reference plane feature', function () {
    var threw = false;
    try { K.resolvePlane({ featureId: 99 }, K.newModel(), {}); } catch (e) { threw = /not found/i.test(e.message); }
    assert(threw, 'expected "not found" error');
  });

