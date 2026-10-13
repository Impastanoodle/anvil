  // --- refine/assembly ---
  // Mate solver: free drag of under-defined components (rebuild opts.drag), 'closest' alignment that a later mate may
  // turn over, robustness from arbitrary starting placements.
  group('refine/assembly: drag and solver robustness');
  if (typeof Assembly === 'undefined') test('assembly.js loads', function () { fail('Assembly is not defined'); });
  else (function () {
    var AS = Assembly;
    function noErr(b) { var k = Object.keys(b.errors); if (k.length) fail('assembly errors: ' + k.map(function (id) { return b.errors[id]; }).join(' | ')); }
    function link(L, name) { return { script: 'p.name("' + name + '"); p.box(' + (L + 10) + ', 10, 5, { at: [-5, 0, -5] }); p.cylinder(2, 5, { cut: true }); p.cylinder(2, 5, { cut: true, at: [' + L + ', 0, 0] });' }; }
    // a planar four-bar: ground 100, crank 40, coupler 120, rocker 80 (1 DOF)
    function fourBar() {
      var m = AS.newAssembly('FourBar');
      var base = AS.insert(m, { script: 'p.name("Base"); p.box(200, 60, 10, { centered: true }); p.cylinder(2, 30, { at: [-50, 10, 0] }); p.cylinder(2, 30, { at: [50, 10, 0] });' }, { fixed: true }).id;
      var crank = AS.insert(m, link(40, 'Crank'), { position: [-60, 40, 20] }).id;
      var rocker = AS.insert(m, link(80, 'Rocker'), { position: [60, 40, 30], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0] }).id;
      var coupler = AS.insert(m, link(120, 'Coupler'), { position: [0, 60, 40] }).id;
      AS.addMate(m, 'concentric', { component: crank, cylinder: [2, 2.5, 0] }, { component: base, cylinder: [-48, 20, 0] });
      AS.addMate(m, 'coincident', { component: crank, face: [10, 0, 0] }, { component: base, face: [0, 10, -20] });
      AS.addMate(m, 'concentric', { component: rocker, cylinder: [2, 2.5, 0] }, { component: base, cylinder: [52, 20, 0] });
      AS.addMate(m, 'coincident', { component: rocker, face: [10, 0, 0] }, { component: base, face: [0, 10, -20] });
      AS.addMate(m, 'concentric', { component: coupler, cylinder: [2, 2.5, 0] }, { component: crank, cylinder: [42, 2.5, 0] });
      AS.addMate(m, 'coincident', { component: coupler, face: [10, 0, 0] }, { component: crank, face: [10, 5, 0] });
      AS.addMate(m, 'concentric', { component: coupler, cylinder: [122, 2.5, 0] }, { component: rocker, cylinder: [82, 2.5, 0] });
      return { m: m, crank: crank, rocker: rocker, coupler: coupler };
    }
    function turnY(m, id) { var R = AS.findComponent(m, id).transform.rotation; return Math.atan2(-R[6], R[0]) * 180 / Math.PI; }
    function wrap(a) { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; }
    function badMates(b) { return Object.keys(b.mates).filter(function (k) { return !b.mates[k].ok; }); }

    test('Drag: a hinged arm swings to follow the grabbed point (it used to snap back); the mates stay exact', function () {
      var m = AS.newAssembly();
      var leaf = AS.insert(m, { script: 'p.name("Leaf"); p.box(40, 20, 5, { at: [-40, -5, 0] });' }, { fixed: true }).id;
      var arm = AS.insert(m, { script: 'p.name("Arm"); p.box(40, 20, 5, { at: [1, 0, 0] });' }, { rotation: [0, -1, 0, 1, 0, 0, 0, 0, 1] }).id;
      AS.addMate(m, 'concentric', { component: arm, axis: 'z' }, { component: leaf, axis: 'z' });
      AS.addMate(m, 'coincident', { component: arm, face: [21, 2.5, 0] }, { component: leaf, face: [-20, -2.5, 0] }, { alignment: 'aligned' });
      var b = AS.rebuild(m);
      noErr(b);
      // grab the arm's far end (local [41, 2.5, 10]: world [-2.5, 41, 10] standing up) and pull it to 45° on the +x side
      var tgt = [41 * Math.SQRT1_2, 41 * Math.SQRT1_2, 10];
      b = AS.rebuild(m, b.cache, { drag: { id: arm, point: [41, 2.5, 10], target: tgt } });
      noErr(b);
      var T = AS.findComponent(m, arm).transform, p = AS.transformPoint(T, [41, 2.5, 10]);
      near(Math.atan2(p[1], p[0]) * 180 / Math.PI, 45, 1e-3, 'the grabbed point turned onto the 45° line');
      near(Math.hypot(p[0] - tgt[0], p[1] - tgt[1], p[2] - tgt[2]), Math.hypot(41, 2.5) - 41, 1e-4, 'as near the target as the hinge allows');
      near(T.position[0], 0, 1e-9, 'still on the hinge (x)'); near(T.position[1], 0, 1e-9, 'still on the hinge (y)');
      near(T.position[2], 0, 1e-9, 'face still coincident');
      assert(b.components[1].dof === 1, 'still 1 DOF, got ' + b.components[1].dof);
    });

    test('Drag: a four-bar linkage follows its crank all the way round (30° steps), coupler and rocker re-solved each step', function () {
      var f = fourBar(), b = AS.rebuild(f.m), rockers = [];
      noErr(b);
      for (var a = 30; a <= 360; a += 30) {
        var th = a * Math.PI / 180;
        b = AS.rebuild(f.m, b.cache, { drag: { id: f.crank, point: [40, 2.5, 0], target: [-50 + 40 * Math.cos(th), 12.5, -40 * Math.sin(th)] } });
        var bad = badMates(b);
        if (bad.length) fail('mates not satisfied at ' + a + '°: ' + bad.join(', '));
        near(wrap(turnY(f.m, f.crank) - a), 0, 1e-3, 'crank angle at ' + a + '°');
        rockers.push(turnY(f.m, f.rocker));
      }
      var lo = Math.min.apply(null, rockers), hi = Math.max.apply(null, rockers);
      assert(hi - lo > 40, 'the rocker rocks (' + lo.toFixed(1) + '..' + hi.toFixed(1) + ')');
      return 'rocker ' + lo.toFixed(1) + '°..' + hi.toFixed(1) + '°';
    });

    test('Drag: a free component just follows the grabbed point (no turn); a fixed one ignores the drag', function () {
      var m = AS.newAssembly(), base = AS.insert(m, { script: 'p.box(50, 50, 5);' }).id;
      var blk = AS.insert(m, { script: 'p.box(10, 10, 10);' }, { position: [80, 0, 0] }).id;
      var b = AS.rebuild(m);
      b = AS.rebuild(m, b.cache, { drag: { id: blk, point: [5, 5, 5], target: [100, 20, -7] } });
      var T = AS.findComponent(m, blk).transform;
      near(T.position[0], 95, 1e-9, 'x'); near(T.position[1], 15, 1e-9, 'y'); near(T.position[2], -12, 1e-9, 'z');
      assert(T.rotation.join() === '1,0,0,0,1,0,0,0,1', 'not turned');
      AS.rebuild(m, b.cache, { drag: { id: base, point: [0, 0, 0], target: [10, 10, 10] } });
      assert(AS.findComponent(m, base).transform.position.join() === '0,0,0', 'fixed base did not move');
    });

    test('Closest alignment can turn over: a roller dropped in reversed (Tangent + Perpendicular, then its end face Coincident aligned) and a slider reversed in its slot (Width, then an aligned Limit Distance) both solve', function () {
      var base = 'p.name("Base"); p.box(160, 120, 10, { centered: true }); p.box(100, 8, 8, { at: [-20, 10, 30] }); p.box(100, 8, 8, { at: [-20, 10, 50] });';
      var m = AS.newAssembly(), b0 = AS.insert(m, { script: base }, { fixed: true }).id;
      var roller = AS.insert(m, { script: 'p.name("Roller"); p.cylinder(5, 40, { axis: "z" });' }, { position: [-60, 30, 0], rotation: [-1, 0, 0, 0, 1, 0, 0, 0, -1] }).id;
      AS.addMate(m, 'tangent', { component: roller, cylinder: [5, 0, 20] }, { component: b0, face: [0, 10, -40] });
      AS.addMate(m, 'perpendicular', { component: roller, cylinder: [5, 0, 20] }, { component: b0, face: [0, 5, 60] });
      AS.addMate(m, 'coincident', { component: roller, face: [0, 0, 40] }, { component: b0, face: [0, 5, 60] }, { alignment: 'aligned' });
      var slider = AS.insert(m, { script: 'p.name("Slider"); p.box(20, 10, 8);' }, { position: [70, 30, 10], rotation: [-1, 0, 0, 0, 1, 0, 0, 0, -1] }).id;
      AS.addMate(m, 'coincident', { component: slider, face: [10, 0, 5] }, { component: b0, face: [0, 10, -40] });
      AS.addMate(m, 'width', { component: b0, face: [30, 14, 38] }, { component: slider, face: [10, 4, 0] }, { a2: { component: b0, face: [30, 14, 50] }, b2: { component: slider, face: [10, 4, 10] } });
      AS.addMate(m, 'limitDistance', { component: slider, face: [0, 4, 5] }, { component: b0, face: [-20, 14, 34] }, { alignment: 'aligned', min: 10, max: 60 });
      var b = AS.rebuild(m);
      noErr(b);
      var R = AS.findComponent(m, roller).transform.rotation;
      near(R[8], 1, 1e-6, 'roller turned so its end face looks along +z');
      return Object.keys(b.mates).length + ' mates ok';
    });

    test('Robustness: the assembly examples (and a four-bar) solve from 8 arbitrary placements of their floating components', function () {
      function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
      function randRot(r) {
        var u1 = r(), u2 = r(), u3 = r(), x = Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2), y = Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2), z = Math.sqrt(u1) * Math.sin(2 * Math.PI * u3), w = Math.sqrt(u1) * Math.cos(2 * Math.PI * u3);
        return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
      }
      var models = (typeof AnvilExamples !== 'undefined' ? AnvilExamples : []).filter(function (e) { return e.kind === 'assembly' && !/Hinged cover/.test(e.name); })
        .map(function (e) { var m = AS.newAssembly(); AS.runScript(m, e.code); return [e.name, m]; }).concat([['four-bar', fourBar().m]]);
      var out = [];
      models.forEach(function (nm) {
        var b0 = AS.rebuild(nm[1]), fails = [];
        for (var s = 1; s <= 8; s++) {
          var r = rnd(s * 7919), m = JSON.parse(JSON.stringify(nm[1]));
          m.components.forEach(function (c) { if (!c.fixed && c.pattern == null) c.transform = { position: [(r() - 0.5) * 200, (r() - 0.5) * 200, (r() - 0.5) * 200], rotation: randRot(r) }; });
          var bad = badMates(AS.rebuild(m, b0.cache));
          if (bad.length) fails.push(s + ':' + bad.join('/'));
        }
        if (fails.length) fail(nm[0] + ': mates failed from start ' + fails.join(', '));
        out.push(nm[0]);
      });
      return out.length + ' assemblies × 8 starts';
    });

    test('Flipped alignment turns the component over: a block on the top (Coincident, then Parallel sides) with the Coincident set Aligned stands upside down on the top plane, every mate ok; Gear has no alignment', function () {
      var m = AS.newAssembly(), base = AS.insert(m, { script: 'p.box(100, 60, 10);' }, { fixed: true }).id;
      var blk = AS.insert(m, { script: 'p.box(20, 20, 20);' }, { position: [40, 30, 20] }).id;
      var c1 = AS.addMate(m, 'coincident', { component: blk, face: [10, 0, 10] }, { component: base, face: [50, 10, 30] });
      AS.addMate(m, 'parallel', { component: blk, face: [0, 10, 10] }, { component: base, face: [0, 5, 30] });
      var b = AS.rebuild(m);
      noErr(b);
      near(AS.findComponent(m, blk).transform.rotation[4], 1, 1e-9, 'upright first');
      assert(AS.hasAlignment(c1) && !AS.hasAlignment({ type: 'gear' }), 'hasAlignment');
      c1.alignment = 'aligned';
      b = AS.rebuild(m, b.cache);
      noErr(b);
      var T = AS.findComponent(m, blk).transform;
      near(T.rotation[4], -1, 1e-9, 'upside down');
      near(T.position[1], 10, 1e-9, 'its bottom face on the top plane');
    });

    test('Drag inside a Flexible sub-assembly: the Hinged cover without its Angle mate, Hinge<2>\'s Arm (id "S/k") pulled down swings about its hinge; Hinge<2> itself stays, flexState keeps the turn', function () {
      var ex = (typeof AnvilExamples !== 'undefined' ? AnvilExamples : []).filter(function (e) { return e.name === 'Hinged cover (sub-assemblies)'; })[0];
      if (!ex) return 'example missing: skipped';
      var m = AS.newAssembly();
      AS.runScript(m, ex.code);
      m.mates = m.mates.filter(function (x) { return x.type !== 'angle'; });
      var b = AS.rebuild(m);
      noErr(b);
      var h2 = AS.findComponent(m, 'Hinge<2>'), sm = b.partBuilds[h2.id].model, arm = AS.findComponent(sm, 'Arm<1>');
      var p0 = h2.transform.position.slice();
      // the arm's far end (local [41, 2.5, 10]) pulled to 30° below the hinge line, on the +x side
      var L = Math.hypot(41, 2.5), tgt = AS.transformPoint(h2.transform, [L * Math.cos(-Math.PI / 6), L * Math.sin(-Math.PI / 6), 10]);
      b = AS.rebuild(m, b.cache, { drag: { id: h2.id + '/' + arm.id, point: [41, 2.5, 10], target: tgt } });
      noErr(b);
      var k = AS.findComponent(b.partBuilds[h2.id].model, 'Arm<1>'), Tk = { position: k.transform.position, rotation: k.transform.rotation };
      var w = AS.transformPoint(h2.transform, AS.transformPoint(Tk, [41, 2.5, 10]));
      near(Math.hypot(w[0] - tgt[0], w[1] - tgt[1], w[2] - tgt[2]), 0, 1e-4, 'the arm end reached the pull');
      near(Math.hypot(h2.transform.position[0] - p0[0], h2.transform.position[1] - p0[1], h2.transform.position[2] - p0[2]), 0, 1e-6, 'Hinge<2> did not move');
      assert(h2.flexState && h2.flexState[arm.id], 'flexState stored');
      assert(badMates(b).length === 0, 'mates ok');
    });

    test('A real conflict is still rejected: a block Coincident on the top face, then Coincident on a face 10 higher', function () {
      var m = AS.newAssembly(), base = AS.insert(m, { script: 'p.box(100, 60, 10); p.box(20, 20, 10, { at: [0, 10, 0] });' }, { fixed: true }).id;
      var blk = AS.insert(m, { script: 'p.box(10, 10, 10);' }, { position: [50, 30, 20], rotation: [1, 0, 0, 0, -1, 0, 0, 0, -1] }).id;
      var m1 = AS.addMate(m, 'coincident', { component: blk, face: [5, 0, 5] }, { component: base, face: [50, 10, 30] });
      var m2 = AS.addMate(m, 'coincident', { component: blk, face: [5, 0, 5] }, { component: base, face: [10, 20, 10] });
      var b = AS.rebuild(m);
      assert(b.mates[m1.id].ok, 'first mate ok');
      assert(!b.mates[m2.id].ok && /over-defined|conflicting/.test(b.mates[m2.id].error), 'second mate reported: ' + JSON.stringify(b.mates[m2.id]));
      assert(b.components[1].overDefined && b.components[1].overMate === m2.name && !b.components[0].overDefined, 'the block is over defined (SolidWorks "(+)"), the fixed base is not');
    });
  })();
  // --- end refine/assembly ---
