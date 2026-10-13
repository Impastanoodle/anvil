  // ------------------------------------------------------------------ rebuild warnings
  group('warnings');
  test('a cut that removes nothing is flagged with a warning, not an error', function () {
    var r = build('p.box(20, 20, 10);\np.sketch("Top", 10).circle(10, -10, 3).cut(5);');
    noErrors(r);
    var ids = Object.keys(r.warnings);
    assert(ids.length === 1 && /removed no material/i.test(r.warnings[ids[0]]), 'warnings: ' + JSON.stringify(r.warnings));
    near(r.mp.volume, 4000, 1e-3, 'volume unchanged');
    var ok = build('p.box(20, 20, 10);\np.sketch("Top", 10).circle(10, -10, 3).cut(5, { reverse: true });');
    assert(Object.keys(ok.warnings).length === 0, 'a real cut has no warning');
  });
  test('a zero-area contour is dropped with a warning and the rest of the sketch still builds', function () {
    var r = build('p.sketch("Front").rect(0, 0, 0, 5).rect(10, 0, 5, 5).extrude(2);');
    noErrors(r);
    near(r.mp.volume, 50, 1e-6, 'only the 5 × 5 rectangle is extruded');
    var all = Object.keys(r.warnings).map(function (id) { return r.warnings[id]; }).join(' | ');
    assert(/zero-area/i.test(all), 'warnings: ' + JSON.stringify(r.warnings));
    // nothing left after dropping the degenerate loop: the usual "no closed profile" error
    expectError('p.sketch("Front").rect(0, 0, 0, 5).extrude(2);', /no closed profile/i);
  });

