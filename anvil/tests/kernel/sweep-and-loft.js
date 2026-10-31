  // ------------------------------------------------------------------ sweep & loft
  group('sweep');
  test('straight sweep of a circle is a tube: area × path length', function () {
    var r = build('var prof = p.sketch("Front").circle(0, 0, 5).id();\nvar path = p.sketch("Top").line(0, 0, 0, -50).id();\np.sweep({ profile: prof, path: path });');
    noErrors(r);
    nearRel(r.mp.volume, polyCircleArea(5) * 50, 1e-6, 'volume');
    nearVec(r.mp.bbox.min, [-5, -5, 0], 0.1, 'bbox.min'); nearVec(r.mp.bbox.max, [5, 5, 50], 0.1, 'bbox.max');
    consistentVolume(r);
    assert(Object.keys(r.warnings).length === 0, 'a path sketch must not raise an open-contour warning: ' + JSON.stringify(r.warnings));
    return 'volume ' + fmt(r.mp.volume);
  });
  test('sweep along an L path mitres the corner (volume = area × total length)', function () {
    var r = build('var prof = p.sketch("Front").centerRect(0, 0, 10, 10).id();\nvar path = p.sketch("Top").line(0, 0, 0, -50).line(0, -50, 40, -50).id();\np.sweep({ profile: prof, path: path });');
    noErrors(r);
    near(r.mp.volume, 100 * 90, 1e-6, 'volume');
    nearVec(r.mp.bbox.max, [40, 5, 55], 1e-6, 'bbox.max');
    assert(r.mesh.faces.length === 8, 'a mitred L tube has 8 planar faces, got ' + r.mesh.faces.length);
    consistentVolume(r);
  });
  test('sweep along 3D points from a script (three segments, two corners)', function () {
    var r = build('p.sketch("Front").centerRect(0, 0, 10, 10);\np.sweep({ path: [[0, 0, 0], [0, 0, 50], [40, 0, 50], [40, 40, 50]] });');
    noErrors(r);
    near(r.mp.volume, 100 * 130, 1e-6, 'volume');
    consistentVolume(r);
  });
  // lane FH2 (2026-10-29): a path of lines and tangent arcs is swept exactly (prisms and revolves of the section with
  // cylinder / torus records), so the volume is π r² × path length (was the polygonal section, 0.5 %)
  test('sweep along a line + tangent arc path: exact π r² L', function () {
    var r = build('var prof = p.sketch("Front").circle(0, 0, 4).id();\nvar path = p.sketch("Top").line(0, 0, 0, -30).arc(20, -30, 20, 180, 270).line(20, -50, 60, -50).id();\np.sweep({ profile: prof, path: path });');
    noErrors(r);
    nearRel(r.mp.volume, circleArea(4) * (30 + 20 * Math.PI / 2 + 40), 1e-9, 'volume');
    nearVec(r.mp.bbox.max, [60, 4, 54], 0.1, 'bbox.max');
    consistentVolume(r);
    assert(Object.keys(r.warnings).length === 0, 'no warnings: ' + JSON.stringify(r.warnings));
  });
  test('swept cut removes a tube from a block', function () {
    var r = build('p.box(60, 60, 20);\nvar prof = p.sketch("Right", -5).circle(-30, 10, 4).id();\nvar path = p.sketch("Top", 10).line(-5, -30, 65, -30).id();\np.sweep({ profile: prof, path: path, cut: true });');
    noErrors(r);
    nearRel(r.mp.volume, 72000 - polyCircleArea(4) * 60, 1e-6, 'volume');
    consistentVolume(r);
  });
  test('path entities that do not connect are ignored with a warning', function () {
    var r = build('var prof = p.sketch("Front").circle(0, 0, 4).id();\nvar path = p.sketch("Top").line(0, 0, 0, -30).line(10, -50, 60, -50).id();\np.sweep({ profile: prof, path: path });');
    noErrors(r);
    nearRel(r.mp.volume, polyCircleArea(4) * 30, 1e-6, 'only the connected segment is swept');
    var ids = Object.keys(r.warnings);
    assert(ids.length === 1 && /not connect/.test(r.warnings[ids[0]]), 'warning: ' + JSON.stringify(r.warnings));
  });
  test('sweep errors: open profile, empty path', function () {
    var a = build('var prof = p.sketch("Front").line(0, 0, 5, 5).id();\nvar path = p.sketch("Top").line(0, 0, 0, -30).id();\np.sweep({ profile: prof, path: path });');
    assert(/closed profile/i.test(a.errors[3] || ''), 'expected a closed-profile error, got ' + JSON.stringify(a.errors));
    var b = build('var prof = p.sketch("Front").circle(0, 0, 4).id();\nvar path = p.sketch("Top").id();\np.sweep({ profile: prof, path: path });');
    assert(/no lines or arcs/i.test(b.errors[3] || ''), 'expected an empty-path error, got ' + JSON.stringify(b.errors));
  });

  group('loft');
  test('loft between two parallel squares is a frustum: h/3 (A1 + A2 + sqrt(A1 A2))', function () {
    var r = build('var a = p.sketch("Front").centerRect(0, 0, 20, 20).id();\nvar b = p.sketch("Front", 30).centerRect(0, 0, 10, 10).id();\np.loft([a, b]);');
    noErrors(r);
    near(r.mp.volume, 30 / 3 * (400 + 100 + 200), 1e-6, 'volume');
    assert(r.mesh.faces.length === 6, 'a square frustum has 6 planar faces, got ' + r.mesh.faces.length);
    consistentVolume(r);
  });
  test('loft from a circle to a square lies between the two prisms', function () {
    var r = build('var a = p.sketch("Top").circle(0, 0, 10).id();\nvar b = p.sketch("Top", 40).centerRect(0, 0, 20, 20).id();\np.loft([a, b]);');
    noErrors(r);
    var lo = polyCircleArea(10) * 40, hi = 400 * 40;
    assert(r.mp.volume > lo && r.mp.volume < hi, 'volume ' + fmt(r.mp.volume) + ' should be between ' + fmt(lo) + ' and ' + hi);
    nearVec(r.mp.bbox.min, [-10, 0, -10], 1e-6, 'bbox.min'); nearVec(r.mp.bbox.max, [10, 40, 10], 1e-6, 'bbox.max');
    consistentVolume(r);
    return 'volume ' + fmt(r.mp.volume);
  });
  test('loft through three sections and a lofted cut', function () {
    var r = build('var a = p.sketch("Top").centerRect(0, 0, 20, 20).id();\nvar b = p.sketch("Top", 20).circle(0, 0, 15).id();\nvar c = p.sketch("Top", 40).centerRect(0, 0, 10, 10).id();\np.loft([a, b, c]);');
    noErrors(r);
    assert(r.mp.volume > 400 * 40 * 0.5, 'volume ' + fmt(r.mp.volume));
    consistentVolume(r);
    var cut = build('p.box(60, 60, 20);\nvar a = p.sketch("Top", 20).centerRect(30, -30, 20, 20).id();\nvar b = p.sketch("Top", 5).centerRect(30, -30, 10, 10).id();\np.loft([a, b], { cut: true });');
    noErrors(cut);
    near(cut.mp.volume, 72000 - 15 / 3 * (400 + 100 + 200), 1e-6, 'lofted cut volume');
  });
  test('loft errors: fewer than two sketches, a sketch with two profiles', function () {
    var threw = false;
    try { build('var a = p.sketch("Top").circle(0, 0, 10).id();\np.loft([a]);'); } catch (e) { threw = /at least two/i.test(e.message); }
    assert(threw, 'builder rejects a single sketch');
    var b = build('var a = p.sketch("Top").circle(0, 0, 10).circle(30, 0, 5).id();\nvar c = p.sketch("Top", 20).circle(0, 0, 5).id();\np.loft([a, c]);');
    assert(/exactly one closed profile/i.test(b.errors[3] || ''), 'expected a one-profile error, got ' + JSON.stringify(b.errors));
  });
  test('sweep and loft survive a script round-trip', function () {
    var a = build('var prof = p.sketch("Front").circle(0, 0, 5).id();\nvar path = p.sketch("Top").line(0, 0, 0, -50).line(0, -50, 40, -50).id();\np.sweep({ profile: prof, path: path, name: "Tube" });\nvar s1 = p.sketch("Top", 60).centerRect(0, 0, 20, 20).id();\nvar s2 = p.sketch("Top", 90).circle(0, 0, 6).id();\np.loft([s1, s2]);\np.sketch("Front").centerRect(20, 0, 6, 6);\np.sweep({ path: [[20, 0, 0], [20, 0, 50], [20, 20, 50]], cut: true });');   // rfFS: the path rises to the tube's top leg (z = 50); at z = 30 the cut missed everything
    noErrors(a);
    var script = K.generateScript(a.model);
    assert(script.indexOf('p.sweep(') >= 0 && script.indexOf('p.loft(') >= 0, 'sweep and loft emitted');
    var b = build(script);
    noErrors(b);
    nearRel(b.mp.volume, a.mp.volume, 1e-9, 'volume');
    assert(K.generateScript(b.model) === script, 'generator is a fixed point');
  });

