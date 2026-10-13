  // --- r5/asm5 ---
  group('r5/asm5: floating clusters, ignored interferences by component id');
  if (typeof Assembly === 'undefined') test('assembly.js loads', function () { fail('Assembly is not defined'); });
  else (function () {
    var AS = Assembly;
    // a plate with n pins in its holes, nothing fixed: pin 0 concentric only, the others concentric + flush
    function floatingPins(n) {
      var m = AS.newAssembly(), L = ['a.name("Float' + n + '").units("mm");', 'var plate = a.insert({ script: \'p.name("Plate"); p.box(300, 60, 8); p.hole("Top", 10, -10, 8, { offset: 8 }); p.linearPattern({ dir: "x", spacing: 28, count: 10, dir2: "z", spacing2: 20, count2: 3 });\' }); a.float(plate);'];
      for (var i = 0; i < n; i++) {
        var x = 10 + 28 * (i % 10), z = 10 + 20 * Math.floor(i / 10);
        L.push('var q' + i + ' = a.insert({ script: \'p.name("Pin"); p.cylinder(4, 20);\' }, { position: [' + (x + 3) + ', 15, ' + (z - 2) + '] });');
        L.push('a.concentric({ component: q' + i + ', cylinder: [4, 10, 0] }, { component: plate, cylinder: [' + (x + 4) + ', 4, ' + z + '] });');
        if (i) L.push('a.coincident({ component: q' + i + ', face: [1, 0, 1] }, { component: plate, face: [155, 0, 40] }, { alignment: "aligned" });');
      }
      AS.runScript(m, L.join('\n'));
      return m;
    }
    test('a large floating cluster (a plate and 30 pins, nothing fixed) solves with its hub held: fast, every mate met, every component 6 DOF, the plate stays where it was', function () {
      var m = floatingPins(30), b0 = AS.rebuild(m), P0 = m.components[0].transform.position.slice();
      var t0 = performance.now(), b = AS.rebuild(m, b0.cache), ms = performance.now() - t0;
      assert(Object.keys(b.errors).length === 0, JSON.stringify(b.errors));
      assert(Object.keys(b.mates).every(function (id) { return b.mates[id].ok; }), 'mates met');
      assert(b.components.every(function (c) { return c.dof === 6 && c.underDefined; }), 'all free: ' + b.components.map(function (c) { return c.dof; }).join(''));
      for (var k = 0; k < 3; k++) near(m.components[0].transform.position[k], P0[k], 1e-9, 'plate position[' + k + ']');
      assert(ms < 1500, 'solve ' + ms.toFixed(0) + ' ms');
      return ms.toFixed(1) + ' ms';
    });
    test('dragging in a floating cluster: a pin with a free slide moves along it (the plate stays); a pin its mates hold to the plate takes the whole cluster along (a translation, mates kept)', function () {
      var m = floatingPins(12), b = AS.rebuild(m), plate = m.components[0], p0 = m.components[1], p1 = m.components[2];
      var P0 = plate.transform.position.slice(), y0 = p0.transform.position[1];
      var m1 = JSON.parse(JSON.stringify(m)), pt = [0, 10, 0], w = AS.transformPoint(p0.transform, pt);
      var t0 = performance.now();
      var r1 = AS.rebuild(m1, b.cache, { drag: { id: p0.id, point: pt, target: [w[0], w[1] + 7, w[2]] }, poseOnly: true, quick: true }), ms = performance.now() - t0;
      near(AS.findComponent(m1, p0.id).transform.position[1], y0 + 7, 1e-3, 'pin 0 slid up');
      for (var k = 0; k < 3; k++) near(AS.findComponent(m1, plate.id).transform.position[k], P0[k], 1e-6, 'plate stays [' + k + ']');
      var m2 = JSON.parse(JSON.stringify(m)), w1 = AS.transformPoint(p1.transform, pt);
      var r2 = AS.rebuild(m2, b.cache, { drag: { id: p1.id, point: pt, target: [w1[0] + 5, w1[1] + 7, w1[2]] } });
      var d = [0, 1, 2].map(function (k) { return AS.findComponent(m2, plate.id).transform.position[k] - P0[k]; });
      near(d[0], 5, 1e-6, 'plate follows x'); near(d[1], 7, 1e-6, 'plate follows y'); near(d[2], 0, 1e-6, 'plate z');
      assert(Object.keys(r2.mates).every(function (id) { return r2.mates[id].ok; }), 'mates still met');
      assert(Object.keys(r1.mates).length && ms < 500, 'drag frame ' + ms.toFixed(0) + ' ms');
      return 'frame ' + ms.toFixed(1) + ' ms';
    });
    test('a small floating pair is solved as before (no hub held): a block mated to a floating base moves onto it', function () {
      var m = AS.newAssembly();
      AS.runScript(m, 'var a1 = a.insert({ script: \'p.box(40, 40, 10);\' }); var b1 = a.insert({ script: \'p.box(10, 10, 10);\' }, { position: [5, 30, 5] }); a.float(a1);\na.coincident({ component: b1, face: [5, 0, 5] }, { component: a1, face: [20, 10, 20] });');
      var b = AS.rebuild(m);
      assert(Object.keys(b.mates).every(function (id) { return b.mates[id].ok; }), 'mate met');
      assert(b.components.every(function (c) { return c.dof === 6; }), 'both free');
    });
    test('ignored interferences: keys saved by name (older saves) move to component ids on rebuild; a renamed component keeps them (the script names the new name); a deleted one takes its keys along', function () {
      var ex = (typeof AnvilExamples !== 'undefined' ? AnvilExamples : []).filter(function (e) { return e.name === 'Interference check'; })[0];
      var m = AS.newAssembly();
      AS.runScript(m, ex.code);
      var names = m.components.map(function (c) { return c.name; }), ids = m.components.map(function (c) { return String(c.id); });
      m.ignoredInterferences = [[names[0], names[1]].sort().join('|'), [names[0], names[2]].sort().join('|') + '#c', 'Gone<1>|' + names[0]];
      AS.rebuild(m);
      var want = [AS.interferenceKey(ids[0], ids[1]), AS.interferenceKey(ids[0], ids[2], true)];
      assert(m.ignoredInterferences[0] === want[0] && m.ignoredInterferences[1] === want[1], 'migrated: ' + JSON.stringify(m.ignoredInterferences));
      assert(m.ignoredInterferences[2] === AS.interferenceKey('Gone<1>', ids[0]), 'an unknown name stays as it is: ' + m.ignoredInterferences[2]);
      m.components[1].name = 'Renamed<1>';
      var code = AS.generateScript(m);
      assert(/a\.ignoreInterference\([^)]*"Renamed<1>"/.test(code), 'script uses the new name: ' + code.split('\n').filter(function (l) { return /ignoreInterference/.test(l); }).join(' '));
      AS.removeComponent(m, m.components[2].id);
      assert(m.ignoredInterferences.indexOf(want[1]) < 0 && m.ignoredInterferences.indexOf(want[0]) >= 0, 'the deleted component\'s key went: ' + JSON.stringify(m.ignoredInterferences));
      var b = new AS.Builder(m);
      b.ignoreInterference('Renamed<1>/Body2', names[0]);
      assert(m.ignoredInterferences.indexOf(AS.interferenceKey(ids[1] + '/Body2', ids[0])) >= 0, 'a body of a multibody part: id/Body');
    });
  })();
  // --- end r5/asm5 ---

