  // --- r11/perf11 ---
  group('r11/perf11: mass properties cache and box-filtered curve walls');
  test('curve correction with the planar box filter is bit-identical to the unfiltered one on every part example', function () {
    var n = 0, faster = 0, slower = 0;
    AnvilExamples.filter(function (ex) { return !isAsmExample(ex); }).forEach(function (ex) {
      var m = K.newModel('x'); K.runScript(m, ex.code);
      var mesh = K.meshFromBody(K.rebuild(m).body), polys = [];
      (mesh.faces || []).forEach(function (f) { if (f.polys) polys = polys.concat(f.polys); });
      var t0 = performance.now(), a = K.curveCorrection(polys), t1 = performance.now(), b;
      K.massOptions.planarBoxes = false;
      try { b = K.curveCorrection(polys); } finally { K.massOptions.planarBoxes = true; }
      var t2 = performance.now();
      if (t1 - t0 < t2 - t1) faster += (t2 - t1) - (t1 - t0); else slower += (t1 - t0) - (t2 - t1);
      assert(a.volume === b.volume && a.area === b.area && a.facets === b.facets && a.moment.every(function (x, i) { return x === b.moment[i]; }),
        ex.name + ': ' + JSON.stringify([a.volume, a.area]) + ' vs ' + JSON.stringify([b.volume, b.area]));
      n++;
    });
    return n + ' examples identical; filter saved ' + faster.toFixed(0) + ' ms, cost ' + slower.toFixed(0) + ' ms';
  });
  test('massProps is kept per mesh: equal to a fresh computation, a fresh copy each call, density applied per call, a changed mesh recomputed', function () {
    var r = build('p.cylinder(20, 10);'), mesh = r.mesh;
    assert(r.mp.curved > 0, 'the cylinder has curved facets (curve correction applies)');
    var a = K.massProps(mesh, 2), b = K.massProps(mesh, 2);
    K.massOptions.cache = false;
    var c;
    try { c = K.massProps(mesh, 2); } finally { K.massOptions.cache = true; }
    assert(JSON.stringify(a) === JSON.stringify(c) && JSON.stringify(b) === JSON.stringify(c), 'cached ' + JSON.stringify(b) + ' vs fresh ' + JSON.stringify(c));
    assert(a !== b && a.centroid !== b.centroid && a.bbox.min !== b.bbox.min, 'each call returns its own object');
    b.centroid[0] = 1e9; b.volume = -1;
    near(K.massProps(mesh, 2).centroid[0], c.centroid[0], 0, 'a caller changing its copy does not reach the cache');
    var d = K.massProps(mesh, 7.85e-6);
    near(d.mass, c.volume * 7.85e-6, 1e-12 * c.volume, 'mass with another density'); assert(d.density === 7.85e-6, 'density');
    // a changed mesh (positions scaled in place by 2) misses the cache: volume × 8
    var P = mesh.positions64 || mesh.positions;
    for (var i = 0; i < P.length; i++) P[i] *= 2;
    (mesh.faces || []).forEach(function (f) { f.polys = null; });
    nearRel(K.massProps(mesh, 2).volume, 8 * r.body.volume(), 1e-9, 'scaled mesh volume');
    return 'volume ' + fmt(c.volume) + ', mass ' + fmt(c.mass);
  });
  // --- end r11/perf11 ---

