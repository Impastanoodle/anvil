  // --- r3/assembly3 ---
  // Pose-only rebuilds (the drag / explode frames), quick drag solves, memoised mate references, BOM descriptions.
  group('r3/assembly3: pose-only solves and BOM descriptions');
  if (typeof Assembly === 'undefined') test('assembly.js loads', function () { fail('Assembly is not defined'); });
  else (function () {
    var AS = Assembly;
    function gearTrain() {
      var ex = (typeof AnvilExamples !== 'undefined' ? AnvilExamples : []).filter(function (e) { return e.name === 'Gear train and patterns'; })[0];
      if (!ex) fail('Gear train example missing');
      var m = AS.newAssembly();
      AS.runScript(m, ex.code);
      return m;
    }
    test('poseOnly: the same placements and explode offsets as a full rebuild, no bodies; quick drag frames land within a micron of the exact drag', function () {
      var m = gearTrain(), b = AS.rebuild(m);
      var m1 = JSON.parse(JSON.stringify(m)), m2 = JSON.parse(JSON.stringify(m));
      var gear = AS.findComponent(m, 'Gear A<1>'), grab = [15, 2, 0], world = AS.transformPoint(gear.transform, grab);
      var drag = { id: gear.id, point: grab, target: [world[0] + 4, world[1], world[2] + 6] };
      AS.rebuild(m1, b.cache, { drag: drag });
      var pose = AS.rebuild(m2, b.cache, { drag: drag, poseOnly: true });
      assert(pose.pose === true && pose.body === null && pose.bodies === null, 'pose-only result has no bodies');
      m1.components.forEach(function (c, i) {
        var d = m2.components[i].transform;
        for (var k = 0; k < 3; k++) near(d.position[k], c.transform.position[k], 1e-9, c.name + ' position[' + k + ']');
        for (k = 0; k < 9; k++) near(d.rotation[k], c.transform.rotation[k], 1e-9, c.name + ' rotation[' + k + ']');
      });
      var moved = Math.hypot(m1.components[1].transform.rotation[0] - gear.transform.rotation[0], m1.components[1].transform.rotation[2] - gear.transform.rotation[2]);
      assert(moved > 1e-3, 'the drag turned Gear A');
      // a quick drag frame (a few pixels of mouse travel) lands where the exact drag does, within a micron
      var small = { id: gear.id, point: grab, target: [world[0] + 1, world[1], world[2] + 1] }, m4 = JSON.parse(JSON.stringify(m));
      AS.rebuild(m4, b.cache, { drag: small });
      var m3 = JSON.parse(JSON.stringify(m)), q = AS.rebuild(m3, b.cache, { drag: small, poseOnly: true, quick: true });
      assert(Object.keys(q.mates).every(function (id) { return q.mates[id].ok; }), 'quick: every mate holds');
      m4.components.forEach(function (c, i) { var d = m3.components[i].transform; for (var k = 0; k < 3; k++) near(d.position[k], c.transform.position[k], 1e-3, 'quick ' + c.name + '[' + k + ']'); });
      // exploded half way: the offsets and lines match too
      var mx = JSON.parse(JSON.stringify(m));
      mx.exploded = mx.explodedViews[0].id;
      var fx = AS.rebuild(JSON.parse(JSON.stringify(mx)), b.cache, { explodeT: 0.5 }), px = AS.rebuild(JSON.parse(JSON.stringify(mx)), b.cache, { explodeT: 0.5, poseOnly: true });
      Object.keys(fx.explode.offsets).forEach(function (id) { for (var k = 0; k < 3; k++) near(px.explode.offsets[id][k], fx.explode.offsets[id][k], 1e-12, 'offset ' + id); });
      assert(px.explode.lines.length === fx.explode.lines.length && fx.explode.lines.length > 0, 'explode lines');
    });
    test('mate references resolve once per part build (memo) and give the same answer', function () {
      var m = AS.newAssembly('Memo');
      var plate = AS.insert(m, { example: 'Plate with bolt holes' }, { fixed: true }).id;
      var pin = AS.insert(m, { script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [40, 30, -20] }).id;
      AS.addMate(m, 'concentric', { component: pin, cylinder: [4, 10, 0] }, { component: plate, cylinder: [14, 4, 10] });
      var b = AS.rebuild(m), r1 = AS.resolveRef(m, b.partBuilds, { component: plate, cylinder: [14, 4, 10] });
      var t0 = performance.now(), r2;
      for (var i = 0; i < 50; i++) r2 = AS.resolveRef(m, b.partBuilds, { component: plate, cylinder: [14, 4, 10] });
      var ms = (performance.now() - t0) / 50;
      for (var k = 0; k < 3; k++) { near(r2.point[k], r1.point[k], 0, 'point'); near(r2.dir[k], r1.dir[k], 0, 'dir'); }
      near(r2.radius, 4, 1e-9, 'radius');
      assert(ms < 2, 'a memoised reference resolves in ' + ms.toFixed(3) + ' ms');
      return ms.toFixed(3) + ' ms per ref';
    });
    test('BOM rows carry a description: the part\'s Description property, else its description, else its Design Library name', function () {
      var m = AS.newAssembly('Desc');
      AS.insert(m, { example: 'Hex nut' }, { fixed: true });
      AS.insert(m, { model: { name: 'Spacer', description: 'Ø10 spacer', units: 'mm', features: [], nextId: 1 } });
      AS.insert(m, { model: { name: 'Bracket', units: 'mm', features: [], nextId: 1, properties: { custom: [{ name: 'Description', type: 'Text', value: 'Steel bracket' }] } } });
      var rows = AS.bom(m, null, { type: 'top' }).map(function (r) { return r.description; });
      assert(rows[0] === 'Hex nut', rows[0]);
      assert(rows[1] === 'Ø10 spacer', rows[1]);
      if (typeof Materials !== 'undefined') assert(rows[2] === 'Steel bracket', rows[2]);
      return rows.join(', ');
    });
  })();
  // --- end r3/assembly3 ---
