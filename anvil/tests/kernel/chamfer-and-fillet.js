  // ------------------------------------------------------------------ chamfer & fillet
  group('chamfer & fillet');
  var BOX = 'p.sketch("Top").centerRect(0, 0, 40, 20).extrude(10);';
  test('chamfer on one edge removes the triangular prism', function () {
    var r = build(BOX + '\np.chamfer(2, [[20, 10, 0]]);');
    noErrors(r);
    nearRel(r.mp.volume, 8000 - 2 * 2 / 2 * 20, 1e-3, 'volume');
    assert(r.mesh.faces.length === 7, 'faces = ' + r.mesh.faces.length + ' (box 6 + chamfer 1)');
    consistentVolume(r);
  });
  test('fillet on one convex edge removes (1 - pi/4) r² L', function () {
    var r = build(BOX + '\np.fillet(3, [[0, 10, 10]]);');
    noErrors(r);
    nearRel(r.mp.volume, 8000 - (1 - Math.PI / 4) * 9 * 40, 0.03, 'volume');
    assert(r.mesh.faces.length > 7, 'fillet adds several facets (faces = ' + r.mesh.faces.length + ')');
    consistentVolume(r);
  });
  test('chamfer and fillet together', function () {
    var r = build(BOX + '\np.chamfer(2, [[20, 10, 0]]);\np.fillet(3, [[0, 10, 10]]);');
    noErrors(r);
    nearRel(r.mp.volume, 8000 - 40 - (1 - Math.PI / 4) * 9 * 40, 0.01, 'volume');
    consistentVolume(r);
  });
  test('chamfer around all four top edges mitres the corners', function () {
    var r = build(BOX + '\np.chamfer(2, [[20, 10, 0], [-20, 10, 0], [0, 10, 10], [0, 10, -10]]);');
    noErrors(r);
    // four prisms of d²/2·L overlap at the corners by a d³/6 wedge each
    var expected = 8000 - (2 * 20 * 2 + 2 * 40 * 2) + 4 * 8 / 6;
    nearRel(r.mp.volume, expected, 0.01, 'volume');
    consistentVolume(r);
  });
  test('fillet on a concave edge adds material', function () {
    var r = build('p.box(10, 10, 2);\np.box(2, 10, 10);\np.fillet(1, [[2, 2, 5]]);');
    noErrors(r);
    nearRel(r.mp.volume, 360 + (1 - Math.PI / 4) * 1 * 10, 0.05, 'volume');
    assert(r.mp.volume > 360, 'volume must grow');
    consistentVolume(r);
  });
  test('chamfer with chain:false on a cylinder rim touches one facet only', function () {
    var one = build('p.cylinder(10, 5);\np.chamfer(1, [[10, 5, 0]], { chain: false });');
    var all = build('p.cylinder(10, 5);\np.chamfer(1, [[10, 5, 0]]);');
    noErrors(one); noErrors(all);
    // on the mesh (polygonal) volumes: one chamfered facet of the 32-gon removes a few mm³ (up to ~9)
    var base = polyCircleArea(10) * 5;
    assert(polyVol(one.mp) < base && polyVol(one.mp) > base - 10, 'single facet chamfer: ' + fmt(base - polyVol(one.mp)) + ' removed');
    assert(polyVol(all.mp) < polyVol(one.mp) - 10, 'chained chamfer removes much more (' + fmt(base - polyVol(all.mp)) + ')');
  });
  test('edge feature errors: nothing to chamfer, no edge found, zero size', function () {
    expectError('p.chamfer(2, [[0, 0, 0]]);', /nothing to chamfer/i);
    expectError(BOX + '\np.chamfer(2, [[500, 500, 500]]);', /no edges found/i);
    expectError(BOX + '\np.chamfer(0, [[20, 10, 0]]);', /greater than zero/i);
    expectError(BOX + '\np.fillet(0, [[20, 10, 0]]);', /greater than zero/i);
  });
  test('chamfer and fillet survive a script round-trip', function () {
    return roundTrip(BOX + '\np.chamfer(2, [[20, 10, 0]], { name: "Break" });\np.fillet(3, [[0, 10, 10]]);');
  });

