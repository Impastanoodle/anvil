  // ------------------------------------------------------------------ examples
  group('examples');
  if (typeof AnvilExamples === 'undefined') {
    test('examples/examples.js loads', function () { fail('AnvilExamples is not defined'); });
  } else {
    test('examples/examples.js loads', function () { return AnvilExamples.length + ' examples'; });
    AnvilExamples.forEach(function (ex) {
      test('example: ' + ex.name, function () {
        var t0 = performance.now();
        var r = buildExample(ex);
        noErrors(r);
        assert(r.mp.volume > 0, 'volume should be positive, got ' + r.mp.volume);
        consistentVolume(r);
        if (ex.volume != null) nearRel(r.mp.volume, ex.volume, ex.tolerance || 0.02, 'volume vs documented');
        if (isAsmExample(ex)) {
          assert(Assembly.isAssembly(r.model), 'an assembly example must build an assembly model');
          checkAsmExample(ex, r);
          return r.model.components.length + ' components, ' + r.model.mates.length + ' mates, ' + (ex.checks || []).length + ' position checks, ' + fmt(r.mp.volume) + ' ' + r.model.units + '³, rebuild ' + (performance.now() - t0).toFixed(0) + ' ms';
        }
        return r.model.features.length + ' features, ' + r.mesh.triCount + ' tris, ' + fmt(r.mp.volume) + ' ' + r.model.units + '³, rebuild ' + (performance.now() - t0).toFixed(0) + ' ms';
      });
    });
    // generateScript -> runScript on a fresh model must reproduce every example exactly
    AnvilExamples.forEach(function (ex) {
      test('round-trip: ' + ex.name, function () {
        if (isAsmExample(ex)) {
          var aa = buildExample(ex);
          noErrors(aa);
          var ascript = Assembly.generateScript(aa.model);
          assert(Assembly.isAssemblyScript(ascript), 'generated assembly script is not recognised by isAssemblyScript');
          var ab = buildAsm(ascript);
          noErrors(ab);
          nearRel(ab.mp.volume, aa.mp.volume, 1e-6, 'volume');
          assert(ab.model.components.length === aa.model.components.length && ab.model.mates.length === aa.model.mates.length, 'component / mate counts');
          aa.model.components.forEach(function (c, i) {
            var d = ab.model.components[i];
            assert(d.name === c.name && !!d.fixed === !!c.fixed, 'component ' + i + ': ' + d.name + ' vs ' + c.name);
            nearVec(d.transform.position, c.transform.position, 1e-6, c.name + ' position');
            for (var k = 0; k < 9; k++) near(d.transform.rotation[k], c.transform.rotation[k], 1e-6, c.name + ' rotation[' + k + ']');
          });
          checkAsmExample(ex, ab);
          assert(ab.model.name === aa.model.name && ab.model.units === aa.model.units, 'name/units');
          return ascript.split('\n').length + ' lines';
        }
        var a = build(ex.code);
        noErrors(a);
        var script = K.generateScript(a.model);
        var b = build(script);
        noErrors(b);
        nearRel(b.mp.volume, a.mp.volume, 1e-6, 'volume');
        nearRel(b.mp.area, a.mp.area, 1e-6, 'area');
        nearVec(b.mp.bbox.min, a.mp.bbox.min, 1e-6, 'bbox.min'); nearVec(b.mp.bbox.max, a.mp.bbox.max, 1e-6, 'bbox.max');
        assert(b.model.features.length === a.model.features.length, 'feature count');
        assert(b.model.name === a.model.name && b.model.units === a.model.units, 'name/units');
        // a second generation from the rebuilt model must be textually identical (the generator is a fixed point)
        assert(K.generateScript(b.model) === script, 'generateScript is not stable across a round-trip');
        return script.split('\n').length + ' lines';
      });
    });
  }

