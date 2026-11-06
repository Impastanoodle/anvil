  // --- rfKA (2026-11-06, lane asmmates3) --- SolidWorks 2024 Mechanical Mates Screw and Rack Pinion: a nut on a bolt
  // (Screw, pitch 1.5 per revolution: dragged one revolution round it travels exactly one pitch; pulled along the axis
  // it turns; Reverse the other way; Revolutions/mm), a rack on a pinion (Rack Pinion, pitch diameter 20: one pinion
  // revolution moves the rack pi * 20, a rack drag of a quarter of that turns the pinion 90 degrees), the refusals, the
  // Mechanical Mates order and the script / JSON round trips.
  (function () {
    group('rfKA: Screw and Rack Pinion mates');
    if (typeof Assembly === 'undefined') { test('assembly.js loads', function () { fail('Assembly is not defined'); }); return; }
    var AS = Assembly;
    function noErr(b) { var ids = Object.keys(b.errors); if (ids.length) fail('assembly errors: ' + ids.map(function (id) { return id + ': ' + b.errors[id]; }).join(' | ')); }
    function st(b, id) { return b.components.filter(function (c) { return c.id === id; })[0]; }
    function T(m, id) { return AS.findComponent(m, id).transform; }
    function turnY(m, id) { var R = T(m, id).rotation; return Math.atan2(R[2], R[0]) * 180 / Math.PI; }   // the turn about y (rotation [c 0 s; 0 1 0; -s 0 c])
    function rt(m) { var m2 = AS.newAssembly(); AS.runScript(m2, AS.generateScript(m)); m2 = JSON.parse(JSON.stringify(m2)); noErr(AS.rebuild(m2)); return m2; }
    function drag(m, b, id, local, target) { var r = AS.rebuild(m, b.cache, { drag: { id: id, point: local, target: target } }); noErr(r); return r; }
    function rimAt(R, deg, y) { var a = deg * Math.PI / 180; return [R * Math.cos(a), y, -R * Math.sin(a)]; }   // a point turned deg about +y

    // ---- Screw: a 10 dia bolt (axis y, fixed) and a nut (18 dia, 8 long) on it, pitch 1.5 per revolution
    var BOLT = 'p.name("Bolt"); p.cylinder(5, 60);', NUT = 'p.name("Nut"); p.cylinder(9, 8);';
    function screw(opts) {
      var m = AS.newAssembly();
      var bolt = AS.insert(m, { script: BOLT }, { fixed: true }).id;
      var nut = AS.insert(m, { script: NUT }, { position: [0.4, 20, -0.3] }).id;
      var mt = AS.addMate(m, 'screw', { component: bolt, cylinder: [5, 30, 0] }, { component: nut, cylinder: [9, 4, 0] }, opts || { pitch: 1.5 });
      var b = AS.rebuild(m);
      noErr(b);
      return { m: m, b: b, nut: nut, mt: mt };
    }
    // turn the nut by `deg` (30 degrees a frame, as a mouse drag) pulling its rim; lift(deg) is where the helix puts it
    function turnNut(s, deg, lift) {
      var y0 = T(s.m, s.nut).position[1], a0 = turnY(s.m, s.nut), n = Math.ceil(Math.abs(deg) / 30);
      for (var i = 1; i <= n; i++) s.b = drag(s.m, s.b, s.nut, [9, 4, 0], rimAt(9, a0 + deg * i / n, y0 + 4 + lift(deg * i / n)));
    }
    test('rfKA: Screw: the nut goes concentric with the bolt where it stands (1 DOF left), the mate is Screw1 and keeps its pitch', function () {
      var s = screw();
      var p = T(s.m, s.nut).position;
      near(p[0], 0, 1e-9, 'on the axis x'); near(p[2], 0, 1e-9, 'on the axis z'); near(p[1], 20, 1e-9, 'not moved along');
      assert(s.mt.name === 'Screw1' && s.mt.pitch === 1.5 && s.mt.phase && s.mt.phase.length === 2, JSON.stringify(s.mt));
      assert(st(s.b, s.nut).dof === 1, 'dof ' + st(s.b, s.nut).dof);
      assert(AS.hasAlignment(s.mt) && AS.defaultAlignment(s.mt) === 'closest', 'Screw has an alignment (closest)');
    });
    test('rfKA: Screw: dragging the nut one revolution round the bolt moves it exactly one pitch (1.5) along; back again returns it', function () {
      var s = screw();
      // which way it climbs: a first small tangential pull tells
      s.b = drag(s.m, s.b, s.nut, [9, 4, 0], rimAt(9, 10, 24));
      var sg = (T(s.m, s.nut).position[1] - 20) / (turnY(s.m, s.nut) / 360 * 1.5);
      near(Math.abs(sg), 1, 1e-6, 'travel = pitch x turn / 360 on a part turn');
      sg = sg > 0 ? 1 : -1;
      var a0 = turnY(s.m, s.nut), y0 = T(s.m, s.nut).position[1];
      turnNut(s, 360, function (d) { return sg * 1.5 * d / 360; });
      near(T(s.m, s.nut).position[1] - y0, sg * 1.5, 1e-6, 'one revolution = one pitch');
      near(turnY(s.m, s.nut), a0, 1e-5, 'a whole turn round');
      var p = T(s.m, s.nut).position;
      near(p[0], 0, 1e-7, 'still on the axis'); near(p[2], 0, 1e-7, 'still on the axis');
      turnNut(s, -360, function (d) { return sg * 1.5 * d / 360; });
      near(T(s.m, s.nut).position[1], y0, 1e-6, 'and back');
    });
    test('rfKA: Screw: pulling the nut along the bolt 1.25 pitch turns it a quarter turn past one revolution; Reverse turns it the other way', function () {
      function pull(opts) {
        var s = screw(opts), sgn;
        s.b = drag(s.m, s.b, s.nut, [9, 4, 0], rimAt(9, 10, 24));   // the climbing sense
        sgn = (T(s.m, s.nut).position[1] - 20) / turnY(s.m, s.nut) > 0 ? 1 : -1;
        var a0 = turnY(s.m, s.nut), y0 = T(s.m, s.nut).position[1];
        for (var i = 1; i <= 10; i++) s.b = drag(s.m, s.b, s.nut, [0, 4, 0], [0, y0 + 4 + 1.875 * i / 10, 0]);   // the axis point, up 1.875 in ten frames
        near(T(s.m, s.nut).position[1] - y0, 1.875, 1e-6, 'pulled 1.25 pitch');
        var d = turnY(s.m, s.nut) - a0; d = ((d % 360) + 540) % 360 - 180;
        near(d, sgn * 90, 1e-4, 'turned 450 = 90 degrees');
        return sgn;
      }
      var fwd = pull({ pitch: 1.5 }), rev = pull({ pitch: 1.5, flip: true });
      assert(fwd === -rev, 'Reverse climbs the other way');
    });
    test('rfKA: Screw: Revolutions/mm 2 is a 0.5 pitch; script and JSON round trips keep pitch, pitchBy, Reverse and the phase', function () {
      var s = screw({ revolutions: 2, flip: true });
      assert(s.mt.pitch === 0.5 && s.mt.pitchBy === 'revolutions' && s.mt.flip === true, JSON.stringify(s.mt));
      var sc = AS.generateScript(s.m);
      assert(/a\.mate\("screw"/.test(sc) && /pitch: 0\.5/.test(sc) && /pitchBy: "revolutions"/.test(sc), sc);
      var m2 = rt(s.m), x = m2.mates[0];
      assert(x.type === 'screw' && x.pitch === 0.5 && x.pitchBy === 'revolutions' && x.flip === true && x.phase.length === 2, JSON.stringify(x));
      near(m2.components[1].transform.position[1], 20, 1e-5, 'holds its place after the round trip');
      assert(AS.isAssemblyScript('a.screw(b, n, 1.5);') && AS.isAssemblyScript('a.rackPinion(r, p, 62.8);'), 'script calls');
      var m3 = AS.newAssembly();
      AS.runScript(m3, 'var b = a.insert({ script: ' + JSON.stringify(BOLT) + ' }, { fixed: true }); var n = a.insert({ script: ' + JSON.stringify(NUT) + ' }, { position: [0, 20, 0] });' +
        ' a.screw({ component: b, cylinder: [5, 30, 0] }, { component: n, cylinder: [9, 4, 0] }, 1.25);');
      assert(m3.mates[0].type === 'screw' && m3.mates[0].pitch === 1.25, JSON.stringify(m3.mates[0]));
      noErr(AS.rebuild(m3));
    });
    test('rfKA: Screw refuses a planar face and a zero pitch in plain words', function () {
      var m = AS.newAssembly(), bolt = AS.insert(m, { script: BOLT }, { fixed: true }).id, nut = AS.insert(m, { script: NUT }, { position: [0, 20, 0] }).id;
      var a = AS.addMate(m, 'screw', { component: bolt, cylinder: [5, 30, 0] }, { component: nut, face: [3, 8, 3] }, { pitch: 1 });
      var c = AS.addMate(m, 'screw', { component: bolt, cylinder: [5, 30, 0] }, { component: nut, cylinder: [9, 4, 0] }, { pitch: 0 });
      var r = AS.rebuild(m);
      assert(/Screw needs two cylindrical faces or axes/.test(r.errors[a.id] || ''), JSON.stringify(r.errors));
      assert(/pitch must be a number > 0/.test(r.errors[c.id] || ''), JSON.stringify(r.errors));
    });

    // ---- Rack Pinion: a pinion (20 pitch dia, axis y, turning on the assembly's Y axis) and a 200 long rack held to slide
    // along x, its back face on the pitch line z 10
    var PINION = 'p.name("Pinion"); p.cylinder(10, 5);', RACK = 'p.name("Rack"); p.box(200, 10, 10);';
    function rack(opts) {
      var m = AS.newAssembly();
      AS.insert(m, { script: 'p.name("Frame"); p.box(20, 20, 20);' }, { fixed: true, position: [0, -60, 0] });   // (the first component is fixed)
      var pin = AS.insert(m, { script: PINION }, { position: [0, 0, 0], rotation: [Math.cos(0.3), 0, Math.sin(0.3), 0, 1, 0, -Math.sin(0.3), 0, Math.cos(0.3)] }).id;
      var rk = AS.insert(m, { script: RACK }, { position: [-100, -10, 10] }).id;
      AS.addMate(m, 'concentric', { axis: 'y' }, { component: pin, cylinder: [10, 2.5, 0] });
      AS.addMate(m, 'coincident', { plane: 'Top' }, { component: pin, face: [3, 0, 3] }, { alignment: 'anti-aligned' });
      AS.addMate(m, 'coincident', { plane: 'Top' }, { component: rk, face: [100, 10, 5] });
      AS.addMate(m, 'coincident', { plane: 'Front' }, { component: rk, face: [100, 5, 0] }, { offset: 10, alignment: 'anti-aligned' });
      var mt = AS.addMate(m, 'rackpinion', { component: rk, edge: [[0, 10, 0], [200, 10, 0]] }, { component: pin, cylinder: [10, 2.5, 0] }, opts || { diameter: 20 });
      var b = AS.rebuild(m);
      noErr(b);
      return { m: m, b: b, pin: pin, rk: rk, mt: mt };
    }
    test('rfKA: Rack Pinion: pitch diameter 20 is a rack travel of pi * 20 per revolution; the rack and pinion keep their places; 1 DOF each (coupled)', function () {
      var s = rack();
      assert(s.mt.name === 'RackPinion1' && s.mt.pitchBy === 'diameter' && Math.abs(s.mt.pitch - Math.PI * 20) < 1e-12, JSON.stringify(s.mt));
      var p = T(s.m, s.rk).position;
      near(p[0], -100, 1e-9, 'rack x'); near(p[1], -10, 1e-9, 'rack y'); near(p[2], 10, 1e-9, 'rack z');
      near(turnY(s.m, s.pin), 0.3 * 180 / Math.PI, 1e-7, 'pinion keeps its turn');
      assert(st(s.b, s.rk).dof === 1 && st(s.b, s.pin).dof === 1, 'dof ' + st(s.b, s.rk).dof + ' / ' + st(s.b, s.pin).dof);
      assert(!AS.hasAlignment(s.mt), 'no alignment, as Gear');
    });
    test('rfKA: Rack Pinion: dragging the rack a quarter of pi * 20 turns the pinion 90 degrees; one pinion revolution moves the rack pi * 20', function () {
      var s = rack(), a0 = turnY(s.m, s.pin), q = Math.PI * 20 / 4;
      for (var i = 1; i <= 5; i++) s.b = drag(s.m, s.b, s.rk, [100, 5, 5], [q * i / 5, -5, 15]);
      near(T(s.m, s.rk).position[0], -100 + q, 1e-7, 'rack dragged');
      var d = turnY(s.m, s.pin) - a0, sg = d > 0 ? 1 : -1;
      near(Math.abs(d), 90, 1e-5, 'pinion turned a quarter');
      // now turn the pinion back a whole revolution by its rim: the rack goes pi * 20 the other way
      var x0 = T(s.m, s.rk).position[0], b0 = turnY(s.m, s.pin);
      for (var k = 1; k <= 12; k++) s.b = drag(s.m, s.b, s.pin, [10, 5, 0], rimAt(10, b0 - sg * 30 * k, 5));
      near(T(s.m, s.rk).position[0] - x0, -Math.PI * 20, 1e-6, 'one revolution = pi * 20 of rack travel');
      near(turnY(s.m, s.pin), b0, 1e-5, 'a whole turn round');
      var p = T(s.m, s.rk).position;
      near(p[1], -10, 1e-7, 'rack still on its line'); near(p[2], 10, 1e-7, 'rack still on its line');
    });
    test('rfKA: Rack Pinion: Reverse turns the pinion the other way; Rack travel/revolution 50 round-trips (script and JSON) with its edge reference', function () {
      function quarter(opts) {
        var s = rack(opts), a0 = turnY(s.m, s.pin);
        for (var i = 1; i <= 5; i++) s.b = drag(s.m, s.b, s.rk, [100, 5, 5], [10 * i / 5, -5, 15]);
        return { s: s, d: turnY(s.m, s.pin) - a0 };
      }
      var f = quarter({ pitch: 50 }), r = quarter({ pitch: 50, flip: true });
      near(Math.abs(f.d), 72, 1e-5, '10 of 50 per revolution = 72 degrees');
      near(r.d, -f.d, 1e-5, 'Reverse');
      var m2 = rt(r.s.m), x = m2.mates[4];
      assert(x.type === 'rackpinion' && x.pitch === 50 && x.flip === true && !x.pitchBy && x.a.edge && x.a.edge[1][0] === 200 && x.phase.length === 2, JSON.stringify(x));
      near(m2.components[2].transform.position[0], -90, 1e-5, 'rack holds its place after the round trip');
      near(turnY(m2, m2.components[1].id), turnY(r.s.m, r.s.pin), 1e-4, 'pinion holds its turn');
      var sc = AS.generateScript(rack().m);
      assert(/edge: \[\[0, 10, 0\], \[200, 10, 0\]\]/.test(sc) && /pitchBy: "diameter"/.test(sc), sc);
    });
    test('rfKA: Rack Pinion refuses an edge as the pinion and a planar face as the rack; Mechanical Mates in SolidWorks 2024 order', function () {
      var m = AS.newAssembly(), pin = AS.insert(m, { script: PINION }, { fixed: true }).id, rk = AS.insert(m, { script: RACK }, { position: [-100, -10, 10] }).id;
      var a = AS.addMate(m, 'rackpinion', { component: pin, cylinder: [10, 2.5, 0] }, { component: rk, edge: [[0, 10, 0], [200, 10, 0]] }, { pitch: 10 });
      var c = AS.addMate(m, 'rackpinion', { component: rk, face: [100, 10, 5] }, { component: pin, cylinder: [10, 2.5, 0] }, { pitch: 10 });
      var r = AS.rebuild(m);
      assert(/the pinion must be a cylindrical face or axis/.test(r.errors[a.id] || ''), JSON.stringify(r.errors));
      assert(/Rack Pinion needs a linear edge/.test(r.errors[c.id] || ''), JSON.stringify(r.errors));
      assert(AS.MATE_GROUPS.mechanical.join() === 'slot,hinge,gear,rackpinion,screw', AS.MATE_GROUPS.mechanical.join());
      assert(AS.MATE_NAMES.screw === 'Screw' && AS.MATE_NAMES.rackpinion === 'RackPinion', 'names');
    });
  })();
