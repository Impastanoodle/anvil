  // ------------------------------------------------------------------ CSG: splitting only inside the overlap region
  // csg.js splits polygons only where the operands' bounding boxes overlap. Every boolean below has an analytic
  // volume; the result must also mesh watertight (mesh volume = polygon volume) and hold no degenerate polygons.
  group('csg overlap split');
  function boxCSG(x0, y0, z0, x1, y1, z1) {
    var P = function (x, y, z) { return new CSG.Vertex(new CSG.Vector(x, y, z)); };
    var q = function (a, b, c, d) { return new CSG.Polygon([a, b, c, d]); };
    return CSG.fromPolygons([
      q(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)), q(P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)),
      q(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)), q(P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)),
      q(P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0)), q(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1))
    ]);
  }
  // an n-sided prism about a z-parallel axis through (cx, cy), z in [z0, z1], vertex 0 at angle 0
  function prismCSG(cx, cy, r, z0, z1, n) {
    var polys = [], bot = [], top = [];
    for (var i = 0; i < n; i++) {
      var a = 2 * Math.PI * i / n;
      bot.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    var P = function (p, z) { return new CSG.Vertex(new CSG.Vector(p[0], p[1], z)); };
    for (i = 0; i < n; i++) {
      var p0 = bot[i], p1 = bot[(i + 1) % n];
      polys.push(new CSG.Polygon([P(p0, z0), P(p1, z0), P(p1, z1), P(p0, z1)]));
      top.push(P(bot[i], z1));
    }
    polys.push(new CSG.Polygon(top));
    polys.push(new CSG.Polygon(bot.slice().reverse().map(function (p) { return P(p, z0); })));
    return CSG.fromPolygons(polys);
  }
  function ngonArea(r, n) { return n / 2 * r * r * Math.sin(2 * Math.PI / n); }
  function polyArea3(poly) {
    var vs = poly.vertices, n = poly.plane.normal, s = new CSG.Vector(0, 0, 0);
    for (var i = 0; i < vs.length; i++) s = s.plus(vs[i].pos.cross(vs[(i + 1) % vs.length].pos));
    return Math.abs(s.dot(n)) / 2;
  }
  // volume, watertight mesh, no degenerate polygons
  function checkSolid(c, expected, label) {
    near(c.volume(), expected, 1e-6 * Math.max(1, Math.abs(expected)), label + ' volume');
    if (Math.abs(expected) < 1e-9) return 0;
    c.polygons.forEach(function (p, i) { assert(p.vertices.length >= 3 && polyArea3(p) > 1e-12, label + ': degenerate polygon ' + i); });
    near(K.massProps(K.meshFromBody(c), 1).volume, expected, 1e-6 * Math.max(1, expected), label + ' mesh volume');
    return c.polygons.length;
  }
  function threeOps(A, B, u, s, x, label) {
    var n = [checkSolid(A.union(B), u, label + ' union'), checkSolid(A.subtract(B), s, label + ' subtract'), checkSolid(A.intersect(B), x, label + ' intersect')];
    return 'polygons ∪ ' + n[0] + ', − ' + n[1] + ', ∩ ' + n[2];
  }
  test('boxes overlapping on one axis: 1500 / 500 / 500', function () {
    return threeOps(boxCSG(0, 0, 0, 10, 10, 10), boxCSG(5, 0, 0, 15, 10, 10), 1500, 500, 500, 'x-overlap');
  });
  test('boxes overlapping on a corner (5³ shared): 1875 / 875 / 125', function () {
    return threeOps(boxCSG(0, 0, 0, 10, 10, 10), boxCSG(5, 5, 5, 15, 15, 15), 1875, 875, 125, 'corner');
  });
  test('a box inside a box: 1000 / 784 / 216, and inner − outer is empty', function () {
    var A = boxCSG(0, 0, 0, 10, 10, 10), B = boxCSG(2, 2, 2, 8, 8, 8);
    var d = threeOps(A, B, 1000, 784, 216, 'nested');
    near(B.subtract(A).volume(), 0, 1e-9, 'inner − outer');
    return d;
  });
  test('disjoint and face-touching boxes: 2000 / 1000 / 0', function () {
    var A = boxCSG(0, 0, 0, 10, 10, 10);
    var d1 = threeOps(A, boxCSG(20, 0, 0, 30, 10, 10), 2000, 1000, 0, 'disjoint');
    var d2 = threeOps(A, boxCSG(10, 0, 0, 20, 10, 10), 2000, 1000, 0, 'touching');
    return d1 + ' | ' + d2;
  });
  test('the faces of A away from the overlap stay single quads (x = 0, y = 0, z = 0 on a corner overlap)', function () {
    var u = boxCSG(0, 0, 0, 10, 10, 10).union(boxCSG(5, 5, 5, 15, 15, 15));
    var axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    axes.forEach(function (ax, k) {
      var on = u.polygons.filter(function (p) { return p.vertices.every(function (v) { return Math.abs([v.pos.x, v.pos.y, v.pos.z][k]) < 1e-9; }); });
      assert(on.length === 1, 'plane ' + 'xyz'[k] + ' = 0 holds ' + on.length + ' polygons, expected 1 unsplit quad');
      near(polyArea3(on[0]), 100, 1e-9, 'plane ' + 'xyz'[k] + ' = 0 area');
    });
  });
  test('a prism through a box: 1000 ± A·10 (24-gon r 3 through a 10 mm cube)', function () {
    var A3 = ngonArea(3, 24);
    return threeOps(boxCSG(0, 0, 0, 10, 10, 10), prismCSG(5, 5, 3, -5, 15, 24), 1000 + 10 * A3, 1000 - 10 * A3, 10 * A3, 'bore');
  });
  test('a prism split in half by a box face (axis on x = 10): 1000 ± A/2·10', function () {
    var A = ngonArea(3, 24);
    return threeOps(boxCSG(0, 0, 0, 10, 10, 10), prismCSG(10, 5, 3, 0, 10, 24), 1000 + 5 * A, 1000 - 5 * A, 5 * A, 'half');
  });
  test('two coaxial prisms overlapping in z: 15A / 5A / 5A', function () {
    var A = ngonArea(4, 32);
    return threeOps(prismCSG(0, 0, 4, 0, 10, 32), prismCSG(0, 0, 4, 5, 15, 32), 15 * A, 5 * A, 5 * A, 'coaxial');
  });
  test('two different prisms side by side, disjoint: sum / A / 0', function () {
    var A = ngonArea(4, 32), B = ngonArea(2, 16);
    return threeOps(prismCSG(0, 0, 4, 0, 10, 32), prismCSG(20, 0, 2, 0, 10, 16), 10 * (A + B), 10 * A, 0, 'apart');
  });
  test('a ring: prism r 10 minus coaxial prism r 6 (same 36 sides), then a box cut through one side', function () {
    var ring = prismCSG(0, 0, 10, 0, 5, 36).subtract(prismCSG(0, 0, 6, -1, 6, 36));
    var ringV = 5 * (ngonArea(10, 36) - ngonArea(6, 36));
    checkSolid(ring, ringV, 'ring');
    // the box x ∈ [-20, 0], every y, z: exactly half of the ring (both n-gons are symmetric about x = 0)
    var half = ring.subtract(boxCSG(-20, -20, -1, 0, 20, 6));
    return 'polygons ' + checkSolid(half, ringV / 2, 'half ring');
  });
  test('shell-like slab union: six 2 mm walls of a 20 mm box make 20³ − 16³ = 3904, in any order', function () {
    var walls = [boxCSG(0, 0, 0, 20, 20, 2), boxCSG(0, 0, 18, 20, 20, 20), boxCSG(0, 0, 0, 2, 20, 20), boxCSG(18, 0, 0, 20, 20, 20), boxCSG(0, 0, 0, 20, 2, 20), boxCSG(0, 18, 0, 20, 20, 20)];
    var seq = walls[0];
    for (var i = 1; i < walls.length; i++) seq = seq.union(walls[i]);
    var n1 = checkSolid(seq, 3904, 'sequential');
    var rev = walls[5];
    for (i = 4; i >= 0; i--) rev = rev.union(walls[i]);
    checkSolid(rev, 3904, 'reversed');
    var tree = walls[0].union(walls[1]).union(walls[2].union(walls[3])).union(walls[4].union(walls[5]));
    checkSolid(tree, 3904, 'tree');
    // the hollow is really hollow: a 1 mm cube in the middle intersects nothing
    near(seq.intersect(boxCSG(9.5, 9.5, 9.5, 10.5, 10.5, 10.5)).volume(), 0, 1e-12, 'inside is empty');
    return 'sequential union ' + n1 + ' polygons';
  });
  test('stacked overlapping slabs: ten 2 mm slabs every 1.5 mm make a 10 × 10 × 15.5 block', function () {
    var acc = null;
    for (var k = 0; k < 10; k++) { var s = boxCSG(0, 0, k * 1.5, 10, 10, k * 1.5 + 2); acc = acc ? acc.union(s) : s; }
    var n = checkSolid(acc, 1550, 'stack');
    near(K.massProps(K.meshFromBody(acc), 1).bbox.max[2], 15.5, 1e-9, 'top');
    return n + ' polygons';
  });
  test('staircase of slabs growing in x: union volume is the sum of the steps', function () {
    // slab k: x ∈ [0, 10 + 5k], y ∈ [0, 10], z ∈ [2k, 2k + 3]; overlaps of 1 mm between neighbours
    var acc = null, expect = 0;
    for (var k = 0; k < 6; k++) {
      var s = boxCSG(0, 0, 2 * k, 10 + 5 * k, 10, 2 * k + 3);
      acc = acc ? acc.union(s) : s;
      // new material: slab k minus its 1 mm overlap with slab k−1 (which is narrower)
      expect += (10 + 5 * k) * 10 * 3 - (k ? (10 + 5 * (k - 1)) * 10 * 1 : 0);
    }
    return checkSolid(acc, expect, 'staircase') + ' polygons, volume ' + expect;
  });
  test('kernel-level: overlapping and disjoint cylinders through the script API keep their polygonal volumes (and exact ones)', function () {
    var A = polyCircleArea(10);
    var r = build('p.cylinder(10, 10);\np.cylinder(10, 10, { at: [0, 5, 0] });');
    noErrors(r);
    nearRel(r.body.volume(), A * 15, 1e-6, 'two coaxial cylinders overlapping 5 mm');
    nearRel(r.mp.volume, circleArea(10) * 15, 1e-9, 'exact');
    consistentVolume(r);
    var d = build('p.cylinder(10, 10);\np.cylinder(10, 10, { at: [40, 0, 0] });');
    noErrors(d);
    nearRel(d.body.volume(), A * 20, 1e-6, 'two disjoint cylinders');
    nearRel(d.mp.volume, circleArea(10) * 20, 1e-9, 'exact');
    consistentVolume(d);
    var h = build('p.box(40, 40, 20);\np.hole("Top", 20, -20, 10, { offset: 20 });\np.hole("Top", 20, -20, 4, { offset: 20 });');
    noErrors(h);
    nearRel(h.body.volume(), 32000 - polyCircleArea(5) * 20, 1e-6, 'a smaller hole inside a larger one removes nothing more');
    nearRel(h.mp.volume, 32000 - circleArea(5) * 20, 1e-9, 'exact');
    consistentVolume(h);
  });

