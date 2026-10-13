  // ------------------------------------------------------------------ errors
  group('errors');
  function expectError(code, re) {
    var r = build(code);
    var ids = Object.keys(r.errors);
    assert(ids.length >= 1, 'expected an error, got none');
    var msg = r.errors[ids[0]];
    assert(re.test(msg), 'error "' + msg + '" does not match ' + re);
    return msg;
  }
  test('extruding an open sketch reports no closed profile', function () {
    return expectError('p.sketch("Front").line(0,0,5,0).line(5,0,5,5).extrude(3);', /no closed profile/i);
  });
  test('cut before any boss reports nothing to cut', function () {
    return expectError('p.sketch("Front").circle(0,0,3).cut(5);', /nothing to cut/i);
  });
  test('zero-depth extrude is rejected', function () {
    return expectError('p.sketch("Front").rect(0,0,2,2).extrude(0);', /greater than zero/i);
  });
  test('revolve profile crossing the axis is rejected', function () {
    return expectError('p.sketch("Front").rect(-5, 0, 10, 5).revolve(360);', /crosses the axis/i);
  });
  test('pattern with a single instance is rejected', function () {
    return expectError('p.box(1,1,1);\np.linearPattern({ count: 1 });', /at least 2/i);
  });
  test('script referencing a missing sketch errors at build time', function () {
    return expectError('p.extrude(5, { sketch: 42 });', /select a sketch/i);
  });
  test('a failing feature does not stop later features', function () {
    var r = build('p.box(10,10,10);\np.sketch("Front").line(0,0,1,0).extrude(1);\np.box(10,10,10,{at:[20,0,0]});');
    assert(Object.keys(r.errors).length === 1, 'one error expected');
    near(r.mp.volume, 2000, 1e-6, 'both boxes built');
  });
  test('runScript surfaces syntax errors to the caller', function () {
    var threw = false;
    try { K.runScript(K.newModel(), 'p.box(1,'); } catch (e) { threw = true; }
    assert(threw, 'expected a thrown error');
  });
  test('Builder guards: extrude with no sketch, pattern with no feature', function () {
    var b = new K.Builder(K.newModel());
    var a = false, c = false;
    try { b.extrude(5); } catch (e) { a = /no sketch/i.test(e.message); }
    try { b.linearPattern({ count: 2 }); } catch (e) { c = /no feature/i.test(e.message); }
    assert(a && c, 'guards missing: sketch=' + a + ' feature=' + c);
  });
  // like expectError, but also accepts the guard firing inside runScript (a Builder-level throw)
  function expectErrorAny(code, re) {
    var msg;
    try { msg = expectError(code, re); }
    catch (e) {
      msg = e && e.message || String(e);
      assert(re.test(msg), 'error "' + msg + '" does not match ' + re);
    }
    return msg;
  }
  test('a self-intersecting (bow-tie) profile is rejected, not extruded', function () {
    return expectErrorAny('p.sketch("Front").polyline([[0, 0], [10, 0], [0, 5], [10, 5]], true).extrude(2);', /crosses itself/i);
  });
  test('NaN extrude depth and revolve angle report "must be a number"', function () {
    var a = expectErrorAny('p.sketch("Front").rect(0, 0, 5, 5).extrude(NaN);', /must be a number/i);
    var b = expectErrorAny('p.sketch("Front").rect(1, 0, 3, 4).revolve(NaN);', /must be a number/i);
    var c = expectErrorAny('p.sketch("Front").rect(0, 0, 5, 5).extrude("deep");', /must be a number/i);
    return a + ' | ' + b + ' | ' + c;
  });

