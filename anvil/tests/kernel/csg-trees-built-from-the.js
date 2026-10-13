  // ------------------------------------------------------------------ CSG: trees built from the near region only
  // csg.js builds an operand's BSP tree from just its polygons near the other operand, closed off by the parts of
  // a box's faces that lie inside it (classified by ray casts), whenever few of its polygons are near
  // (CSG.options.nearTrees, nearRatio). Every result must match the classic full-tree boolean: same volume, same
  // point membership, watertight mesh. CSG.stats counts which path each boolean took.
  group('csg near-region trees');
  function withNear(on, fn) {
    var keep = CSG.options.nearTrees;
    CSG.options.nearTrees = on;
    try { return fn(); } finally { CSG.options.nearTrees = keep; }
  }
  function nearCount() { return CSG.stats.near; }
  // A op B both ways; checks the near result against the classic one (volume, 400 sampled points) and `expected`
  function bothWays(A, B, op, expected, label) {
    var n0 = nearCount();
    var r = withNear(true, function () { return A[op](B); });
    var usedNear = nearCount() > n0;
    var c = withNear(false, function () { return A[op](B); });
    near(r.volume(), c.volume(), 1e-9 * Math.max(1, Math.abs(c.volume())), label + ': near-tree volume vs classic');
    if (expected != null) checkSolid(r, expected, label);
    var bb = boundsOf2(A, B), tr = r.pointTester(), tc = c.pointTester(), seed = 7, off = 0;
    for (var i = 0; i < 400; i++) {
      var p = [0, 1, 2].map(function (k) { seed = (seed * 16807) % 2147483647; return bb.min[k] - 1 + (bb.max[k] - bb.min[k] + 2) * seed / 2147483647; });
      if (tr(p) !== tc(p)) off++;
    }
    assert(off === 0, label + ': ' + off + ' of 400 sample points classified differently from the classic boolean');
    return { r: r, c: c, usedNear: usedNear };
  }
  function boundsOf2(A, B) {
    var a = A.getBounds(), b = B.getBounds();
    return { min: [0, 1, 2].map(function (k) { return Math.min(a.min[k], b.min[k]); }), max: [0, 1, 2].map(function (k) { return Math.max(a.max[k], b.max[k]); }) };
  }
  var DISC_A = ngonArea(20, 96);
  function disc() { return prismCSG(0, 0, 20, 0, 5, 96); } // 96-gon, r 20, z in [0, 5]: 98 polygons
  test('CSG.options.nearTrees is on by default and CSG.stats counts the paths', function () {
    assert(CSG.options.nearTrees === true, 'CSG.options.nearTrees should default to true, got ' + CSG.options.nearTrees);
    assert(typeof CSG.options.nearRatio === 'number' && CSG.options.nearRatio > 0 && CSG.options.nearRatio <= 1, 'nearRatio ' + CSG.options.nearRatio);
    assert(CSG.stats && ['near', 'classic', 'fallback'].every(function (k) { return typeof CSG.stats[k] === 'number'; }), 'CSG.stats { near, classic, fallback }');
    return JSON.stringify(CSG.stats);
  });
  test('a box sunk into a 96-sided disc takes the near path: +64 / −32 / 32, the disc side faces stay whole', function () {
    var D = disc(), B = boxCSG(-2, -2, 3, 2, 2, 9), V = 5 * DISC_A;
    var u = bothWays(D, B, 'union', V + 64, 'union'), s = bothWays(D, B, 'subtract', V - 32, 'subtract'), x = bothWays(D, B, 'intersect', 32, 'intersect');
    assert(u.usedNear && s.usedNear && x.usedNear, 'expected the near path for all three (stats ' + JSON.stringify(CSG.stats) + ')');
    var sides = u.r.polygons.filter(function (p) { return Math.abs(p.plane.normal.z) < 1e-9; }).length;
    assert(sides === 96 + 4, 'union side faces: ' + sides + ', expected the 96 disc quads whole plus the 4 box sides');
    assert(u.r.polygons.length <= u.c.polygons.length, 'near union has more polygons than the classic (' + u.r.polygons.length + ' > ' + u.c.polygons.length + ')');
    return 'union ' + u.r.polygons.length + ' polygons (classic ' + u.c.polygons.length + ')';
  });
  test('coplanar faces: a square through the disc (same top and bottom), and one across the rim', function () {
    var D = disc(), V = 5 * DISC_A, B = boxCSG(-3, -3, 0, 3, 3, 5);
    var u = bothWays(D, B, 'union', V, 'inside union');
    bothWays(D, B, 'subtract', V - 180, 'square hole');
    bothWays(D, B, 'intersect', 180, 'inside intersect');
    bothWays(B, D, 'subtract', 0, 'square minus disc');
    var R = boxCSG(15, -3, 0, 25, 3, 5); // crosses the rim, top and bottom coplanar with the disc's
    var ru = bothWays(D, R, 'union', null, 'rim union'), rs = bothWays(D, R, 'subtract', null, 'rim subtract'), rx = bothWays(D, R, 'intersect', null, 'rim intersect');
    near(ru.r.volume() + rx.r.volume(), V + 300, 1e-6, 'union + intersection = disc + box');
    near(rs.r.volume() + rx.r.volume(), V, 1e-6, 'subtraction + intersection = disc');
    assert(u.usedNear, 'the inside union should take the near path');
    return 'rim ∩ ' + fmt(rx.r.volume());
  });
  test('touching solids: a box on the disc top, a box under it, a box against the rim vertex', function () {
    var D = disc(), V = 5 * DISC_A;
    var T = boxCSG(-3, -3, 5, 3, 3, 8), U = boxCSG(-3, -3, -4, 3, 3, 0), S = boxCSG(20, -3, 0, 26, 3, 5);
    var t = bothWays(D, T, 'union', V + 108, 'on top');
    bothWays(D, T, 'subtract', V, 'on top −'); bothWays(D, T, 'intersect', 0, 'on top ∩');
    bothWays(D, U, 'union', V + 144, 'underneath'); bothWays(D, U, 'subtract', V, 'underneath −'); bothWays(U, D, 'subtract', 144, 'underneath, other way');
    bothWays(D, S, 'union', V + 180, 'at the rim vertex'); bothWays(D, S, 'intersect', 0, 'at the rim vertex ∩');
    // the glued top face disappears: nothing of the union lies in z = 5 inside the box footprint
    var glued = t.r.polygons.filter(function (p) { return p.vertices.every(function (v) { return Math.abs(v.pos.z - 5) < 1e-9 && Math.abs(v.pos.x) < 3 - 1e-9 && Math.abs(v.pos.y) < 3 - 1e-9; }); });
    assert(glued.length === 0, glued.length + ' polygon(s) left on the glued face');
    return 'touching union ' + t.r.polygons.length + ' polygons';
  });
  test('nested solids: a cavity box wholly inside the disc (no disc face near it) and the disc inside a big box', function () {
    var D = disc(), V = 5 * DISC_A, C = boxCSG(-1, -1, 1, 1, 1, 4);
    var n0 = nearCount();
    bothWays(D, C, 'subtract', V - 12, 'cavity'); bothWays(D, C, 'union', V, 'inner union'); bothWays(D, C, 'intersect', 12, 'inner ∩');
    bothWays(C, D, 'subtract', 0, 'inner − disc'); bothWays(C, D, 'union', V, 'inner ∪ disc (other way)');
    assert(nearCount() > n0, 'the cavity should take the near path (its near box holds no disc face: caps only)');
    var cav = D.subtract(C);
    assert(cav.pointTester()([0, 0, 2.5]) === false && cav.pointTester()([0, 0, 0.5]) === true, 'cavity is hollow, the floor below it is solid');
    var big = boxCSG(-30, -30, -10, 30, 30, 15);
    bothWays(big, D, 'subtract', 60 * 60 * 25 - V, 'disc cavity in a big box'); bothWays(big, D, 'intersect', V, 'big ∩ disc');
  });
  test('many-hole plate: 36 Ø6 24-gon holes cut one at a time match the analytic volume and the classic', function () {
    function plate(on) {
      return withNear(on, function () {
        var P = boxCSG(0, 0, 0, 120, 120, 5);
        for (var i = 0; i < 6; i++) for (var j = 0; j < 6; j++) P = P.subtract(prismCSG(10 + 20 * i, 10 + 20 * j, 3, -1, 6, 24));
        return P;
      });
    }
    var n0 = nearCount(), on = plate(true), used = nearCount() - n0, off = plate(false), V = 120 * 120 * 5 - 36 * 5 * ngonArea(3, 24);
    checkSolid(on, V, 'plate');
    near(on.volume(), off.volume(), 1e-9 * V, 'near vs classic');
    assert(used >= 30, 'only ' + used + ' of 36 cuts took the near path');
    assert(on.polygons.length <= off.polygons.length, 'near plate has more polygons (' + on.polygons.length + ' vs ' + off.polygons.length + ')');
    return used + ' near cuts, ' + on.polygons.length + ' polygons (classic ' + off.polygons.length + ')';
  });
  test('rotated: a tilted disc and a tilted box crossing its rim agree with the classic', function () {
    var ca = Math.cos(0.37), sa = Math.sin(0.37), cb = Math.cos(1.1), sb = Math.sin(1.1);
    function rot(p) { var x = ca * p.x - sa * p.y, y = sa * p.x + ca * p.y; return new CSG.Vector(cb * x + sb * p.z, y, -sb * x + cb * p.z); }
    var D = disc().transform(rot), B = boxCSG(14, -4, -2, 26, 4, 3).transform(rot);
    ['union', 'subtract', 'intersect'].forEach(function (op) { bothWays(D, B, op, null, 'tilted ' + op); });
  });
  test('empty operands: ∅ − A = ∅, A − ∅ = A, ∅ ∪ A = A, A ∩ ∅ = ∅', function () {
    var E = CSG.fromPolygons([]), A = boxCSG(0, 0, 0, 2, 3, 4);
    near(E.subtract(A).volume(), 0, 1e-12, '∅ − A'); assert(E.subtract(A).polygons.length === 0, '∅ − A has polygons');
    near(A.subtract(E).volume(), 24, 1e-12, 'A − ∅'); near(E.union(A).volume(), 24, 1e-12, '∅ ∪ A'); near(A.union(E).volume(), 24, 1e-12, 'A ∪ ∅');
    near(A.intersect(E).volume(), 0, 1e-12, 'A ∩ ∅'); near(E.intersect(A).volume(), 0, 1e-12, '∅ ∩ A');
  });
  test('restoreWhole off (flat-pattern merge) always uses the classic trees', function () {
    var keep = CSG.options.restoreWhole, n0 = nearCount();
    CSG.options.restoreWhole = false;
    try { near(disc().union(boxCSG(-2, -2, 3, 2, 2, 9)).volume(), 5 * DISC_A + 64, 1e-6, 'union'); } finally { CSG.options.restoreWhole = keep; }
    assert(nearCount() === n0, 'a near-tree boolean ran with restoreWhole off');
  });
  test('every example has the same volume with and without near-region trees (1e-9)', function () {
    var n0 = nearCount(), rows = [];
    AnvilExamples.forEach(function (ex) {
      var v = [true, false].map(function (on) {
        return withNear(on, function () { var b = buildExample(ex).body; return { v: b.volume(), n: b.polygons.length }; }); // assembly entries build through Assembly (no part cache: each run rebuilds its parts)
      });
      nearRel(v[0].v, v[1].v, 1e-9, ex.name + ' volume');
      if (v[0].n < v[1].n / 2) rows.push(ex.name + ' ' + v[1].n + '→' + v[0].n);
    });
    assert(nearCount() > n0, 'no example took the near path');
    return (nearCount() - n0) + ' near booleans; polygons halved or better: ' + rows.join(', ');
  });
  test('random chains of boxes and prisms on a half-grid: near trees agree with exact membership', function () {
    var seed = 2026, bad = [];
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function g() { return Math.round(rnd() * 20) / 2; }
    function shape() {
      if (rnd() < 0.6) { var x = g(), y = g(), z = g(), X = x + 0.5 + g(), Y = y + 0.5 + g(), Z = z + 0.5 + g(); var c = boxCSG(x, y, z, X, Y, Z); c.has = function (p) { return p[0] > x && p[0] < X && p[1] > y && p[1] < Y && p[2] > z && p[2] < Z; }; return c; }
      var cx = g(), cy = g(), r = 0.5 + g() / 2, z0 = g() - 5, z1 = g() + 5.5, n = [4, 6, 12, 24][Math.floor(rnd() * 4)];
      var pr = prismCSG(cx, cy, r, z0, z1, n), rr = r * Math.cos(Math.PI / n);
      // inside the n-gon: within the apothem of every edge normal (vertex 0 at angle 0)
      pr.has = function (p) {
        if (!(p[2] > z0 && p[2] < z1)) return false;
        for (var i = 0; i < n; i++) { var a = 2 * Math.PI * (i + 0.5) / n; if ((p[0] - cx) * Math.cos(a) + (p[1] - cy) * Math.sin(a) >= rr) return false; }
        return true;
      };
      return pr;
    }
    var ops = ['union', 'subtract', 'union', 'subtract', 'intersect'], n0 = nearCount();
    for (var it = 0; it < 40; it++) {
      var A = boxCSG(0, 0, 0, 10, 10, 10), C = A, truth = function (p) { return p[0] > 0 && p[0] < 10 && p[1] > 0 && p[1] < 10 && p[2] > 0 && p[2] < 10; };
      var steps = 3 + Math.floor(rnd() * 6);
      for (var s = 0; s < steps; s++) {
        var op = ops[Math.floor(rnd() * 4.999)], S = shape();
        A = withNear(true, function () { return A[op](S); });
        C = withNear(false, function () { return C[op](S); });
        truth = (function (t0, h, o) { return o === 'union' ? function (p) { return t0(p) || h(p); } : o === 'subtract' ? function (p) { return t0(p) && !h(p); } : function (p) { return t0(p) && h(p); }; })(truth, S.has, op);
      }
      if (Math.abs(A.volume() - C.volume()) > 1e-9 * Math.max(1, Math.abs(C.volume()))) bad.push(it + ': volume ' + A.volume() + ' vs ' + C.volume());
      var tA = A.pointTester(), off = 0;
      for (var k = 0; k < 150; k++) {
        var p = [rnd() * 22 - 1.1, rnd() * 22 - 1.1, rnd() * 22 - 1.1];
        if (tA(p) !== truth(p)) off++;
      }
      if (off) bad.push(it + ': ' + off + ' points off');
      if (A.polygons.length) near(K.massProps(K.meshFromBody(A), 1).volume, A.volume(), 1e-6 * Math.max(1, A.volume()), 'chain ' + it + ' mesh volume');
    }
    assert(!bad.length, bad.slice(0, 5).join(' | '));
    return (nearCount() - n0) + ' near booleans in 40 chains';
  });

