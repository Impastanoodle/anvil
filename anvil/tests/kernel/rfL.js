  // ---- rfL (lane L, 2026-10-12): sketch DXF of a closed spline whose last point repeats the first
  (function () {
    test('rfL: a closed spline whose last point repeats the first exports to R12 as chained ARCs with no r = 0 / NaN arc (the zero-length closing span writes nothing), one closed loop, and to R2000 as one SPLINE', function () {
      var m = K.newModel('rfL'), b = new K.Builder(m);
      b.sketch('Front').spline([[0, 40], [10, 50], [20, 40], [0, 40]], true);
      var f = m.features[0];
      ['mm', 'in'].forEach(function (u) {
        var r12 = K.exportDXFSketch(f, u);
        assert(!/NaN|Infinity/.test(r12), u + ': no NaN / Infinity in the R12 file');
        var ents = DxfCheck.parse(r12).entities, arcs = ents.filter(function (e) { return e.type === 'ARC'; });
        assert(arcs.length > 10 && arcs.every(function (a) { return a.r > 1e-6 && isFinite(a.a0) && isFinite(a.a1); }), u + ': arcs all real: ' + arcs.length);
        assert(!ents.some(function (e) { return e.type === 'SPLINE'; }), 'R12 has no SPLINE');
        var c = DxfCheck.check(r12, { units: u });
        assert(c.ok && c.loops.length === 1 && c.loops[0].closed, u + ': one closed loop: ' + JSON.stringify([c.errors, c.loops.length]));
      });
      var r2000 = K.exportDXFSketch(f, 'mm', { version: 'R2000' });
      assert(DxfCheck.parse(r2000).entities.filter(function (e) { return e.type === 'SPLINE'; }).length === 1, 'R2000: one SPLINE');
      return 'R12 ' + DxfCheck.parse(K.exportDXFSketch(f, 'mm')).entities.filter(function (e) { return e.type === 'ARC'; }).length + ' arcs';
    });
  })();
  // --- end rfL ---

