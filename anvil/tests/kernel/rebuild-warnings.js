  // ------------------------------------------------------------------ rebuild warnings
  group('warnings');
  // rfFS (2026-10-30): an empty cut is SolidWorks' rebuild error now (it was a warning while script cuts went +n by
  // default); a script cut with no direction goes into the material
  test('a cut that removes nothing is a rebuild error and the part before it is kept', function () {
    var r = build('p.box(20, 20, 10);\np.sketch("Top", 10).circle(10, -10, 3).cut(5, { reverse: false });');
    var ids = Object.keys(r.errors);
    assert(ids.length === 1 && /does not intersect the model/.test(r.errors[ids[0]]), 'errors: ' + JSON.stringify(r.errors));
    assert(K.isRefusal(r.errors[ids[0]]), 'counted as an on-purpose refusal');
    near(r.mp.volume, 4000, 1e-9, 'volume unchanged');
    var ok = build('p.box(20, 20, 10);\np.sketch("Top", 10).circle(10, -10, 3).cut(5);');
    noErrors(ok);
    assert(Object.keys(ok.warnings).length === 0, 'a real cut has no warning');
    nearRel(ok.mp.volume, 4000 - circleArea(3) * 5, 1e-9, 'the cut with no direction went down into the box');
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

