  // ------------------------------------------------------------------ CSG primitives
  group('csg.js');
  function cube(cx, cy, cz, h) {
    var polys = [];
    var faces = [
      [[0, 4, 6, 2], [-1, 0, 0]], [[1, 3, 7, 5], [1, 0, 0]], [[0, 1, 5, 4], [0, -1, 0]],
      [[2, 6, 7, 3], [0, 1, 0]], [[0, 2, 3, 1], [0, 0, -1]], [[4, 5, 7, 6], [0, 0, 1]]
    ];
    faces.forEach(function (f) {
      var vs = f[0].map(function (i) {
        return new CSG.Vertex(new CSG.Vector(cx + (i & 1 ? h : -h), cy + (i & 2 ? h : -h), cz + (i & 4 ? h : -h)));
      });
      polys.push(new CSG.Polygon(vs));
    });
    return CSG.fromPolygons(polys);
  }
  test('cube volume is positive and exact', function () {
    near(cube(0, 0, 0, 1).volume(), 8, 1e-9, 'volume');
  });
  test('union of overlapping cubes', function () {
    var v = cube(0, 0, 0, 1).union(cube(1, 0, 0, 1)).volume();
    near(v, 8 + 8 - 4, 1e-6, 'volume');
  });
  test('subtract removes the overlap', function () {
    var v = cube(0, 0, 0, 1).subtract(cube(1, 0, 0, 1)).volume();
    near(v, 4, 1e-6, 'volume');
  });
  test('intersect keeps only the overlap', function () {
    var v = cube(0, 0, 0, 1).intersect(cube(1, 0, 0, 1)).volume();
    near(v, 4, 1e-6, 'volume');
  });
  test('union of disjoint cubes keeps both', function () {
    var v = cube(0, 0, 0, 1).union(cube(5, 0, 0, 1)).volume();
    near(v, 16, 1e-6, 'volume');
  });
  test('subtracting a non-touching cube changes nothing', function () {
    var v = cube(0, 0, 0, 1).subtract(cube(5, 0, 0, 1)).volume();
    near(v, 8, 1e-6, 'volume');
  });
  test('coplanar union (cubes sharing a face) is watertight', function () {
    var c = cube(0, 0, 0, 1).union(cube(2, 0, 0, 1));
    near(c.volume(), 16, 1e-6, 'volume');
    var mesh = K.meshFromBody(c);
    near(K.massProps(mesh, 1).volume, 16, 1e-6, 'mesh volume');
  });
  test('transform with reflection keeps outward orientation', function () {
    var m = cube(3, 0, 0, 1).transform(function (p) { return new CSG.Vector(-p.x, p.y, p.z); }, true);
    near(m.volume(), 8, 1e-9, 'volume');
  });
  test('inverse negates the volume', function () {
    near(cube(0, 0, 0, 1).inverse().volume(), -8, 1e-9, 'volume');
  });
  test('Plane.fromVertices tolerates collinear leading vertices', function () {
    var vs = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]].map(function (p) { return new CSG.Vertex(new CSG.Vector(p[0], p[1], p[2])); });
    var pl = CSG.Plane.fromVertices(vs);
    assert(pl, 'plane should exist');
    nearVec([pl.normal.x, pl.normal.y, pl.normal.z], [0, 0, 1], 1e-9, 'normal');
  });
  test('Polygon.tryCreate rejects degenerate polygons', function () {
    var vs = [[0, 0, 0], [1, 0, 0], [2, 0, 0]].map(function (p) { return new CSG.Vertex(new CSG.Vector(p[0], p[1], p[2])); });
    assert(CSG.Polygon.tryCreate(vs) === null, 'collinear polygon should be null');
  });

