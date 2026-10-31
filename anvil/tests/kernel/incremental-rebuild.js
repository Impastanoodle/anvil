  // ------------------------------------------------------------------ incremental rebuild
  group('rebuild cache');
  test('rebuild(model, cache) reuses the unchanged prefix and rebuilds from the first change', function () {
    var model = K.newModel('C');
    K.runScript(model, 'p.box(60, 40, 20);\np.hole("Top", 30, -20, 10, { offset: 20 });\np.linearPattern({ dir: "x", spacing: 20, count: 2 });\np.fillet(3, [[60, 20, 20]]);');
    var b1 = K.rebuild(model);
    assert(b1.reused === 0 && b1.cache.steps.length === model.features.length, 'first build: nothing reused, one step per feature');
    var v1 = b1.body.volume();
    var b2 = K.rebuild(model, b1.cache);
    assert(b2.reused === model.features.length, 'identical model: everything reused (' + b2.reused + ')');
    near(b2.body.volume(), v1, 1e-9, 'same body');
    // edit the last feature
    model.features[model.features.length - 1].r = 5;
    var b3 = K.rebuild(model, b2.cache);
    assert(b3.reused === model.features.length - 1, 'last feature changed: prefix reused (' + b3.reused + ')');
    var fresh = K.rebuild(JSON.parse(JSON.stringify(model)));
    near(b3.body.volume(), fresh.body.volume(), 1e-9, 'cached rebuild equals a fresh rebuild');
    assert(Object.keys(b3.errors).length === 0, 'no errors');
    // edit the first sketch: nothing reusable
    model.features[0].entities[0].w = 80;
    var b4 = K.rebuild(model, b3.cache);
    assert(b4.reused === 0, 'first feature changed: nothing reused (' + b4.reused + ')');
    near(b4.body.volume(), K.rebuild(JSON.parse(JSON.stringify(model))).body.volume(), 1e-9, 'fresh again');
    // errors and warnings are restored from the cache too
    var m2 = K.newModel('W');
    // (rfFS: an empty cut is an error now, so the cut that misses gives the error and a zero-area contour the warning)
    K.runScript(m2, 'p.box(20, 20, 10);\np.sketch("Top", 10).circle(10, -10, 3).cut(5, { reverse: false });\np.sketch("Front").rect(0, 0, 0, 5).rect(30, 0, 5, 5).extrude(2);\np.box(5, 5, 5, { at: [100, 0, 0] });');
    var c1 = K.rebuild(m2), c2 = K.rebuild(m2, c1.cache);
    assert(c2.reused === m2.features.length, 'everything reused (' + c2.reused + ')');
    assert(JSON.stringify(c2.warnings) === JSON.stringify(c1.warnings) && Object.keys(c1.warnings).length === 1, 'warning restored: ' + JSON.stringify(c2.warnings));
    assert(JSON.stringify(c2.errors) === JSON.stringify(c1.errors) && Object.keys(c1.errors).length === 1, 'error restored: ' + JSON.stringify(c2.errors));
    // sheet parameters are part of every key
    var m3 = K.newModel('S');
    K.runScript(m3, 'p.sheet(2);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);\np.flange(20, [[0, 2, 30]]);');
    var s1 = K.rebuild(m3);
    m3.sheet.bendRadius = 4;
    var s2 = K.rebuild(m3, s1.cache);
    assert(s2.reused === 0, 'sheet change invalidates the cache (' + s2.reused + ')');
    assert(Math.abs(s2.body.volume() - s1.body.volume()) > 1, 'bend radius change rebuilt the flange');
  });

