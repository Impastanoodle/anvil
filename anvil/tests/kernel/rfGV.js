  // --- rfGV (2026-11-02, lane mates) --- Symmetric, Slot and Hinge mates solved to the analytic position: two blocks either
  // side of a plane, a pin in a 60 long (centre to centre) 12 wide straight slot with each of Free / Center in Slot /
  // Distance Along Slot / Percent Along Slot, a door on a hinge pin with and without its angle limit; DOF left by each;
  // the mate survives generateScript -> runScript and a JSON round trip.
  (function () {
    group('rfGV: Symmetric, Slot and Hinge mates');
    if (typeof Assembly === 'undefined') { test('assembly.js loads', function () { fail('Assembly is not defined'); }); return; }
    var AS = Assembly;
    function rfGVnoErr(b) { var ids = Object.keys(b.errors); if (ids.length) fail('assembly errors: ' + ids.map(function (id) { return id + ': ' + b.errors[id]; }).join(' | ')); }
    function rfGVst(b, id) { return b.components.filter(function (c) { return c.id === id; })[0]; }
    function rfGVpos(m, id) { return AS.findComponent(m, id).transform.position; }
    function rfGVrot(m, id) { return AS.findComponent(m, id).transform.rotation; }
    function rfGVrt(m) {   // script round trip, then the JSON round trip: same mate, same places
      var m2 = AS.newAssembly();
      AS.runScript(m2, AS.generateScript(m));
      m2 = JSON.parse(JSON.stringify(m2));
      var b2 = AS.rebuild(m2);
      rfGVnoErr(b2);
      return m2;
    }
    var BLOCK = 'p.name("Block"); p.box(20, 20, 20);';   // x, y, z 0..20 (box(x, z, y) from the origin)
    var PLATE = 'p.name("SlotPlate"); p.box(200, 100, 10); p.sketch("Top", 10).slot(70, -50, 130, -50, 12).cut("through");';
    var PIN = 'p.name("Pin"); p.cylinder(5, 30);';

    // ---- Symmetric
    function rfGVsym() {
      var m = AS.newAssembly();
      var a = AS.insert(m, { script: BLOCK }, { position: [30, 0, 0], fixed: true }).id;
      var b = AS.insert(m, { script: BLOCK }, { position: [-70, 3, 5] }).id;
      return { m: m, a: a, b: b };
    }
    test('Symmetric: two faces about the Right plane: the moving face lands at the mirror x; closest alignment keeps the block unturned', function () {
      var s = rfGVsym();
      var mt = AS.addMate(s.m, 'symmetric', { component: s.a, face: [0, 10, 10] }, { component: s.b, face: [20, 10, 10] }, { a2: { plane: 'Right' } });
      var b = AS.rebuild(s.m);
      rfGVnoErr(b);
      assert(mt.name === 'Symmetric1', mt.name);
      // block A's -x face is at x = 30, so block B's +x face (local 20) must end at x = -30: position -50
      near(rfGVpos(s.m, s.b)[0], -50, 1e-7, 'mirrored x');
      near(rfGVpos(s.m, s.b)[1], 3, 1e-7, 'y free, unchanged');
      near(rfGVrot(s.m, s.b)[0], 1, 1e-7, 'block not turned (its +x normal is the mirror of -x)');
      assert(rfGVst(b, s.b).dof === 3, 'dof ' + rfGVst(b, s.b).dof);   // as a Coincident: 3 left
      assert(b.mates[mt.id].ok, 'status');
    });
    test('Symmetric: the plane may be a face of a third component, and two cylinders mirror axis for axis', function () {
      var m = AS.newAssembly();
      var wall = AS.insert(m, { script: 'p.name("Wall"); p.box(4, 100, 100);' }, { position: [10, 0, 0], fixed: true }).id;   // faces at x 10, 14
      var p1 = AS.insert(m, { script: PIN }, { position: [20, 0, 7], fixed: true }).id;
      var p2 = AS.insert(m, { script: PIN }, { position: [-40, 2, -9] }).id;
      var mt = AS.addMate(m, 'symmetric', { component: p1, cylinder: [5, 15, 0] }, { component: p2, cylinder: [5, 15, 0] }, { a2: { component: wall, face: [0, 50, 50] } });
      var b = AS.rebuild(m);
      rfGVnoErr(b);
      // mirror of x = 20 in x = 10 is x = 0; z stays 7
      near(rfGVpos(m, p2)[0], 0, 1e-7, 'x mirrored in the wall face');
      near(rfGVpos(m, p2)[2], 7, 1e-7, 'z');
      assert(b.mates[mt.id].ok, 'status');
    });
    test('Symmetric survives script and JSON round trips; a mixed pair is refused in plain words', function () {
      var s = rfGVsym();
      AS.addMate(s.m, 'symmetric', { component: s.a, face: [0, 10, 10] }, { component: s.b, face: [20, 10, 10] }, { a2: { plane: 'Right' } });
      AS.rebuild(s.m);
      var m2 = rfGVrt(s.m);
      assert(m2.mates[0].type === 'symmetric' && m2.mates[0].a2 && m2.mates[0].a2.plane === 'Right', JSON.stringify(m2.mates[0]));
      near(m2.components[1].transform.position[0], -50, 1e-6, 'x after the round trip');
      var s2 = rfGVsym();
      var bad = AS.addMate(s2.m, 'symmetric', { component: s2.a, face: [0, 10, 10] }, { axis: 'y' }, { a2: { plane: 'Right' } });
      var b = AS.rebuild(s2.m);
      assert(/two entities of one kind/.test(b.errors[bad.id] || (b.mates[bad.id] && b.mates[bad.id].error) || ''), JSON.stringify(b.errors));
    });

    // ---- Slot
    function rfGVslot(constraint, extra, at) {
      var m = AS.newAssembly();
      var plate = AS.insert(m, { script: PLATE }, { fixed: true }).id;
      var pin = AS.insert(m, { script: PIN }, { position: at || [110, 40, 53] }).id;
      var o = extra || {};
      o.constraint = constraint;
      // the slot's end arc round x = 130 (a cylindrical slot face): the first end, so along-slot runs from 130 towards 70
      var mt = AS.addMate(m, 'slot', { component: plate, cylinder: [136, 5, 50] }, { component: pin, cylinder: [5, 15, 0] }, o);
      var b = AS.rebuild(m);
      return { m: m, b: b, pin: pin, mt: mt };
    }
    test('Slot, Center in Slot: the pin axis lands on the slot centre (100, 50), 2 DOF left (turn, along the pin)', function () {
      var s = rfGVslot('center');
      rfGVnoErr(s.b);
      near(rfGVpos(s.m, s.pin)[0], 100, 1e-7, 'x');
      near(rfGVpos(s.m, s.pin)[2], 50, 1e-7, 'z');
      assert(rfGVst(s.b, s.pin).dof === 2, 'dof ' + rfGVst(s.b, s.pin).dof);
    });
    test('Slot, Distance Along Slot 12 from the picked end; Flip dimension measures from the other end', function () {
      var s = rfGVslot('distance', { distance: 12 });
      rfGVnoErr(s.b);
      near(rfGVpos(s.m, s.pin)[0], 118, 1e-7, 'x 130 - 12');
      near(rfGVpos(s.m, s.pin)[2], 50, 1e-7, 'z');
      var f = rfGVslot('distance', { distance: 12, flip: true });
      near(rfGVpos(f.m, f.pin)[0], 82, 1e-7, 'x 70 + 12');
    });
    test('Slot, Percent Along Slot 25: a quarter of the 60 centre length from the picked end', function () {
      var s = rfGVslot('percent', { percent: 25 });
      rfGVnoErr(s.b);
      near(rfGVpos(s.m, s.pin)[0], 115, 1e-7, 'x 130 - 15');
    });
    test('Slot, Free: the pin keeps its place along the slot, is stopped at the slot ends, 3 DOF left', function () {
      var s = rfGVslot('free', null, [110, 40, 53]);
      rfGVnoErr(s.b);
      near(rfGVpos(s.m, s.pin)[0], 110, 1e-7, 'x stays');
      near(rfGVpos(s.m, s.pin)[2], 50, 1e-7, 'z on the centre line');
      assert(rfGVst(s.b, s.pin).dof === 3, 'dof ' + rfGVst(s.b, s.pin).dof);
      var e = rfGVslot('free', null, [170, 40, 53]);
      rfGVnoErr(e.b);
      near(rfGVpos(e.m, e.pin)[0], 130, 1e-7, 'stopped at the slot end');
    });
    test('Slot: a flat side of the slot selects it too; the slot lies square to the plate wherever the plate stands; round trips', function () {
      var m = AS.newAssembly();
      var plate = AS.insert(m, { script: PLATE }, { fixed: true, position: [100, 0, 50], rotation: [0, 0, 1, 0, 1, 0, -1, 0, 0] }).id;
      var pin = AS.insert(m, { script: PIN }, { position: [140, 40, -30] }).id;
      var mt = AS.addMate(m, 'slot', { component: plate, face: [100, 5, 56] }, { component: pin, cylinder: [5, 15, 0] }, { constraint: 'center' });
      var b = AS.rebuild(m);
      rfGVnoErr(b);
      // the plate's local (100, y, 50) stands at world (50 + 100, y, -100 + 50)
      near(rfGVpos(m, pin)[0], 150, 1e-7, 'x');
      near(rfGVpos(m, pin)[2], -50, 1e-7, 'z');
      assert(b.mates[mt.id].ok, 'status');
      var m2 = rfGVrt(m);
      assert(m2.mates[0].type === 'slot' && m2.mates[0].constraint === 'center', JSON.stringify(m2.mates[0]));
      near(m2.components[1].transform.position[2], -50, 1e-6, 'z after the round trip');
    });
    test('Slot: a percent round trip keeps the value; a pick that is no slot says so in plain words', function () {
      var s = rfGVslot('percent', { percent: 25 });
      var m2 = rfGVrt(s.m);
      assert(m2.mates[0].percent === 25 && m2.mates[0].distance == null, JSON.stringify(m2.mates[0]));
      var m = AS.newAssembly();
      var blk = AS.insert(m, { script: BLOCK }, { fixed: true }).id, pin = AS.insert(m, { script: PIN }, { position: [50, 0, 0] }).id;
      var bad = AS.addMate(m, 'slot', { component: blk, face: [0, 10, 10] }, { component: pin, cylinder: [5, 15, 0] }, {});
      var b = AS.rebuild(m);
      assert(/straight slot/.test(b.errors[bad.id] || (b.mates[bad.id] && b.mates[bad.id].error) || ''), JSON.stringify(b.errors));
    });

    // ---- Hinge
    // post x, z 0..40, y 0..20 with a pin on (20, 20); door x 0..60, z 0..10, y 0..4 with a hole on its local (5, 5)
    var POST = 'p.name("Post"); p.box(40, 40, 20); p.cylinder(3, 60, { at: [20, 0, 20] });';
    var DOOR = 'p.name("Door"); p.box(60, 10, 4); p.cylinder(3, 4, { at: [5, 0, 5], cut: true });';
    function rfGVry(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
    function rfGVhinge(opts, deg) {
      var m = AS.newAssembly();
      var post = AS.insert(m, { script: POST }, { fixed: true }).id;
      var door = AS.insert(m, { script: DOOR }, { position: [30, 90, 20], rotation: rfGVry(deg || 0) }).id;
      var o = opts || {};
      o.a2 = { component: post, face: [5, 20, 5] }; o.b2 = { component: door, face: [30, 0, 8] };
      if (o.limit) { o.a3 = { component: post, face: [40, 10, 20] }; o.b3 = { component: door, face: [60, 2, 5] }; }
      var mt = AS.addMate(m, 'hinge', { component: post, cylinder: [23, 40, 20] }, { component: door, cylinder: [8, 2, 5] }, o);
      return { m: m, post: post, door: door, mt: mt };
    }
    function rfGVdoorAngle(s) { var R = rfGVrot(s.m, s.door); return Math.atan2(R[2], R[0]) * 180 / Math.PI; }
    test('Hinge: concentric + coincident in one mate: the door sits on the post top on the pin axis, 1 DOF left (the turn)', function () {
      var s = rfGVhinge();
      var b = AS.rebuild(s.m);
      rfGVnoErr(b);
      near(rfGVpos(s.m, s.door)[0], 15, 1e-7, 'x: hole on the pin');
      near(rfGVpos(s.m, s.door)[1], 20, 1e-7, 'y: on the post top');
      near(rfGVpos(s.m, s.door)[2], 15, 1e-7, 'z: hole on the pin');
      assert(rfGVst(b, s.door).dof === 1, 'dof ' + rfGVst(b, s.door).dof);
      assert(s.mt.name === 'Hinge1' && AS.defaultAlignment(s.mt) === 'closest', s.mt.name + ' ' + AS.defaultAlignment(s.mt));   // SolidWorks' default (rfGW)
    });
    test('Hinge: Define angle limit brings a door turned 60 back to its 30 maximum, leaves one inside the range alone; still 1 DOF', function () {
      var s = rfGVhinge({ limit: true, min: 0, max: 30 }, 60);
      var b = AS.rebuild(s.m);
      rfGVnoErr(b);
      near(rfGVdoorAngle(s), 30, 1e-6, 'turned to the limit');
      near(rfGVpos(s.m, s.door)[1], 20, 1e-7, 'still on the post top');
      assert(rfGVst(b, s.door).dof === 1, 'dof ' + rfGVst(b, s.door).dof);
      var i = rfGVhinge({ limit: true, min: 0, max: 30 }, 20);
      var b2 = AS.rebuild(i.m);
      rfGVnoErr(b2);
      near(rfGVdoorAngle(i), 20, 1e-6, 'stays inside the range');
      var m2 = rfGVrt(i.m);
      assert(m2.mates[0].limit === true && m2.mates[0].a3 && m2.mates[0].b3 && m2.mates[0].max === 30 && m2.mates[0].a2 && m2.mates[0].b2, JSON.stringify(m2.mates[0]));
    });
    test('Hinge: a2 / b2 given the other way round still solve; round trip; removing a component takes the mate with it', function () {
      var s = rfGVhinge();
      var sw = s.mt.a2; s.mt.a2 = s.mt.b2; s.mt.b2 = sw;
      rfGVnoErr(AS.rebuild(s.m));
      near(rfGVpos(s.m, s.door)[1], 20, 1e-7, 'y: on the post top');
      var m2 = rfGVrt(s.m);
      assert(m2.mates[0].type === 'hinge' && m2.mates[0].a2 && m2.mates[0].b2, JSON.stringify(m2.mates[0]));
      near(m2.components[1].transform.position[1], 20, 1e-6, 'y after the round trip');
      AS.removeComponent(s.m, s.door);
      assert(s.m.mates.length === 0, 'the mate went with the door');
    });
    test('Mate groups as in SolidWorks: Symmetric among Advanced Mates, Slot and Hinge among Mechanical Mates', function () {
      assert(AS.MATE_GROUPS.advanced.indexOf('symmetric') === 1, AS.MATE_GROUPS.advanced.join());
      assert(AS.MATE_GROUPS.mechanical.join() === 'slot,hinge,gear,rackpinion,screw', AS.MATE_GROUPS.mechanical.join());
    });
  })();
