  // ------------------------------------------------------------------ script round-trip
  group('script round-trip');
  function roundTrip(code) {
    var a = build(code);
    noErrors(a);
    var script = K.generateScript(a.model);
    var b = build(script);
    noErrors(b);
    nearRel(b.mp.volume, a.mp.volume, 1e-9, 'volume after round-trip');
    nearVec(b.mp.bbox.min, a.mp.bbox.min, 1e-9, 'bbox.min'); nearVec(b.mp.bbox.max, a.mp.bbox.max, 1e-9, 'bbox.max');
    assert(b.model.features.length === a.model.features.length, 'feature count ' + b.model.features.length + ' != ' + a.model.features.length);
    b.model.features.forEach(function (f, i) { assert(f.type === a.model.features[i].type && f.name === a.model.features[i].name, 'feature ' + i + ' mismatch: ' + f.name); });
    return script.split('\n').length + ' lines';
  }
  test('box + hole', function () { return roundTrip('p.box(20, 20, 5);\np.hole("Top", 10, -10, 4, { offset: 5 });'); });
  test('reference plane + midplane extrude', function () { return roundTrip('var pl = p.plane("Right", 4, "Side");\np.sketch(pl).centerRect(0, 0, 6, 6).extrude(10, { midplane: true });'); });
  test('two-direction reverse extrude', function () { return roundTrip('p.sketch("Front").rect(0,0,4,4).extrude(3, { reverse: true, depth2: 2 });'); });
  test('through-all cut', function () { return roundTrip('p.box(10,10,10);\np.sketch("Top", 10).circle(5, -5, 2).cut("through");'); });
  test('revolve about a sketch line + patterns + mirror', function () {
    return roundTrip('var s = p.sketch("Front").line(0,-20,0,20).rect(10, 0, 10, 5).id();\np.revolve(360, { axis: 0, sketch: s });\np.hole("Top", 15, 0, 3, { offset: 5 });\np.circularPattern({ axis: "y", count: 4 });\np.box(2,2,2,{ at: [30, 0, 0] });\np.linearPattern({ dir: "z", spacing: 5, count: 2, dir2: "y", spacing2: 3, count2: 2, reverse: true });\np.mirror("Front", { offset: 1 });');
  });
  test('every entity type survives generateScript', function () {
    return roundTrip('p.sketch("Front").rect(0,0,30,30).circle(15,15,3).polygon(6,6,2,6,15).slot(20,5,26,5,2).centerRect(8,24,4,3).polyline([[20,20],[26,20],[23,26]], true).point(1,1).extrude(2);');
  });
  test('generated script is valid JavaScript with a header comment', function () {
    var a = build('p.name("Widget").units("in");\np.box(1,1,1);');
    var s = K.generateScript(a.model);
    assert(s.indexOf('// Widget') === 0, 'header: ' + s.split('\n')[0]);
    assert(s.indexOf('.units("in")') > 0, 'units preserved');
    var m = K.newModel();
    K.runScript(m, s);
    assert(m.name === 'Widget' && m.units === 'in', 'name/units after re-run');
  });

