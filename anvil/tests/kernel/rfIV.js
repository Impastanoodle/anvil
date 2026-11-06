  // --- rfIV (2026-11-05, lane asmmates) --- Assembly mates and collisions, SolidWorks 2024 behaviour: a pin in a 2 in
  // straight slot (Free drags along and stops at the ends, Distance Along Slot 0.5 holds it against a drag), a Hinge whose
  // angle limit stops a drag at the angles, a Linear/Linear Coupler with ratio 1 : 2 (the second part moves twice as far,
  // Reverse the other way), Collision Detection stopping a dragged block against a wall within a drag step, and the
  // script / JSON round trips keeping every mate.
  (function () {
    group('rfIV: Slot / Hinge drags, Linear/Linear Coupler, Collision Detection');
    if (typeof Assembly === 'undefined') { test('assembly.js loads', function () { fail('Assembly is not defined'); }); return; }
    var AS = Assembly;
    function noErr(b) { var ids = Object.keys(b.errors); if (ids.length) fail('assembly errors: ' + ids.map(function (id) { return id + ': ' + b.errors[id]; }).join(' | ')); }
    function st(b, id) { return b.components.filter(function (c) { return c.id === id; })[0]; }
    function pos(m, id) { return AS.findComponent(m, id).transform.position; }
    function rt(m) {   // script round trip, then the JSON round trip
      var m2 = AS.newAssembly();
      AS.runScript(m2, AS.generateScript(m));
      m2 = JSON.parse(JSON.stringify(m2));
      noErr(AS.rebuild(m2));
      return m2;
    }
    // drag: the grabbed local point of component id pulled to a world target (Move Component's free drag), then released
    function drag(m, b, id, local, target) {
      var r = AS.rebuild(m, b.cache, { drag: { id: id, point: local, target: target } });
      noErr(r);
      return r;
    }

    // ---- Slot, inches: a 6 x 3 x 1/4 plate with a 1/2 wide slot, centres 2 in apart (x 2 .. 4, z 1.5), a 1/2 pin
    var PLATE = 'p.units("in"); p.name("SlotPlate"); p.box(6, 3, 0.25); p.sketch("Top", 0.25).slot(2, -1.5, 4, -1.5, 0.5).cut("through");';
    var PIN = 'p.units("in"); p.name("Pin"); p.cylinder(0.25, 1);';
    function slot(constraint, extra) {
      var m = AS.newAssembly(); m.units = 'in';
      var plate = AS.insert(m, { script: PLATE }, { fixed: true }).id;
      var pin = AS.insert(m, { script: PIN }, { position: [3, -0.2, 1.6] }).id;
      var o = extra || {};
      o.constraint = constraint;
      // the end arc round x = 4 is the picked end: along-slot runs from x 4 towards x 2
      var mt = AS.addMate(m, 'slot', { component: plate, cylinder: [4.25, 0.1, 1.5] }, { component: pin, cylinder: [0.25, 0.5, 0] }, o);
      var b = AS.rebuild(m);
      noErr(b);
      return { m: m, b: b, pin: pin, mt: mt };
    }
    test('rfIV: Slot Free, 2 in slot: dragging the pin along moves it there; past the end it stops on the end arc centre', function () {
      var s = slot('free');
      near(pos(s.m, s.pin)[0], 3, 1e-7, 'x kept');
      near(pos(s.m, s.pin)[2], 1.5, 1e-7, 'on the centre line');
      assert(st(s.b, s.pin).dof === 3, 'dof ' + st(s.b, s.pin).dof);
      var b = drag(s.m, s.b, s.pin, [0, 0.5, 0], [2.5, 0.3, 1.9]);
      near(pos(s.m, s.pin)[0], 2.5, 1e-6, 'dragged along to x 2.5');
      near(pos(s.m, s.pin)[2], 1.5, 1e-7, 'still on the centre line (the pull across the slot is refused)');
      drag(s.m, b, s.pin, [0, 0.5, 0], [0.5, 0.3, 1.5]);
      near(pos(s.m, s.pin)[0], 2, 1e-6, 'stopped at the x 2 end');
      drag(s.m, b, s.pin, [0, 0.5, 0], [5.5, 0.3, 1.5]);
      near(pos(s.m, s.pin)[0], 4, 1e-6, 'stopped at the x 4 end');
    });
    test('rfIV: Slot Distance Along Slot 0.5 holds the pin 0.5 from the picked end against a drag; 2 DOF left', function () {
      var s = slot('distance', { distance: 0.5 });
      near(pos(s.m, s.pin)[0], 3.5, 1e-7, 'x 4 - 0.5');
      assert(st(s.b, s.pin).dof === 2, 'dof ' + st(s.b, s.pin).dof);
      drag(s.m, s.b, s.pin, [0, 0.5, 0], [2.5, 0.3, 1.5]);
      near(pos(s.m, s.pin)[0], 3.5, 1e-7, 'held at 3.5');
      near(pos(s.m, s.pin)[1], 0.3 - 0.5, 1e-6, 'free along the pin');
      var m2 = rt(s.m);
      assert(m2.mates[0].type === 'slot' && m2.mates[0].constraint === 'distance' && m2.mates[0].distance === 0.5, JSON.stringify(m2.mates[0]));
      near(m2.components[1].transform.position[0], 3.5, 1e-6, 'x after the round trip');
    });

    // ---- Arc slot, inches: centre (3, z 3), centre-line radius 2, 0° .. 90° in the Top sketch (counter-clockwise from
    // (5, z 3) to (3, z 1)), 1/2 wide: the end at 0° is picked, so along-slot runs from it, π in long
    var ARC = 'p.units("in"); p.name("ArcPlate"); p.box(6, 6, 0.25); p.sketch("Top", 0.25).arcSlot(3, -3, 2, 0, 90, 0.5).cut("through");';
    function arcSlot(constraint, extra, at) {
      var m = AS.newAssembly(); m.units = 'in';
      var plate = AS.insert(m, { script: ARC }, { fixed: true }).id;
      var pin = AS.insert(m, { script: PIN }, { position: at || [4.6, -0.2, 2.0] }).id;
      var o = extra || {};
      o.constraint = constraint;
      var mt = AS.addMate(m, 'slot', { component: plate, cylinder: [5.25, 0.1, 3] }, { component: pin, cylinder: [0.25, 0.5, 0] }, o);
      var b = AS.rebuild(m);
      noErr(b);
      return { m: m, b: b, pin: pin, mt: mt };
    }
    function arcAt(deg) { var a = deg * Math.PI / 180; return [3 + 2 * Math.cos(a), 3 - 2 * Math.sin(a)]; }
    test('rfIV: Slot in an arc slot: Center in Slot puts the pin at 45° on the centre-line arc, Distance Along Slot 1 at 1/2 rad, Percent 25 at 22.5°; 2 DOF', function () {
      var c = arcSlot('center'), w = arcAt(45);
      near(pos(c.m, c.pin)[0], w[0], 1e-6, 'x'); near(pos(c.m, c.pin)[2], w[1], 1e-6, 'z');
      assert(st(c.b, c.pin).dof === 2, 'dof ' + st(c.b, c.pin).dof);
      var d = arcSlot('distance', { distance: 1 }), wd = arcAt(0.5 * 180 / Math.PI);
      near(pos(d.m, d.pin)[0], wd[0], 1e-6, 'x at 1 in along'); near(pos(d.m, d.pin)[2], wd[1], 1e-6, 'z at 1 in along');
      var f = arcSlot('distance', { distance: 1, flip: true }), wf = arcAt(90 - 0.5 * 180 / Math.PI);
      near(pos(f.m, f.pin)[0], wf[0], 1e-6, 'Flip: 1 in from the other end');
      var p = arcSlot('percent', { percent: 25 }), wp = arcAt(22.5);
      near(pos(p.m, p.pin)[0], wp[0], 1e-6, 'x at 25 %'); near(pos(p.m, p.pin)[2], wp[1], 1e-6, 'z at 25 %');
    });
    test('rfIV: Slot in an arc slot, Free: the pin keeps its angle on the arc, a drag takes it round, the ends stop it; 3 DOF; a wall face selects the slot too; round trip', function () {
      var s = arcSlot('free'), a0 = Math.atan2(1, 1.6) * 180 / Math.PI, w = arcAt(a0);
      near(pos(s.m, s.pin)[0], w[0], 1e-6, 'x on the arc at its angle'); near(pos(s.m, s.pin)[2], w[1], 1e-6, 'z');
      assert(st(s.b, s.pin).dof === 3, 'dof ' + st(s.b, s.pin).dof);
      var t = arcAt(70), b = drag(s.m, s.b, s.pin, [0, 0.5, 0], [t[0], 0.3, t[1]]);
      near(pos(s.m, s.pin)[0], t[0], 1e-5, 'dragged round to 70°'); near(pos(s.m, s.pin)[2], t[1], 1e-5, 'z at 70°');
      drag(s.m, b, s.pin, [0, 0.5, 0], [1.5, 0.3, 0.2]);
      near(pos(s.m, s.pin)[0], 3, 1e-5, 'stopped at the 90° end'); near(pos(s.m, s.pin)[2], 1, 1e-5, 'z at the 90° end');
      var m = AS.newAssembly(); m.units = 'in';
      var plate = AS.insert(m, { script: ARC }, { fixed: true }).id, pin = AS.insert(m, { script: PIN }, { position: [4, 0, 1] }).id;
      // the outer wall at 45°: radius 2.25
      var q = [3 + 2.25 * Math.SQRT1_2, 0.1, 3 - 2.25 * Math.SQRT1_2];
      var mt = AS.addMate(m, 'slot', { component: plate, face: q }, { component: pin, cylinder: [0.25, 0.5, 0] }, { constraint: 'center' });
      noErr(AS.rebuild(m));
      var wc = arcAt(45);
      near(m.components[1].transform.position[0], wc[0], 1e-6, 'a wall selects the arc slot: centred');
      var m2 = rt(m);
      near(m2.components[1].transform.position[2], wc[1], 1e-6, 'after the round trip');
      assert(m2.mates[0].type === 'slot' && mt.face == null, JSON.stringify(m2.mates[0]));
    });

    // ---- Hinge: the rfGV post and door, the angle limit 0 .. 30
    var POST = 'p.name("Post"); p.box(40, 40, 20); p.cylinder(3, 60, { at: [20, 0, 20] });';
    var DOOR = 'p.name("Door"); p.box(60, 10, 4); p.cylinder(3, 4, { at: [5, 0, 5], cut: true });';
    function ry(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
    function doorAngle(m, id) { var R = AS.findComponent(m, id).transform.rotation; return Math.atan2(R[2], R[0]) * 180 / Math.PI; }
    test('rfIV: Hinge with Define angle limit 0 .. 30: a drag of the door towards 80 stops at 30, towards -60 at 0; round trip keeps the limit', function () {
      var m = AS.newAssembly();
      var post = AS.insert(m, { script: POST }, { fixed: true }).id;
      var door = AS.insert(m, { script: DOOR }, { position: [30, 90, 20], rotation: ry(10) }).id;
      AS.addMate(m, 'hinge', { component: post, cylinder: [23, 40, 20] }, { component: door, cylinder: [8, 2, 5] },
        { a2: { component: post, face: [5, 20, 5] }, b2: { component: door, face: [30, 0, 8] }, limit: true, min: 0, max: 30,
          a3: { component: post, face: [40, 10, 20] }, b3: { component: door, face: [60, 2, 5] } });
      var b = AS.rebuild(m);
      noErr(b);
      near(doorAngle(m, door), 10, 1e-6, 'starts at 10');
      function swing(deg) {   // pull the door's far end round the pin to `deg`, 10° a frame as a mouse drag does
        var T = AS.findComponent(m, door).transform, p = AS.transformPoint(T, [55, 2, 5]), r = Math.hypot(p[0] - 20, p[2] - 20);
        var from = doorAngle(m, door), n = Math.max(1, Math.ceil(Math.abs(deg - from) / 10));
        for (var i = 1; i <= n; i++) {
          var a = (from + (deg - from) * i / n) * Math.PI / 180;
          b = drag(m, b, door, [55, 2, 5], [20 + r * Math.cos(-a), p[1], 20 + r * Math.sin(-a)]);
        }
      }
      // the door's far end (local +x) at angle θ about y lies at (cos θ, -sin θ) in x, z
      swing(20);
      near(doorAngle(m, door), 20, 1e-4, 'inside the range it follows');
      swing(80);
      near(doorAngle(m, door), 30, 1e-5, 'stopped at the 30 maximum');
      swing(-60);
      near(doorAngle(m, door), 0, 1e-5, 'stopped at the 0 minimum');
      assert(st(b, door).dof === 1, 'dof ' + st(b, door).dof);
      var m2 = rt(m);
      assert(m2.mates[0].type === 'hinge' && m2.mates[0].limit === true && m2.mates[0].max === 30 && m2.mates[0].a3 && m2.mates[0].b3, JSON.stringify(m2.mates[0]));
      near(doorAngle(m2, m2.components[1].id), 0, 1e-5, 'angle after the round trip');
    });

    // ---- Linear/Linear Coupler: two blocks on a base, each held to slide along x only (Front and Top planes coincident
    // with the base's, the second 40 behind); the coupler between their Right planes, ratio 1 : 2
    var BASE = 'p.name("Base"); p.box(200, 100, 10);', BLOCK = 'p.name("Block"); p.box(20, 20, 20);';
    function coupler(opts, ratio) {
      var m = AS.newAssembly();
      var base = AS.insert(m, { script: BASE }, { fixed: true }).id;
      var a = AS.insert(m, { script: BLOCK }, { position: [20, 30, 5] }).id;
      var c = AS.insert(m, { script: BLOCK }, { position: [60, 12, 33] }).id;
      [[a, 0], [c, 40]].forEach(function (x) {
        AS.addMate(m, 'coincident', { component: base, plane: 'Front' }, { component: x[0], plane: 'Front' }, x[1] ? { alignment: 'aligned', offset: x[1] } : { alignment: 'aligned' });
        AS.addMate(m, 'coincident', { component: base, plane: 'Top' }, { component: x[0], plane: 'Top' }, { alignment: 'aligned', offset: 10 });
      });
      var b0 = AS.rebuild(m);
      noErr(b0);
      var o = opts || {};
      o.ratio = ratio == null ? 2 : ratio;
      var mt = AS.addMate(m, 'linearcoupler', { component: a, plane: 'Right' }, { component: c, plane: 'Right' }, o);
      var b = AS.rebuild(m);
      noErr(b);
      return { m: m, b: b, a: a, c: c, mt: mt };
    }
    test('rfIV: Linear/Linear Coupler 1 : 2: moving the first block 5 moves the second 10, a drag of 12 moves it 24; 1 DOF each', function () {
      var s = coupler();
      assert(s.mt.name === 'LinearCoupler1' && s.mt.ratio[0] === 1 && s.mt.ratio[1] === 2, JSON.stringify(s.mt));
      assert(s.mt.phase && s.mt.phase.length === 2, 'phase stored: ' + JSON.stringify(s.mt.phase));
      near(pos(s.m, s.a)[0], 20, 1e-7, 'first block stays'); near(pos(s.m, s.c)[0], 60, 1e-7, 'second block stays');
      assert(st(s.b, s.a).dof === 1 && st(s.b, s.c).dof === 1, 'dof ' + st(s.b, s.a).dof + ' ' + st(s.b, s.c).dof);
      AS.moveComponent(s.m, s.a, [5, 0, 0]);
      var b = AS.rebuild(s.m, s.b.cache);
      noErr(b);
      near(pos(s.m, s.a)[0], 25, 1e-6, 'first block moved 5');
      near(pos(s.m, s.c)[0], 70, 1e-6, 'second block moved 10');
      drag(s.m, b, s.a, [10, 10, 10], [25 + 10 + 12, 50, 30]);
      near(pos(s.m, s.a)[0], 37, 1e-5, 'first block dragged 12');
      near(pos(s.m, s.c)[0], 94, 1e-5, 'second block 24');
      near(pos(s.m, s.c)[2], 40, 1e-7, 'second block still on its rail');
    });
    test('rfIV: Linear/Linear Coupler Reverse: the second block moves the other way; a ratio as a number means 1 : r; round trips keep ratio, Reverse and phase', function () {
      var s = coupler({ flip: true }, 3);
      assert(s.mt.ratio[0] === 1 && s.mt.ratio[1] === 3 && s.mt.flip === true, JSON.stringify(s.mt));
      AS.moveComponent(s.m, s.a, [2, 0, 0]);
      noErr(AS.rebuild(s.m, s.b.cache));
      near(pos(s.m, s.c)[0], 54, 1e-6, 'second block -6');
      var m2 = rt(s.m);
      var x = m2.mates.filter(function (q) { return q.type === 'linearcoupler'; })[0];
      assert(x && x.ratio[1] === 3 && x.flip === true && x.phase && Math.abs(x.phase[0] - s.mt.phase[0]) < 1e-6, JSON.stringify(x));
      near(m2.components[2].transform.position[0], 54, 1e-6, 'second block after the round trip');
      AS.moveComponent(m2, m2.components[1].id, [-2, 0, 0]);
      noErr(AS.rebuild(m2));
      near(m2.components[2].transform.position[0], 60, 1e-6, 'the reopened coupler still drives: back to 60');
      var sc = AS.generateScript(s.m);
      assert(/a\.mate\("linearcoupler"/.test(sc) && AS.isAssemblyScript('a.linearCoupler(x, y, 2);'), sc);
      var m3 = AS.newAssembly();
      AS.runScript(m3, 'var b = a.insert({ script: ' + JSON.stringify(BLOCK) + ' }, { fixed: true }); var c = a.insert({ script: ' + JSON.stringify(BLOCK) + ' }, { position: [50, 0, 0] });' +
        'var d = a.insert({ script: ' + JSON.stringify(BLOCK) + ' }, { position: [0, 50, 0] }); a.linearCoupler({ component: c, plane: "Right" }, { component: d, plane: "Top" }, 2);');
      assert(m3.mates[0].type === 'linearcoupler' && m3.mates[0].ratio.join() === '1,2', JSON.stringify(m3.mates[0]));
    });
    test('rfIV: Linear/Linear Coupler errors in plain words: both directions on one component, a ratio of 0', function () {
      var m = AS.newAssembly();
      var a = AS.insert(m, { script: BLOCK }, { fixed: true }).id, c = AS.insert(m, { script: BLOCK }, { position: [50, 0, 0] }).id;
      var bad = AS.addMate(m, 'linearcoupler', { component: c, plane: 'Right' }, { component: c, plane: 'Top' }, { ratio: 2 });
      var bad2 = AS.addMate(m, 'linearcoupler', { component: a, plane: 'Right' }, { component: c, plane: 'Right' }, { ratio: [1, 0] });
      var b = AS.rebuild(m);
      assert(/two components/.test(b.errors[bad.id] || ''), JSON.stringify(b.errors));
      assert(/ratio/.test(b.errors[bad2.id] || ''), JSON.stringify(b.errors));
      assert(AS.MATE_GROUPS.advanced.indexOf('linearcoupler') >= 0 && AS.MATE_NAMES.linearcoupler === 'LinearCoupler', 'listed among the Advanced Mates');
    });

    // ---- Collision Detection: a block sitting on a plate (Coincident: it slides and turns on the plate) dragged at a
    // wall standing on the plate at x 100 .. 110
    var WALL = 'p.name("Wall"); p.box(10, 100, 40);';
    function arena() {
      var m = AS.newAssembly();
      var base = AS.insert(m, { script: BASE }, { fixed: true }).id;
      var wall = AS.insert(m, { script: WALL }, { fixed: true, position: [100, 10, 0] }).id;
      var blk = AS.insert(m, { script: BLOCK }, { position: [20, 13, 40] }).id;
      AS.addMate(m, 'coincident', { component: base, face: [50, 10, 50] }, { component: blk, face: [10, 0, 10] });
      var b = AS.rebuild(m);
      noErr(b);
      return { m: m, b: b, base: base, wall: wall, blk: blk };
    }
    test('rfIV: Collision Detection: a block dragged through a wall in one step stops against it (to a 4096th of the step); the plate it slides on is no collision', function () {
      var s = arena();
      near(pos(s.m, s.blk)[1], 10, 1e-7, 'on the plate');
      var r = AS.collisionDrag(s.m, s.b.cache, { id: s.blk, point: [10, 10, 10], target: [180, 20, 50] });
      assert(r.collision && r.collision.hit && r.collision.stopped, JSON.stringify(r.collision && { hit: r.collision.hit, t: r.collision.t }));
      var x = pos(s.m, s.blk)[0], step = 150 / 4096;
      assert(x <= 80 + 1e-6 && x > 80 - step - 1e-6, 'stopped at the wall: x ' + x);
      assert(r.collision.pairs[0].a === s.blk && r.collision.pairs[0].b === s.wall, JSON.stringify(r.collision.pairs.map(function (p) { return [p.a, p.b]; })));
      near(pos(s.m, s.blk)[1], 10, 1e-7, 'still on the plate');
      var free = AS.collisionDrag(s.m, r.cache, { id: s.blk, point: [10, 10, 10], target: [x + 10, 20, 20] });
      assert(!free.collision.hit, 'a drag along the wall is free');
      near(pos(s.m, s.blk)[2], 10, 1e-6, 'slid along z');
      var back = AS.collisionDrag(s.m, free.cache, { id: s.blk, point: [10, 10, 10], target: [40, 20, 20] });
      assert(!back.collision.hit, 'away from the wall is free');
      near(pos(s.m, s.blk)[0], 30, 1e-6, 'moved back');
    });
    test('rfIV: Collision Detection: These components leaves the wall out; Dragged part only; a pair already overlapping does not hold the drag', function () {
      var s = arena();
      var r = AS.collisionDrag(s.m, s.b.cache, { id: s.blk, point: [10, 10, 10], target: [180, 20, 50] }, { against: [s.blk, s.base] });
      assert(!r.collision.hit, 'the wall is not among These components');
      near(pos(s.m, s.blk)[0], 170, 1e-6, 'passed the wall');
      var c = AS.collision(s.m, r, [s.blk]);
      assert(!c.hit, 'out the other side: no overlap');
      AS.moveComponent(s.m, s.blk, [-65, 0, 0]);   // into the wall
      var b2 = AS.rebuild(s.m, r.cache);
      assert(AS.collision(s.m, b2, [s.blk]).hit, 'overlapping the wall now');
      var out = AS.collisionDrag(s.m, b2.cache, { id: s.blk, point: [10, 10, 10], target: [65, 20, 50] });
      assert(!out.collision.hit, 'dragging it out of the wall is not stopped');
      near(pos(s.m, s.blk)[0], 55, 1e-6, 'dragged out');
    });
  })();
