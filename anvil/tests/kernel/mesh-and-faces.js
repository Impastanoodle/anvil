  // ------------------------------------------------------------------ mesh & faces
  group('mesh');
  test('face normals are unit length and faces sorted by triangle start', function () {
    var r = build('p.box(10, 10, 10);\np.hole("Top", 5, -5, 3, { offset: 10 });');
    var last = -1;
    r.mesh.faces.forEach(function (f, i) {
      near(V.len(f.normal), 1, 1e-6, 'face ' + i + ' normal length');
      assert(f.start > last, 'faces out of order at ' + i);
      last = f.start;
      assert(f.count > 0, 'face ' + i + ' empty');
    });
    var total = 0;
    r.mesh.faces.forEach(function (f) { total += f.count; });
    assert(total === r.mesh.triCount, 'face counts ' + total + ' != triCount ' + r.mesh.triCount);
    assert(r.mesh.positions.length === r.mesh.triCount * 9, 'positions length');
  });
  test('face areas sum to the surface area', function () {
    var r = build('p.box(10, 10, 10);');
    var sum = 0;
    r.mesh.faces.forEach(function (f) { sum += f.area; });
    near(sum, 600, 1e-6, 'sum of face areas');
  });
  test('faceOutline of a box top face is one 4-point loop', function () {
    var r = build('p.box(10, 20, 5);');
    var top = -1;
    r.mesh.faces.forEach(function (f, i) { if (f.normal[1] > 0.99) top = i; });
    assert(top >= 0, 'no +y face');
    var o = K.faceOutline(r.mesh, top);
    assert(o.loops.length === 1, 'loops = ' + o.loops.length);
    assert(o.loops[0].length === 4, 'points = ' + o.loops[0].length);
    near(Math.abs(K.signedArea(o.loops[0])), 200, 1e-6, 'outline area');
  });
  test('faceOutline of a face with a hole has two loops', function () {
    var r = build('p.box(20, 20, 5);\np.hole("Top", 10, -10, 6, { offset: 5 });');
    var top = -1;
    r.mesh.faces.forEach(function (f, i) { if (f.normal[1] > 0.99) top = i; });
    var o = K.faceOutline(r.mesh, top);
    assert(o.loops.length === 2, 'loops = ' + o.loops.length);
    var areas = o.loops.map(function (l) { return Math.abs(K.signedArea(l)); }).sort(function (a, b) { return b - a; });
    near(areas[0], 400, 1e-6, 'outer area');
    nearRel(areas[1], polyCircleArea(3), 1e-6, 'hole area');
  });

