  // ------------------------------------------------------------------ shell
  group('shell');
  test('closed shell of a box: outer minus inner box', function () {
    var r = build('p.box(60, 40, 20);\np.shell(2, []);');
    noErrors(r);
    near(r.mp.volume, 48000 - 56 * 36 * 16, 1e-6, 'volume');
    assert(r.mesh.faces.length === 12, '6 outer + 6 inner faces, got ' + r.mesh.faces.length);
    consistentVolume(r);
  });
  test('shell with the top face removed is an open box', function () {
    var r = build('p.box(60, 40, 20);\np.shell(2, [[30, 20, 20]]);');
    noErrors(r);
    near(r.mp.volume, 48000 - 56 * 36 * 18, 1e-6, 'volume');
    assert(r.mesh.faces.length === 11, 'got ' + r.mesh.faces.length + ' faces');
    consistentVolume(r);
    var two = build('p.box(60, 40, 20);\np.shell(3, [[30, 20, 20], [30, 0, 20]]);');
    noErrors(two);
    near(two.mp.volume, 48000 - 54 * 34 * 20, 1e-6, 'two open faces make a rectangular tube');
  });
  test('shell of an L block keeps a sharp offset corner at the concave edge', function () {
    var r = build('p.box(60, 40, 10);\np.box(10, 40, 50);\np.shell(2, []);');
    noErrors(r);
    // cavities: bar 56×6×36, column 6×46×36, shared 6×6×36
    near(r.mp.volume, 40000 - (56 * 6 * 36 + 6 * 46 * 36 - 6 * 6 * 36), 1e-6, 'volume');
    consistentVolume(r);
  });
  test('shell of a cylinder into a cup (polygonal walls of uniform thickness)', function () {
    var t0 = performance.now();
    var r = build('p.cylinder(20, 30);\np.shell(2, [[0, 30, 0]]);');
    noErrors(r);
    // inner polygon: since lane GB the inner wall sits on the offset cylinder itself, so its circumradius is exactly 18
    // (it used to be the apothem offset, (20 cos(pi/n) - 2) / cos(pi/n))
    var n = segsForRadius(20), ri = 18;
    var inner = n / 2 * ri * ri * Math.sin(2 * Math.PI / n) * 28;
    // the outside is the true cylinder (exact since true curves), the cavity too since rfFE2 (the inner wall carries
    // the cylinder record offset by T: r 18), the facets the polygonal offset
    nearRel(r.mp.volume, circleArea(20) * 30 - circleArea(18) * 28, 1e-9, 'volume: exact');
    nearRel(polyVol(r.mp), polyCircleArea(20) * 30 - inner, 1e-4, 'polygonal volume');
    consistentVolume(r);
    return 'volume ' + fmt(r.mp.volume) + ', ' + (performance.now() - t0).toFixed(0) + ' ms';
  });
  test('shell keeps a wall of thickness T around a through hole', function () {
    var r = build('p.box(60, 40, 20);\np.hole("Top", 30, -20, 10, { offset: 20 });\np.shell(2, [[10, 20, 10]]);');
    noErrors(r);
    var n = segsForRadius(5), ro = (5 * Math.cos(Math.PI / n) + 2) / Math.cos(Math.PI / n);
    var ring = n / 2 * ro * ro * Math.sin(2 * Math.PI / n);
    var expected = 48000 - circleArea(5) * 20 - (56 * 36 * 18 - ring * 18); // the hole exact, its offset ring polygonal
    nearRel(r.mp.volume, expected, 2e-3, 'volume');
    consistentVolume(r);
    return 'volume ' + fmt(r.mp.volume) + ' vs ' + fmt(expected);
  });
  test('shell after a chamfer and on a loft', function () {
    var a = build('p.sketch("Top").centerRect(0, 0, 80, 50).extrude(25);\np.chamfer(5, [[0, 25, 25], [0, 25, -25], [40, 25, 0], [-40, 25, 0]], { chain: false });\np.shell(2, [[0, 0, 0]]);');
    noErrors(a);
    assert(a.mp.volume > 0 && a.mp.volume < 96750, 'volume ' + fmt(a.mp.volume));
    consistentVolume(a);
    var b = build('var s1 = p.sketch("Top").centerRect(0, 0, 40, 40).id();\nvar s2 = p.sketch("Top", 30).centerRect(0, 0, 20, 20).id();\np.loft([s1, s2]);\np.shell(2, [[0, 30, 0]]);');
    noErrors(b);
    assert(b.mp.volume > 0 && b.mp.volume < 30 / 3 * (1600 + 400 + 800), 'loft shell volume ' + fmt(b.mp.volume));
    consistentVolume(b);
  });
  test('shell errors: thickness too large, face not found, nothing to shell', function () {
    var a = build('p.box(10, 10, 10);\np.shell(6, []);');
    assert(/too large/i.test(a.errors[3] || ''), 'expected a too-large error, got ' + JSON.stringify(a.errors));
    near(a.mp.volume, 1000, 1e-6, 'body left untouched after the error');
    var b = build('p.box(10, 10, 10);\np.shell(1, [[500, 500, 500]]);');
    assert(/not found/i.test(b.errors[3] || ''), 'expected a face-not-found error, got ' + JSON.stringify(b.errors));
    var c = build('p.shell(1, []);');
    assert(/nothing to shell/i.test(c.errors[1] || ''), 'expected a nothing-to-shell error, got ' + JSON.stringify(c.errors));
  });
  test('shell survives a script round-trip', function () {
    var a = build('p.box(60, 40, 20);\np.shell(2, [[30, 20, 20]], { name: "Hollow" });');
    noErrors(a);
    var script = K.generateScript(a.model);
    assert(script.indexOf('p.shell(2, [[30,20,20]]') >= 0, 'shell emitted: ' + script.split('\n').pop());
    var b = build(script);
    noErrors(b);
    nearRel(b.mp.volume, a.mp.volume, 1e-9, 'volume');
    assert(K.generateScript(b.model) === script, 'generator is a fixed point');
  });

