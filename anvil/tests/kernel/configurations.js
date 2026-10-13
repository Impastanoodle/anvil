  // ------------------------------------------------------------------ configurations (named sets of global variable values)
  // model.configurations = [{ name, values: { T: '6' } }], model.activeConfiguration = name. The active set overrides the
  // expressions of the variables it names; everything downstream (resolve, rebuild, cache keys) follows it.
  group('configurations');
  var CFG_API = ['configurationList', 'findConfiguration', 'activeConfiguration', 'effectiveEquations', 'captureConfiguration', 'applyEquations'];
  // plate 10 × 10 × T in z [0, T] plus a 10 × 10 × W block beside it at x [20, 30]
  var CFG_PART = 'p.equations({ T: 10, W: "=T*2" });\n' +
    'p.configurations([{ name: "Thin", values: { T: 2 } }, { name: "Wide", values: { W: 5 } }, { name: "Both", values: { T: 4, W: "=T*3" } }]);\n' +
    'p.sketch("Front").rect(0, 0, 10, 10).extrude("=T");\n' +
    'p.sketch("Front").rect(20, 0, 10, 10).extrude("=W");';
  function cfgVolume(T, W) { return 100 * T + 100 * W; }
  function cfgModel(active) {
    var m = K.newModel('Cfg');
    K.runScript(m, CFG_PART);
    if (active !== undefined) m.activeConfiguration = active;
    return m;
  }
  function cfgBuild(m, cache) {
    var b = K.rebuild(m, cache);
    noErrors({ errors: b.errors });
    return b;
  }
  test('Kernel exports the configurations API and Builder.configurations / activeConfiguration', function () {
    var missing = CFG_API.filter(function (n) { return typeof K[n] !== 'function'; });
    assert(!missing.length, 'missing Kernel.' + missing.join(', Kernel.'));
    assert(typeof K.Builder.prototype.configurations === 'function' && typeof K.Builder.prototype.activeConfiguration === 'function', 'Builder methods missing');
  });
  test('Builder.configurations stores numbers as strings and strips a leading "="; no active configuration by default', function () {
    var m = cfgModel();
    assert(JSON.stringify(m.configurations) === JSON.stringify([{ name: 'Thin', values: { T: '2' } }, { name: 'Wide', values: { W: '5' } }, { name: 'Both', values: { T: '4', W: 'T*3' } }]), 'configurations: ' + JSON.stringify(m.configurations));
    assert(m.activeConfiguration === undefined, 'activeConfiguration: ' + JSON.stringify(m.activeConfiguration));
    assert(K.configurationList(m).length === 3 && K.findConfiguration(m, 'Wide') === m.configurations[1] && K.findConfiguration(m, 'Nope') === null, 'configurationList / findConfiguration');
    assert(K.activeConfiguration(m) === null, 'activeConfiguration(model) should be null');
    assert(K.configurationList(K.newModel('E')).length === 0 && K.configurationList({ configurations: 'x' }).length === 0, 'no list → []');
    K.runScript(m, 'p.configurations([{ name: "A", values: { T: 1 } }], "A");');
    assert(m.configurations.length === 1 && m.activeConfiguration === 'A', 'second call replaces the list and activates: ' + JSON.stringify(m));
    K.runScript(m, 'p.configurations([]);');
    assert(m.configurations === undefined && m.activeConfiguration === undefined, 'empty list deletes both: ' + JSON.stringify(m.configurations) + ' / ' + JSON.stringify(m.activeConfiguration));
  });
  test('resolveEquations: no active configuration → base values, configuration null', function () {
    var r = K.resolveEquations(cfgModel());
    assert(r.vars.T === 10 && r.vars.W === 20 && r.configuration === null && !Object.keys(r.errors).length, JSON.stringify(r));
  });
  test('resolveEquations: an active configuration overrides only the variables it names; dependents follow', function () {
    var thin = K.resolveEquations(cfgModel('Thin'));
    assert(thin.vars.T === 2 && thin.vars.W === 4 && thin.configuration === 'Thin', 'Thin: ' + JSON.stringify(thin));
    var wide = K.resolveEquations(cfgModel('Wide'));
    assert(wide.vars.T === 10 && wide.vars.W === 5 && wide.configuration === 'Wide', 'Wide: ' + JSON.stringify(wide));
  });
  test('resolveEquations: an override may reference an earlier variable (Both: T = 4, W = T*3 = 12)', function () {
    var r = K.resolveEquations(cfgModel('Both'));
    assert(r.vars.T === 4 && r.vars.W === 12 && !Object.keys(r.errors).length, JSON.stringify(r));
    var m = cfgModel('Both');
    m.configurations[2].values = { T: 'W+1', W: '3' }; // W is evaluated after T: a forward reference fails
    var f = K.resolveEquations(m);
    assert(f.errors.T && f.vars.W === 3, 'forward reference: ' + JSON.stringify(f));
  });
  test('an unknown active name means the base equations; a value for a non-equation name is ignored', function () {
    var r = K.resolveEquations(cfgModel('Nope'));
    assert(r.vars.T === 10 && r.vars.W === 20 && r.configuration === null, 'unknown active: ' + JSON.stringify(r));
    assert(K.activeConfiguration(cfgModel('Nope')) === null, 'activeConfiguration(model) with an unknown name');
    var m = cfgModel('Thin');
    m.configurations[0].values.Ghost = '99';
    var g = K.resolveEquations(m);
    assert(!('Ghost' in g.vars) && !Object.keys(g.errors).length && g.vars.T === 2, 'Ghost: ' + JSON.stringify(g));
  });
  test('effectiveEquations and captureConfiguration reflect the active set; the model is not changed', function () {
    var m = cfgModel('Both'), before = JSON.stringify(m);
    assert(JSON.stringify(K.effectiveEquations(m)) === JSON.stringify([{ name: 'T', expr: '4' }, { name: 'W', expr: 'T*3' }]), 'effective: ' + JSON.stringify(K.effectiveEquations(m)));
    assert(JSON.stringify(K.captureConfiguration(m)) === JSON.stringify({ T: '4', W: 'T*3' }), 'capture: ' + JSON.stringify(K.captureConfiguration(m)));
    assert(JSON.stringify(m) === before, 'model changed');
    var base = cfgModel();
    assert(K.effectiveEquations(base) === base.equations, 'no active configuration → model.equations itself');
    assert(JSON.stringify(K.captureConfiguration(base)) === JSON.stringify({ T: '10', W: 'T*2' }), 'base capture: ' + JSON.stringify(K.captureConfiguration(base)));
    assert(JSON.stringify(K.captureConfiguration(K.newModel('E'))) === '{}', 'no equations → {}');
  });
  test('applyEquations without an active configuration replaces model.equations; an empty list deletes it', function () {
    var m = cfgModel();
    K.applyEquations(m, [{ name: 'T', expr: '7' }, { name: 'W', expr: 'T+1' }]);
    assert(JSON.stringify(m.equations) === JSON.stringify([{ name: 'T', expr: '7' }, { name: 'W', expr: 'T+1' }]), 'equations: ' + JSON.stringify(m.equations));
    assert(m.configurations[0].values.T === '2' && m.configurations[2].values.W === 'T*3', 'configurations untouched: ' + JSON.stringify(m.configurations));
    K.applyEquations(m, []);
    assert(m.equations === undefined, 'empty list should delete model.equations: ' + JSON.stringify(m.equations));
  });
  test('applyEquations with an active configuration: its own variables change in that configuration only, others in the base', function () {
    var m = cfgModel('Thin');
    K.applyEquations(m, [{ name: 'T', expr: '3' }, { name: 'W', expr: 'T*5' }]);
    assert(m.configurations[0].values.T === '3', 'Thin.T: ' + JSON.stringify(m.configurations[0].values));
    assert(!('W' in m.configurations[0].values), 'Thin must not gain W: ' + JSON.stringify(m.configurations[0].values));
    assert(JSON.stringify(m.equations) === JSON.stringify([{ name: 'T', expr: '10' }, { name: 'W', expr: 'T*5' }]), 'base: T kept, W changed: ' + JSON.stringify(m.equations));
    assert(m.configurations[2].values.T === '4' && m.configurations[2].values.W === 'T*3', 'Both untouched: ' + JSON.stringify(m.configurations[2]));
    var r = K.resolveEquations(m);
    assert(r.vars.T === 3 && r.vars.W === 15, 'resolved: ' + JSON.stringify(r.vars));
    m.activeConfiguration = null;
    var b = K.resolveEquations(m);
    assert(b.vars.T === 10 && b.vars.W === 50, 'base after the edit: ' + JSON.stringify(b.vars));
  });
  test('applyEquations: a dropped name leaves model.equations and every configuration; a new name goes to the base', function () {
    var m = cfgModel('Both');
    K.applyEquations(m, [{ name: 'T', expr: '4' }, { name: 'H', expr: 'T/2' }]);
    assert(JSON.stringify(m.equations) === JSON.stringify([{ name: 'T', expr: '10' }, { name: 'H', expr: 'T/2' }]), 'equations: ' + JSON.stringify(m.equations));
    m.configurations.forEach(function (c) { assert(!('W' in c.values), c.name + ' still has W: ' + JSON.stringify(c.values)); });
    assert(m.configurations[2].values.T === '4' && !('H' in m.configurations[2].values), 'Both: ' + JSON.stringify(m.configurations[2].values));
    var r = K.resolveEquations(m);
    assert(r.vars.T === 4 && r.vars.H === 2 && !('W' in r.vars), JSON.stringify(r.vars));
  });
  test('Builder.activeConfiguration throws for an unknown name; null clears', function () {
    var m = cfgModel(), msg = '';
    try { K.runScript(m, 'p.activeConfiguration("Nope");'); } catch (e) { msg = String(e.message || e); }
    assert(/Nope/.test(msg), 'expected a throw naming "Nope", got "' + msg + '"');
    assert(m.activeConfiguration === undefined, 'a failed call must not set the name');
    K.runScript(m, 'p.activeConfiguration("Wide");');
    assert(m.activeConfiguration === 'Wide', 'set: ' + m.activeConfiguration);
    K.runScript(m, 'p.activeConfiguration(null);');
    assert(m.activeConfiguration === undefined, 'null clears: ' + JSON.stringify(m.activeConfiguration));
    msg = '';
    try { K.runScript(K.newModel('E'), 'p.configurations([{ name: "A", values: {} }], "B");'); } catch (e) { msg = String(e.message || e); }
    assert(/B/.test(msg), 'configurations(list, unknown active) should throw: "' + msg + '"');
    return msg;
  });
  test('rebuild: volume per configuration is analytic; build.configuration and build.equations follow', function () {
    var cases = [[undefined, 10, 20, null], ['Thin', 2, 4, 'Thin'], ['Wide', 10, 5, 'Wide'], ['Both', 4, 12, 'Both'], ['Nope', 10, 20, null]];
    var out = cases.map(function (c) {
      var b = cfgBuild(cfgModel(c[0]));
      near(b.body.volume(), cfgVolume(c[1], c[2]), 1e-9, (c[0] || 'base') + ' volume');
      assert(b.configuration === c[3], (c[0] || 'base') + ': build.configuration = ' + JSON.stringify(b.configuration));
      assert(b.equations.T === c[1] && b.equations.W === c[2], (c[0] || 'base') + ': build.equations = ' + JSON.stringify(b.equations));
      return (c[0] || 'base') + ' ' + b.body.volume();
    });
    var rm = K.resolvedModel(cfgModel('Thin'));
    assert(rm.configuration === 'Thin' && rm.model.features[1].depth === 2, 'resolvedModel: ' + rm.configuration + ', depth ' + rm.model.features[1].depth);
    return out.join(', ');
  });
  test('rebuild cache: switching configuration rebuilds only the features whose values change; switching back is identical', function () {
    var m = cfgModel(), n = m.features.length;
    var b0 = cfgBuild(m), v0 = b0.body.volume();
    m.activeConfiguration = 'Wide'; // only W changes: the T extrude and both sketches are reused
    var b1 = cfgBuild(m, b0.cache);
    assert(b1.reused === n - 1, 'Wide: reused ' + b1.reused + ' of ' + n);
    near(b1.body.volume(), cfgVolume(10, 5), 1e-9, 'Wide');
    m.activeConfiguration = 'Thin'; // T changes: the first extrude and everything after it rebuild
    var b2 = cfgBuild(m, b1.cache);
    assert(b2.reused === 1, 'Thin: reused ' + b2.reused + ' of ' + n + ' (only the first sketch)');
    near(b2.body.volume(), cfgVolume(2, 4), 1e-9, 'Thin');
    near(b2.body.volume(), K.rebuild(JSON.parse(JSON.stringify(m))).body.volume(), 1e-9, 'cached equals fresh');
    var b3 = cfgBuild(m, b2.cache);
    assert(b3.reused === n, 'same configuration again: everything reused (' + b3.reused + ')');
    m.activeConfiguration = null;
    var b4 = cfgBuild(m, b3.cache);
    assert(b4.body.volume() === v0, 'back to base: volume ' + b4.body.volume() + ' is not identical to ' + v0);
    m.activeConfiguration = 'Nope'; // an unknown name resolves exactly like the base
    var b5 = cfgBuild(m, b4.cache);
    assert(b5.reused === n && b5.body.volume() === v0, 'unknown name: reused ' + b5.reused + ', volume ' + b5.body.volume());
    return 'reused ' + [b1.reused, b2.reused, b3.reused, b5.reused].join(', ') + ' of ' + n;
  });
  test('generateScript round trip: equations, configurations and activeConfiguration come back identical, and the script is a fixed point', function () {
    var a = build(CFG_PART + '\np.activeConfiguration("Both");');
    noErrors(a);
    near(a.mp.volume, cfgVolume(4, 12), 1e-6, 'volume in Both');
    var s = K.generateScript(a.model);
    var iEq = s.indexOf('p.equations('), iCfg = s.indexOf('p.configurations('), iAct = s.indexOf('p.activeConfiguration("Both");'), iSk = s.indexOf('p.sketch(');
    assert(iEq >= 0 && iCfg > iEq && iAct > iCfg && iSk > iAct, 'order equations < configurations < activeConfiguration < features: ' + [iEq, iCfg, iAct, iSk].join(', '));
    var b = build(s);
    noErrors(b);
    ['equations', 'configurations', 'activeConfiguration'].forEach(function (k) {
      assert(JSON.stringify(b.model[k]) === JSON.stringify(a.model[k]), k + ': ' + JSON.stringify(b.model[k]) + ' vs ' + JSON.stringify(a.model[k]));
    });
    nearRel(b.mp.volume, a.mp.volume, 1e-12, 'volume');
    assert(K.generateScript(b.model) === s, 'generateScript is not stable across the round trip');
    var none = K.generateScript(cfgModel());
    assert(none.indexOf('p.configurations(') >= 0 && none.indexOf('p.activeConfiguration') < 0, 'no active configuration → no p.activeConfiguration line');
    var stale = cfgModel('Gone');
    assert(K.generateScript(stale).indexOf('p.activeConfiguration') < 0, 'an unknown active name is not written (it would throw on the way back)');
    var plain = K.generateScript(build('p.box(1, 1, 1);').model);
    assert(plain.indexOf('configurations') < 0 && plain.indexOf('activeConfiguration') < 0, 'a model without configurations writes neither');
    return s.split('\n').slice(2, 5).join(' / ').slice(0, 160);
  });
  test('box sizes given as "=..." are evaluated at script time with the active configuration', function () {
    var r = build('p.equations({ T: 10 });\np.configurations([{ name: "S", values: { T: 3 } }], "S");\np.box(10, 10, "=T");');
    noErrors(r);
    near(r.mp.volume, 300, 1e-9, 'box built with T = 3');
  });
  test('packBuild / unpackBuild carry build.configuration', function () {
    var m = cfgModel('Wide'), b = cfgBuild(m);
    var packed = K.packBuild(b, m);
    assert(packed.configuration === 'Wide', 'packed.configuration: ' + JSON.stringify(packed.configuration));
    var u = K.unpackBuild(K.packBuild(b, m));
    assert(u.configuration === 'Wide', 'unpacked configuration: ' + JSON.stringify(u.configuration));
    assert(u.equations.W === 5, 'unpacked equations: ' + JSON.stringify(u.equations));
    near(u.body.volume(), cfgVolume(10, 5), 1e-9, 'unpacked body');
    var base = cfgModel(), bb = cfgBuild(base);
    assert(K.unpackBuild(K.packBuild(bb, base)).configuration === null, 'base: configuration null');
  });
  // every Design Library example that lists configurations: switch to each one, rebuild, check the documented volume
  (typeof AnvilExamples !== 'undefined' ? AnvilExamples : []).filter(function (ex) { return ex.configurations; }).forEach(function (ex) {
    test('example "' + ex.name + '": every configuration builds to its documented volume; switching back restores the first', function () {
      var r = build(ex.code);
      noErrors(r);
      var names = Object.keys(ex.configurations), cache = r.build.cache, out = [];
      var list = K.configurationList(r.model).map(function (c) { return c.name; });
      assert(JSON.stringify(list.slice().sort()) === JSON.stringify(names.slice().sort()), 'configurations in the script ' + JSON.stringify(list) + ' vs documented ' + JSON.stringify(names));
      var start = r.model.activeConfiguration, v0 = r.body.volume();
      assert(start && ex.configurations[start] != null, 'the script should activate a documented configuration: ' + JSON.stringify(start));
      nearRel(v0, ex.configurations[start], 1e-9, start + ' (as scripted)');
      names.forEach(function (name) {
        r.model.activeConfiguration = name;
        var b = K.rebuild(r.model, cache);
        noErrors({ errors: b.errors });
        assert(b.configuration === name, 'build.configuration: ' + b.configuration);
        var mp = K.massProps(K.meshFromBody(b.body), 1);
        nearRel(mp.volume, ex.configurations[name], 1e-9, name + ' volume');
        near(mp.volume, b.body.volume(), Math.abs(b.body.volume()) * 1e-6, name + ' mesh volume vs polygon volume');
        cache = b.cache;
        out.push(name + ' ' + fmt(mp.volume) + ' (reused ' + b.reused + ')');
      });
      r.model.activeConfiguration = start;
      var back = K.rebuild(r.model, cache);
      assert(back.body.volume() === v0, 'back to ' + start + ': ' + back.body.volume() + ' vs ' + v0);
      return out.join(', ');
    });
  });

