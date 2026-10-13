  // ------------------------------------------------------------------ draft on extrudes
  group('draft');
  function frustum(h, s1, s2) { var a1 = s1 * s1, a2 = s2 * s2; return h / 3 * (a1 + a2 + Math.sqrt(a1 * a2)); }
  var TAN10 = Math.tan(10 * Math.PI / 180);
  test('blind extrude with 10° inward draft is a square frustum', function () {
    var r = build('p.sketch("Top").centerRect(0, 0, 20, 20).extrude(10, { draft: 10 });');
    noErrors(r);
    nearRel(r.mp.volume, frustum(10, 20, 20 - 2 * 10 * TAN10), 1e-6, 'volume');
    near(r.mp.bbox.max[1], 10, 1e-9, 'height');
    assert(r.mesh.faces.length === 6, 'still 6 faces (got ' + r.mesh.faces.length + ')');
    // the base (sketch plane) face is the full 20×20 square
    var base = r.mesh.faces.filter(function (f) { return f.normal[1] < -0.99; })[0];
    near(base.area, 400, 1e-6, 'base area');
    consistentVolume(r);
  });
  test('draft outward grows the section away from the sketch plane', function () {
    var r = build('p.sketch("Top").centerRect(0, 0, 20, 20).extrude(10, { draft: 10, draftOutward: true });');
    noErrors(r);
    nearRel(r.mp.volume, frustum(10, 20, 20 + 2 * 10 * TAN10), 1e-6, 'volume');
    var top = r.mesh.faces.filter(function (f) { return f.normal[1] > 0.99; })[0];
    near(top.area, Math.pow(20 + 2 * 10 * TAN10, 2), 1e-6, 'top area');
  });
  test('reverse extrude with draft tapers on the other side', function () {
    var r = build('p.sketch("Top").centerRect(0, 0, 20, 20).extrude(10, { draft: 10, reverse: true });');
    noErrors(r);
    nearRel(r.mp.volume, frustum(10, 20, 20 - 2 * 10 * TAN10), 1e-6, 'volume');
    near(r.mp.bbox.min[1], -10, 1e-9, 'y min'); near(r.mp.bbox.max[1], 0, 1e-9, 'y max');
    var base = r.mesh.faces.filter(function (f) { return f.normal[1] > 0.99; })[0];
    near(base.area, 400, 1e-6, 'sketch-plane face is the full square');
  });
  test('mid-plane extrude with draft tapers away from the sketch plane in both directions', function () {
    var r = build('p.sketch("Top").centerRect(0, 0, 20, 20).extrude(10, { draft: 10, midplane: true });');
    noErrors(r);
    nearRel(r.mp.volume, 2 * frustum(5, 20, 20 - 2 * 5 * TAN10), 1e-6, 'volume (two frustums back to back)');
    near(r.mp.bbox.min[1], -5, 1e-9, 'y min'); near(r.mp.bbox.max[1], 5, 1e-9, 'y max');
    // widest section is at the sketch plane: x extent is the full 20
    near(r.mp.bbox.max[0] - r.mp.bbox.min[0], 20, 1e-6, 'x extent at the sketch plane');
    var ends = r.mesh.faces.filter(function (f) { return Math.abs(f.normal[1]) > 0.99; });
    assert(ends.length === 2, 'two end caps');
    ends.forEach(function (f) { near(f.area, Math.pow(20 - 2 * 5 * TAN10, 2), 1e-6, 'end cap area'); });
    consistentVolume(r);
  });
  test('two-direction extrude with draft keeps the sketch section at the sketch plane', function () {
    var r = build('p.sketch("Top").centerRect(0, 0, 20, 20).extrude(10, { draft: 10, depth2: 4 });');
    noErrors(r);
    nearRel(r.mp.volume, frustum(10, 20, 20 - 2 * 10 * TAN10) + frustum(4, 20, 20 - 2 * 4 * TAN10), 1e-6, 'volume');
    near(r.mp.bbox.min[1], -4, 1e-9, 'y min'); near(r.mp.bbox.max[1], 10, 1e-9, 'y max');
    near(r.mp.bbox.max[0] - r.mp.bbox.min[0], 20, 1e-6, 'x extent at the sketch plane');
    consistentVolume(r);
  });
  test('holes in a drafted profile grow as the material shrinks', function () {
    var r = build('p.sketch("Top").centerRect(0, 0, 20, 20).circle(0, 0, 3).extrude(10, { draft: 10 });');
    noErrors(r);
    var r1 = 3, r2 = 3 + 10 * TAN10;
    var hole = Math.PI * 10 / 3 * (r1 * r1 + r1 * r2 + r2 * r2);
    nearRel(r.mp.volume, frustum(10, 20, 20 - 2 * 10 * TAN10) - hole, 0.02, 'volume');
    consistentVolume(r);
  });
  test('draft on a cut', function () {
    var r = build('p.box(40, 40, 20, { centered: true });\np.sketch("Top", 20).centerRect(0, 0, 10, 10).cut(20, { reverse: true, draft: 10 });');
    noErrors(r);
    nearRel(r.mp.volume, 32000 - frustum(20, 10, 10 - 2 * 20 * TAN10), 1e-6, 'volume');
  });
  test('draft errors: profile collapses, angle too large', function () {
    expectError('p.sketch("Top").centerRect(0, 0, 20, 20).extrude(100, { draft: 30 });', /collapses/i);
    expectError('p.sketch("Top").centerRect(0, 0, 20, 20).extrude(10, { draft: 89 });', /less than 89/i);
  });
  test('draft survives a script round-trip', function () {
    var s = roundTrip('p.sketch("Top").centerRect(0, 0, 20, 20).extrude(10, { draft: 10, draftOutward: true, midplane: true });\np.sketch("Top", 5).circle(0, 0, 3).cut(5, { reverse: true, draft: 5 });');
    var a = build('p.sketch("Top").centerRect(0, 0, 20, 20).extrude(10, { draft: 10, draftOutward: true });');
    var script = K.generateScript(a.model);
    assert(script.indexOf('draft: 10') > 0 && script.indexOf('draftOutward: true') > 0, 'draft options emitted: ' + script);
    return s;
  });

