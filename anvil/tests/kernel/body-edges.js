  // ------------------------------------------------------------------ body edges
  group('body edges');
  function countBy(list, fn) { var m = {}; list.forEach(function (x) { var k = fn(x); m[k] = (m[k] || 0) + 1; }); return m; }
  test('a box has 12 sharp convex edges with 2 faces each', function () {
    var r = build('p.sketch("Top").centerRect(0, 0, 40, 20).extrude(10);');
    var edges = K.bodyEdges(r.mesh);
    assert(edges.length === 12, 'edges = ' + edges.length);
    edges.forEach(function (e, i) {
      assert(e.faces.length === 2, 'edge ' + i + ' faces = ' + e.faces.length);
      assert(e.convex === true, 'edge ' + i + ' should be convex');
      assert(e.smooth === false, 'edge ' + i + ' should be sharp');
      near(V.len(e.dir), 1, 1e-9, 'edge ' + i + ' dir unit');
      nearVec(e.mid, V.scale(V.add(e.a, e.b), 0.5), 1e-9, 'edge ' + i + ' mid');
    });
    var byLen = countBy(edges, function (e) { return Math.round(e.len); });
    assert(byLen[40] === 4 && byLen[20] === 4 && byLen[10] === 4, 'lengths: ' + JSON.stringify(byLen));
  });
  test('an L-bracket has a concave edge along the inside corner', function () {
    var r = build('p.box(10, 10, 2);\np.box(2, 10, 10);');
    var edges = K.bodyEdges(r.mesh);
    var concave = edges.filter(function (e) { return e.convex === false; });
    assert(concave.length === 1, 'concave edges = ' + concave.length);
    var e = concave[0];
    near(e.mid[0], 2, 1e-6, 'x'); near(e.mid[1], 2, 1e-6, 'y'); near(e.len, 10, 1e-6, 'len');
  });
  test('a cylinder has smooth seam edges and sharp rims', function () {
    var r = build('p.cylinder(10, 5);');
    var edges = K.bodyEdges(r.mesh), n = segsForRadius(10);
    var seams = edges.filter(function (e) { return e.smooth; }), rims = edges.filter(function (e) { return !e.smooth; });
    assert(seams.length === n, 'seams = ' + seams.length + ', expected ' + n);
    assert(rims.length === 2 * n, 'rim edges = ' + rims.length + ', expected ' + 2 * n);
    rims.forEach(function (e) { assert(e.convex === true, 'rim edge should be convex'); });
  });
  test('resolveEdges picks the nearest edge and does not chain around a square corner', function () {
    var r = build('p.sketch("Top").centerRect(0, 0, 40, 20).extrude(10);');
    var edges = K.bodyEdges(r.mesh);
    var sel = K.resolveEdges([{ at: [20, 10, 0], chain: true }], edges, 0.5);
    assert(sel.length === 1, 'selected = ' + sel.length);
    near(sel[0].len, 20, 1e-6, 'edge length');
    near(sel[0].mid[0], 20, 1e-6, 'mid x'); near(sel[0].mid[1], 10, 1e-6, 'mid y');
    assert(K.resolveEdges([{ at: [200, 200, 200] }], edges, 0.5).length === 0, 'far point should select nothing');
    assert(K.resolveEdges([{ at: [20, 10, 0] }, { at: [20, 10, 3] }], edges, 0.5).length === 1, 'the same edge twice is selected once');
  });
  test('resolveEdges chains tangent-continuous rim edges around a cylinder', function () {
    var r = build('p.cylinder(10, 5);');
    var edges = K.bodyEdges(r.mesh).filter(function (e) { return !e.smooth; }), n = segsForRadius(10);
    var chained = K.resolveEdges([{ at: [10, 5, 0], chain: true }], edges, 1);
    assert(chained.length === n, 'chained rim edges = ' + chained.length + ', expected ' + n);
    chained.forEach(function (e) { near(e.mid[1], 5, 1e-6, 'all on the top rim'); });
    var single = K.resolveEdges([{ at: [10, 5, 0], chain: false }], edges, 1);
    assert(single.length === 1, 'chain:false selects one edge (got ' + single.length + ')');
  });
  test('pointSegmentDistance clamps to the segment ends', function () {
    near(K.pointSegmentDistance([5, 3, 0], [0, 0, 0], [10, 0, 0]), 3, 1e-12, 'interior');
    near(K.pointSegmentDistance([14, 3, 0], [0, 0, 0], [10, 0, 0]), 5, 1e-12, 'past the end');
  });

