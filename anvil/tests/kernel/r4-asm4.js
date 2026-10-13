  // --- r4/asm4 ---
  // Pose-only rebuilds of Flexible sub-assemblies (drag frames) and ignored interferences saved in the assembly.
  group('r4/asm4: flexible poses and ignored interferences');
  if (typeof Assembly === 'undefined') test('assembly.js loads', function () { fail('Assembly is not defined'); });
  else (function () {
    var AS = Assembly;
    function example(name, drop) {
      var ex = (typeof AnvilExamples !== 'undefined' ? AnvilExamples : []).filter(function (e) { return e.name === name; })[0];
      if (!ex) fail(name + ' example missing');
      var m = AS.newAssembly();
      AS.runScript(m, drop ? ex.code.split('\n').filter(function (l) { return !drop.test(l); }).join('\n') : ex.code);
      return m;
    }
    test('poseOnly with a Flexible sub-assembly: the same flexState as a full rebuild of the same drag, and the part builds are not composed', function () {
      var m = example('Hinged cover (sub-assemblies)', /a\.angle/), b = AS.rebuild(m);
      var h = AS.findComponent(m, 'Hinge<2>'), arm = b.partBuilds[h.id].model.components.filter(function (k) { return !k.fixed; })[0];
      assert(h.flexible && arm, 'flexible hinge with a floating arm');
      var drag = { id: h.id + '/' + arm.id, point: [21, 5, 10], target: [95, 45, 10] };
      var m1 = JSON.parse(JSON.stringify(m)), m2 = JSON.parse(JSON.stringify(m));
      var full = AS.rebuild(m1, b.cache, { drag: drag }), pose = AS.rebuild(m2, b.cache, { drag: drag, poseOnly: true });
      assert(pose.pose === true && pose.body === null, 'pose-only result');
      assert(!pose.partBuilds[h.id].flexible && full.partBuilds[h.id].flexible, 'the composed sub-assembly body is built by the full rebuild only');
      var f1 = AS.findComponent(m1, h.id).flexState, f2 = AS.findComponent(m2, h.id).flexState, k = String(arm.id);
      assert(f1[k] && f2[k], 'flexState of the arm');
      for (var i = 0; i < 9; i++) near(f2[k].rotation[i], f1[k].rotation[i], 1e-9, 'rotation[' + i + ']');
      for (i = 0; i < 3; i++) near(f2[k].position[i], f1[k].position[i], 1e-9, 'position[' + i + ']');
      assert(Math.abs(f1[k].rotation[0] - 1) > 1e-3 || Math.abs(f1[k].rotation[4] - 1) > 1e-3, 'the arm turned');
    });
    test('ignored interferences: a.ignoreInterference stores sorted component-id keys on the model (r5/asm5: ids, not names); generateScript writes them back by name; setInterferenceIgnored removes the list when empty', function () {
      var m = example('Interference check');
      var b = new AS.Builder(m), names = m.components.map(function (c) { return c.name; }), ids = m.components.map(function (c) { return String(c.id); });
      b.ignoreInterference(m.components[1].id, names[0]);
      b.ignoreInterference(names[2], names[0], { coincident: true });
      var want = [AS.interferenceKey(ids[0], ids[1]), AS.interferenceKey(ids[0], ids[2], true)];
      assert(JSON.stringify(m.ignoredInterferences) === JSON.stringify(want), JSON.stringify(m.ignoredInterferences));
      assert(want[0] === [ids[0], ids[1]].sort().join('|') && /#c$/.test(want[1]), 'key format');
      var code = AS.generateScript(m), m2 = AS.newAssembly();
      assert(code.indexOf('a.ignoreInterference(' + JSON.stringify(names[1])) >= 0 || code.indexOf(JSON.stringify(names[1]) + ', ' + JSON.stringify(names[0])) >= 0 || code.indexOf(JSON.stringify(names[0]) + ', ' + JSON.stringify(names[1])) >= 0, 'the script names them');
      AS.runScript(m2, code);
      var ids2 = names.map(function (nm) { return String(AS.findComponent(m2, nm).id); });
      want = [AS.interferenceKey(ids2[0], ids2[1]), AS.interferenceKey(ids2[0], ids2[2], true)];
      assert(JSON.stringify(m2.ignoredInterferences) === JSON.stringify(want), 'round trip: ' + JSON.stringify(m2.ignoredInterferences));
      AS.setInterferenceIgnored(m2, want[0], false); AS.setInterferenceIgnored(m2, want[1], false);
      assert(!('ignoredInterferences' in m2), 'list removed when empty');
      return code.split('\n').filter(function (l) { return /ignoreInterference/.test(l); }).join(' ');
    });
  })();
  // --- end r4/asm4 ---

