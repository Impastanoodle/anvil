  // ------------------------------------------------------------------ advanced mates, component patterns, exploded views (run cloud-2026-09-25l)
  // Analytic positions for Parallel / Perpendicular / Tangent / Width / Distance between cylinders, Gear ratio
  // kinematics, Limit Distance / Limit Angle clamping, Linear / Circular Component Pattern and Mirror Components
  // instance transforms (seed-driven), explode step offsets and explode lines.
  group('assembly: advanced mates, patterns, exploded view');
  if (typeof Assembly === 'undefined') {
    test('assembly.js loads', function () { fail('Assembly is not defined'); });
  } else (function () {
    var AS = Assembly;
    var BASE = 'p.name("Base"); p.box(100, 60, 10);', BLOCK = 'p.name("Block"); p.box(20, 20, 20);', BAR = 'p.name("Bar"); p.box(40, 10, 4);';
    var PIN = 'p.name("Pin"); p.cylinder(4, 20);', PEG = 'p.name("Peg"); p.cylinder(2, 20);';
    // plate 100 × 10 × 60 with a 30 wide slot through it at x 35..65
    var SLOT = 'p.name("Slot"); p.box(100, 60, 10); p.box(30, 60, 10, { at: [35, 0, 0], cut: true });';
    var TILT = [0.965926, -0.258819, 0, 0.258819, 0.965926, 0, 0, 0, 1], LYING = [1, 0, 0, 0, 0, -1, 0, 1, 0], I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    function ry(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
    function nearRot(a, b, tol, label) { for (var i = 0; i < 9; i++) near(a[i], b[i], tol, (label || 'rotation') + '[' + i + ']'); }
    function noAsmErrors(b) { var ids = Object.keys(b.errors); if (ids.length) fail('assembly errors: ' + ids.map(function (id) { return id + ': ' + b.errors[id]; }).join(' | ')); }
    function st(b, id) { return b.components.filter(function (c) { return c.id === id; })[0]; }
    function T(m, id) { return AS.findComponent(m, id).transform; }
    function col(R, j) { return [R[j], R[3 + j], R[6 + j]]; }   // where the local axis j points in the world
    function det(R) { return R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]); }
    function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function apothem(r) { var n = segsForRadius(r); return r * Math.cos(Math.PI / n); }   // a faceted cylinder's fitted radius
    var TOP = function (id) { return { component: id, face: [50, 10, 30] }; }, BOTTOM = function (id) { return { component: id, face: [10, 0, 10] }; };
    function asm() { var m = AS.newAssembly(); return { m: m, base: AS.insert(m, { script: BASE }).id }; }

    // ---- Parallel / Perpendicular
    test('Parallel: the tilted block bottom turns parallel to the base top (closest alignment keeps it upright), 4 DOF left', function () {
      var s = asm(), blk = AS.insert(s.m, { script: BLOCK }, { position: [5, 40, 5], rotation: TILT.slice() }).id;
      var mt = AS.addMate(s.m, 'parallel', BOTTOM(blk), TOP(s.base));
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      nearRot(T(s.m, blk).rotation, I3, 1e-6);
      assert(mt.name === 'Parallel1' && AS.defaultAlignment(mt) === 'closest', mt.name + ' ' + AS.defaultAlignment(mt));
      assert(st(b, blk).dof === 4, 'dof ' + st(b, blk).dof);
    });
    test('Parallel Aligned between a bottom face and a top face turns the block upside down (its +y along world -y)', function () {
      var s = asm(), blk = AS.insert(s.m, { script: BLOCK }, { position: [5, 40, 5] }).id;
      AS.addMate(s.m, 'parallel', BOTTOM(blk), TOP(s.base), { alignment: 'aligned' });
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      nearVec(col(T(s.m, blk).rotation, 1), [0, -1, 0], 1e-6, 'local +y');
    });
    test('Perpendicular face–face: the tilted block side ends square to the base top (5 DOF); cylinder–face: the pin stands on its axis (4 DOF)', function () {
      var s = asm(), blk = AS.insert(s.m, { script: BLOCK }, { position: [5, 40, 5], rotation: TILT.slice() }).id;
      var pin = AS.insert(s.m, { script: PIN }, { position: [70, 40, 30], rotation: LYING.slice() }).id;
      AS.addMate(s.m, 'perpendicular', { component: blk, face: [0, 10, 10] }, TOP(s.base));
      AS.addMate(s.m, 'perpendicular', { component: pin, cylinder: [4, 10, 0] }, TOP(s.base));
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      near(dot3(col(T(s.m, blk).rotation, 0), [0, 1, 0]), 0, 1e-9, 'block x · top normal');
      near(Math.abs(dot3(col(T(s.m, pin).rotation, 1), [0, 1, 0])), 1, 1e-9, 'pin axis along the normal');
      assert(st(b, blk).dof === 5 && st(b, pin).dof === 4, 'dof ' + st(b, blk).dof + ' / ' + st(b, pin).dof);
    });
    test('Parallel cylinder–face: the standing pin lies down, its axis square to the face normal (5 DOF)', function () {
      var s = asm(), pin = AS.insert(s.m, { script: PIN }, { position: [70, 40, 30], rotation: ry(20) }).id;
      AS.addMate(s.m, 'parallel', { component: pin, cylinder: [4, 10, 0] }, TOP(s.base));
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      near(dot3(col(T(s.m, pin).rotation, 1), [0, 1, 0]), 0, 1e-9, 'axis · normal');
      assert(st(b, pin).dof === 5, 'dof ' + st(b, pin).dof);
    });

    // ---- Tangent
    test('Tangent cylinder–plane: the lying pin rests on the top (axis 10 + r above y = 0, r = 4 exactly from the surface record), flip puts it under the face', function () {
      var r = 4, out = [];
      [false, true].forEach(function (flip) {
        var s = asm(), pin = AS.insert(s.m, { script: PIN }, { position: [30, 40, 20], rotation: LYING.slice() }).id;
        var mt = AS.addMate(s.m, 'tangent', { component: pin, cylinder: [4, 10, 0] }, TOP(s.base), { flip: flip });
        var b = AS.rebuild(s.m);
        noAsmErrors(b);
        nearVec(T(s.m, pin).position, [30, flip ? 10 - r : 10 + r, 20], 1e-9, 'axis position (flip ' + flip + ')');
        nearRot(T(s.m, pin).rotation, LYING, 1e-6);
        assert(st(b, pin).dof === 4, 'dof ' + st(b, pin).dof);
        var cy = AS.findCylinder(b.partBuilds[pin], [4, 10, 0]);
        assert(cy.exact, 'exact record');
        near(cy.radius, r, 1e-12, 'record radius');
        out.push(fmt(T(s.m, pin).position[1]));
        assert(!!mt.flip === flip, 'flip stored');
      });
      return 'axis y ' + out.join(' / ');
    });
    test('Tangent cylinder–cylinder: axes rA + rB = 6 apart exactly (external), |rA − rB| with flip (internal); two faces is an error', function () {
      [false, true].forEach(function (flip) {
        var s = asm(), p1 = AS.insert(s.m, { script: PIN }, { position: [30, 10, 30], fixed: true }).id, p2 = AS.insert(s.m, { script: PEG }, { position: [60, 30, 40] }).id;
        AS.addMate(s.m, 'coincident', { component: p2, face: [0.5, 0, 0.5] }, TOP(s.base));
        AS.addMate(s.m, 'tangent', { component: p2, cylinder: [2, 10, 0] }, { component: p1, cylinder: [4, 10, 0] }, { flip: flip });
        var b = AS.rebuild(s.m), q = T(s.m, p2).position;
        noAsmErrors(b);
        near(Math.hypot(q[0] - 30, q[2] - 30), flip ? 4 - 2 : 4 + 2, 1e-9, 'axis distance (flip ' + flip + ')');
        near(q[1], 10, 1e-6, 'on the top');
        assert(st(b, p2).dof === 2, 'dof ' + st(b, p2).dof);
      });
      var s2 = asm(), blk = AS.insert(s2.m, { script: BLOCK }).id, mt = AS.addMate(s2.m, 'tangent', BOTTOM(blk), TOP(s2.base));
      var b2 = AS.rebuild(s2.m);
      assert(b2.errors[mt.id] === 'Tangent needs a cylindrical face and a planar or cylindrical face', b2.errors[mt.id]);
    });

    // ---- Width
    test('Width: a 20 wide block centred in the 30 wide slot (x 40..60), 3 DOF; a cylindrical tab centred on the slot mid-plane (x = 50)', function () {
      var m = AS.newAssembly(), sl = AS.insert(m, { script: SLOT }).id;
      var blk = AS.insert(m, { script: BLOCK }, { position: [10, 20, 5], rotation: ry(10) }).id, pin = AS.insert(m, { script: PIN }, { position: [5, 30, 50], rotation: TILT.slice() }).id;
      var w = AS.addMate(m, 'width', { component: sl, face: [35, 5, 30] }, { component: blk, face: [0, 10, 10] }, { a2: { component: sl, face: [65, 5, 30] }, b2: { component: blk, face: [20, 10, 10] } });
      AS.addMate(m, 'width', { component: sl, face: [35, 5, 30] }, { component: pin, cylinder: [4, 10, 0] }, { a2: { component: sl, face: [65, 5, 30] } });
      var b = AS.rebuild(m);
      noAsmErrors(b);
      near(Math.abs(col(T(m, blk).rotation, 0)[0]), 1, 1e-9, 'block square to the slot');
      var c = AS.transformPoint(T(m, blk), [10, 10, 10]);
      near(c[0], 50, 1e-6, 'block centre x');
      near(dot3(col(T(m, pin).rotation, 1), [1, 0, 0]), 0, 1e-9, 'pin axis in the mid-plane');
      near(AS.transformPoint(T(m, pin), [0, 10, 0])[0], 50, 1e-6, 'pin axis x');
      assert(st(b, blk).dof === 3 && st(b, pin).dof === 4, 'dof ' + st(b, blk).dof + ' / ' + st(b, pin).dof);
      assert(w.name === 'Width1' && w.a2 && w.b2, JSON.stringify(w));
    });
    test('Width errors: a missing second width face, width faces on two components', function () {
      var m = AS.newAssembly(), sl = AS.insert(m, { script: SLOT }).id, blk = AS.insert(m, { script: BLOCK }).id, blk2 = AS.insert(m, { script: BLOCK }).id;
      var w1 = AS.addMate(m, 'width', { component: sl, face: [35, 5, 30] }, { component: blk, face: [0, 10, 10] }, { b2: { component: blk, face: [20, 10, 10] } });
      var w2 = AS.addMate(m, 'width', { component: sl, face: [35, 5, 30] }, { component: blk, face: [0, 10, 10] }, { a2: { component: blk2, face: [20, 10, 10] }, b2: { component: blk, face: [20, 10, 10] } });
      var b = AS.rebuild(m);
      assert(/Width needs two width faces/.test(b.errors[w1.id]), b.errors[w1.id]);
      assert(/both width faces must be on one component/.test(b.errors[w2.id]), b.errors[w2.id]);
    });

    // ---- Distance between cylinders
    test('Distance between cylinders: axes 25 apart (pin on the top, 2 DOF: it can swing round the fixed pin and spin)', function () {
      var s = asm(), p1 = AS.insert(s.m, { script: PIN }, { position: [20, 10, 20], fixed: true }).id, p2 = AS.insert(s.m, { script: PIN }, { position: [60, 30, 40] }).id;
      var d = AS.addMate(s.m, 'distance', { component: p2, cylinder: [4, 10, 0] }, { component: p1, cylinder: [4, 10, 0] }, { distance: 25 });
      AS.addMate(s.m, 'coincident', { component: p2, face: [1, 0, 1] }, TOP(s.base));
      var b = AS.rebuild(s.m), q = T(s.m, p2).position;
      noAsmErrors(b);
      near(Math.hypot(q[0] - 20, q[2] - 20), 25, 1e-6, 'centre distance');
      near(q[1], 10, 1e-6, 'standing on the top');
      assert(st(b, p2).dof === 2, 'dof ' + st(b, p2).dof);
      assert(AS.defaultAlignment(d) === 'closest', AS.defaultAlignment(d));
      d.distance = 12; b = AS.rebuild(s.m); q = T(s.m, p2).position;
      near(Math.hypot(q[0] - 20, q[2] - 20), 12, 1e-6, 'edited to 12');
    });

    // ---- Gear
    function gears(ratio, opts) {
      var m = AS.newAssembly(), b1 = AS.insert(m, { script: BASE }).id, b2 = AS.insert(m, { script: BASE }, { fixed: true, position: [30, 0, 0] }).id;
      var g1 = AS.insert(m, { script: PIN }, { position: [0, 20, 0] }).id, g2 = AS.insert(m, { script: PIN }, { position: [30, 20, 0] }).id;
      AS.addMate(m, 'concentric', { component: g1, axis: 'y' }, { component: b1, axis: 'y' }); AS.addMate(m, 'coincident', { component: g1, plane: 'Top' }, { component: b1, plane: 'Top' });
      AS.addMate(m, 'concentric', { component: g2, axis: 'y' }, { component: b2, axis: 'y' }); AS.addMate(m, 'coincident', { component: g2, plane: 'Top' }, { component: b2, plane: 'Top' });
      var gm = AS.addMate(m, 'gear', { component: g1, axis: 'y' }, { component: g2, axis: 'y' }, Object.assign({ ratio: ratio }, opts || {}));
      return { m: m, g1: g1, g2: g2, gm: gm, b: AS.rebuild(m) };
    }
    test('Gear 1 : 2: turning gear A 30° turns gear B 15° the other way; again 40° more: B at −35°; one DOF shared', function () {
      var s = gears([1, 2]);
      noAsmErrors(s.b);
      assert(s.gm.phase && Math.abs(s.gm.phase[0]) < 1e-9 && Math.abs(s.gm.phase[1]) < 1e-9, 'phase stored at the first solve: ' + JSON.stringify(s.gm.phase));
      assert(st(s.b, s.g1).dof === 1 && st(s.b, s.g2).dof === 1, 'dof ' + st(s.b, s.g1).dof + ' / ' + st(s.b, s.g2).dof);
      AS.rotateComponent(s.m, s.g1, 'y', 30, [0, 0, 0]); var b = AS.rebuild(s.m);
      noAsmErrors(b);
      nearRot(T(s.m, s.g1).rotation, ry(30), 1e-9, 'A'); nearRot(T(s.m, s.g2).rotation, ry(-15), 1e-9, 'B');
      nearVec(T(s.m, s.g2).position, [30, 0, 0], 1e-9, 'B stays on its shaft');
      AS.rotateComponent(s.m, s.g1, 'y', 40, [0, 0, 0]); b = AS.rebuild(s.m);
      nearRot(T(s.m, s.g2).rotation, ry(-35), 1e-9, 'B after 70°');
    });
    test('Gear ratio 3 : 1 and Reverse: A 20° → B −60°; reversed → B +60°; bad ratio is an error', function () {
      var s = gears(3);
      assert(s.gm.ratio[0] === 3 && s.gm.ratio[1] === 1, 'number ratio stored as [3, 1]');
      AS.rotateComponent(s.m, s.g1, 'y', 20, [0, 0, 0]); AS.rebuild(s.m);
      nearRot(T(s.m, s.g2).rotation, ry(-60), 1e-9, 'B');
      var r = gears([3, 1], { flip: true });
      AS.rotateComponent(r.m, r.g1, 'y', 20, [0, 0, 0]); AS.rebuild(r.m);
      nearRot(T(r.m, r.g2).rotation, ry(60), 1e-9, 'B reversed');
      var e = gears([0, 1]);
      assert(e.b.errors[e.gm.id] === 'Gear ratio must be two numbers > 0', e.b.errors[e.gm.id]);
    });

    // ---- Limit Distance / Limit Angle
    test('Limit Distance 10..30 between the left faces: 60 apart clamps to 30, pushed to −10 clamps to 10, 25 stays 25; limits leave the DOF free', function () {
      var s = asm(), blk = AS.insert(s.m, { script: BLOCK }, { position: [60, 10, 5] }).id;
      AS.addMate(s.m, 'coincident', BOTTOM(blk), TOP(s.base));
      var lm = AS.addMate(s.m, 'limitdistance', { component: blk, face: [0, 10, 10] }, { component: s.base, face: [0, 5, 30] }, { min: 10, max: 30, alignment: 'aligned' });
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      near(T(s.m, blk).position[0], 30, 1e-6, 'clamped to max');
      assert(st(b, blk).dof === 3, 'dof ' + st(b, blk).dof);
      assert(lm.name === 'LimitDistance1' && lm.min === 10 && lm.max === 30, JSON.stringify(lm));
      AS.moveComponent(s.m, blk, [-40, 0, 0]); AS.rebuild(s.m);
      near(T(s.m, blk).position[0], 10, 1e-6, 'clamped to min');
      AS.moveComponent(s.m, blk, [15, 0, 3]); AS.rebuild(s.m);
      nearVec(T(s.m, blk).position, [25, 10, 8], 1e-6, 'free inside the range');
      lm.min = 40; b = AS.rebuild(s.m);
      assert(/Limit Distance needs 0 ≤ minimum ≤ maximum/.test(b.errors[lm.id]), b.errors[lm.id]);
    });
    test('Limit Angle 10°..40° on the hinged bar: 0° clamps to 10°, turned to 70° clamps to 40°, 25° stays', function () {
      var s = asm(), bar = AS.insert(s.m, { script: BAR }, { position: [60, 30, 20] }).id;
      AS.addMate(s.m, 'coincident', { component: bar, face: [20, 0, 5] }, TOP(s.base));
      AS.addMate(s.m, 'concentric', { component: bar, axis: 'y' }, { component: s.base, axis: 'y' });
      var la = AS.addMate(s.m, 'limitangle', { component: bar, face: [20, 2, 0] }, { component: s.base, face: [50, 5, 0] }, { min: 10, max: 40 });
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      nearRot(T(s.m, bar).rotation, ry(-10), 1e-6, '10°');
      assert(st(b, bar).dof === 1, 'hinge still free: dof ' + st(b, bar).dof);
      AS.rotateComponent(s.m, bar, 'y', -60, [0, 0, 0]); AS.rebuild(s.m);
      nearRot(T(s.m, bar).rotation, ry(-40), 1e-6, '40°');
      AS.rotateComponent(s.m, bar, 'y', 15, [0, 0, 0]); AS.rebuild(s.m);
      nearRot(T(s.m, bar).rotation, ry(-25), 1e-6, '25° inside');
      assert(la.name === 'LimitAngle1', la.name);
      la.max = 200; b = AS.rebuild(s.m);
      assert(/Limit Angle needs 0 ≤ minimum ≤ maximum ≤ 180°/.test(b.errors[la.id]), b.errors[la.id]);
    });

    test('setMateValues / MATE_GROUPS: limit keys, gear ratio, width refs only on their types; the three PropertyManager groups', function () {
      var m = { type: 'limitdistance', min: 2, max: 5, flip: true, ratio: [1, 2], a2: {} };
      AS.setMateValues(m, {});
      assert(m.min === 2 && m.max === 5 && m.flip === true && m.ratio == null && m.a2 == null, JSON.stringify(m));
      m.type = 'gear'; AS.setMateValues(m, { ratio: [20, 40] });
      assert(m.min == null && m.ratio[0] === 20 && m.ratio[1] === 40 && m.flip === true, JSON.stringify(m));
      m.type = 'parallel'; AS.setMateValues(m, {});
      assert(m.ratio == null && m.flip == null, JSON.stringify(m));
      var G = AS.MATE_GROUPS;
      assert(G.standard.join() === 'coincident,parallel,perpendicular,tangent,concentric,distance,angle', G.standard.join());
      assert(G.advanced.join() === 'profilecenter,symmetric,width,linearcoupler,limitdistance,limitangle' && G.mechanical.join() === 'cam,slot,hinge,gear,rackpinion,screw,universaljoint', G.advanced.join() + ' / ' + G.mechanical.join());
      assert(AS.isAssemblyScript('a.gear(x, y, 2);') && AS.isAssemblyScript('a.linearPattern([c], {});') && AS.isAssemblyScript('a.explode([c], "y", 5);'), 'isAssemblyScript knows the new calls');
    });
    test('script round trip of every new mate (Builder shortcuts → generateScript → runScript): same transforms, generateScript a fixed point', function () {
      var code = [
        'var sl = a.insert({ script: ' + JSON.stringify(SLOT) + ' }, { fixed: true });',
        'var blk = a.insert({ script: ' + JSON.stringify(BLOCK) + ' }, { position: [10, 20, 5] });',
        'var pin = a.insert({ script: ' + JSON.stringify(PIN) + ' }, { position: [80, 30, 40], rotation: [1, 0, 0, 0, 0, -1, 0, 1, 0] });',
        'var peg = a.insert({ script: ' + JSON.stringify(PEG) + ' }, { position: [20, 30, 50] });',
        'var bar = a.insert({ script: ' + JSON.stringify(BAR) + ' }, { position: [0, 40, 0] });',
        'a.parallel({ component: blk, face: [10, 0, 10] }, { component: sl, face: [10, 10, 30] });',
        'a.width({ component: sl, face: [35, 5, 30] }, { component: sl, face: [65, 5, 30] }, { component: blk, face: [0, 10, 10] }, { component: blk, face: [20, 10, 10] });',
        'a.limitDistance({ component: blk, face: [10, 0, 10] }, { component: sl, face: [10, 10, 30] }, 0, 5, { alignment: "anti-aligned" });',
        'a.tangent({ component: pin, cylinder: [4, 10, 0] }, { component: sl, face: [10, 10, 30] });',
        'a.perpendicular({ component: pin, cylinder: [4, 10, 0] }, { component: sl, face: [0, 5, 30] });',
        'a.coincident({ component: peg, face: [0.5, 0, 0.5] }, { component: sl, face: [10, 10, 30] });',
        'a.distance({ component: peg, cylinder: [2, 10, 0] }, { component: sl, axis: "y" }, 30);',
        'a.coincident({ component: bar, face: [20, 0, 5] }, { component: sl, face: [10, 10, 30] });',
        'a.concentric({ component: bar, axis: "y" }, { component: sl, axis: "y" });',
        'a.limitAngle({ component: bar, face: [20, 2, 0] }, { component: sl, face: [10, 5, 0] }, 5, 20);',
        'a.gear({ component: bar, axis: "y" }, { component: peg, cylinder: [2, 10, 0] }, [2, 1]);'
      ].join('\n');
      var m = AS.newAssembly(); AS.runScript(m, code);
      var b = AS.rebuild(m);
      noAsmErrors(b);
      var gen = AS.generateScript(m);
      ['a.mate("parallel"', 'a.mate("width"', 'a2: {', 'b2: {', 'a.mate("limitdistance"', 'min: 0, max: 5', 'a.mate("tangent"', 'a.mate("perpendicular"', 'a.mate("limitangle"', 'a.mate("gear"', 'ratio: [2, 1]', 'phase: ['].forEach(function (k) { assert(gen.indexOf(k) >= 0, 'generated script has ' + k); });
      var m2 = AS.newAssembly(); AS.runScript(m2, gen); var b2 = AS.rebuild(m2);
      noAsmErrors(b2);
      m.components.forEach(function (c, i) {
        var d = m2.components[i];
        nearVec(d.transform.position, c.transform.position, 1e-6, c.name + ' position'); nearRot(d.transform.rotation, c.transform.rotation, 1e-6, c.name);
      });
      var gen2 = AS.generateScript(m2), m3 = AS.newAssembly(); AS.runScript(m3, gen2); AS.rebuild(m3);
      assert(AS.generateScript(m3) === gen2, 'fixed point');
      return m.mates.length + ' mates, ' + gen.split('\n').length + ' lines';
    });

    // ---- component patterns
    function pinRow() {
      var s = asm(), pin = AS.insert(s.m, { script: PIN }, { position: [10, 10, 10] }).id;
      AS.addMate(s.m, 'coincident', { component: pin, face: [1, 0, 1] }, TOP(s.base));
      return { m: s.m, base: s.base, pin: pin };
    }
    test('Linear Component Pattern 3 × 2 (20 along the right face normal, 15 along the back face normal): instances Pin<2>…Pin<6> at the grid, seed-driven', function () {
      var s = pinRow();
      var p = AS.addPattern(s.m, 'linear', [s.pin], { direction: { component: s.base, face: [100, 5, 30] }, spacing: 20, count: 3, direction2: { component: s.base, face: [50, 5, 60] }, spacing2: 15, count2: 2 });
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      assert(p.name === 'LocalLPattern1', p.name);
      var inst = s.m.components.filter(function (c) { return c.pattern === p.id; });
      assert(inst.map(function (c) { return c.name; }).join() === 'Pin<2>,Pin<3>,Pin<4>,Pin<5>,Pin<6>', inst.map(function (c) { return c.name; }).join());
      var want = [[30, 10, 10], [50, 10, 10], [10, 10, 25], [30, 10, 25], [50, 10, 25]];
      inst.forEach(function (c, i) { nearVec(c.transform.position, want[i], 1e-9, c.name); nearRot(c.transform.rotation, I3, 1e-12, c.name); assert(st(b, c.id).instance && st(b, c.id).dof === 0, c.name + ' status'); });
      assert(b.patterns[p.id].ok && b.patterns[p.id].instances.length === 5, JSON.stringify(b.patterns));
      AS.moveComponent(s.m, s.pin, [5, 0, 7]); AS.rebuild(s.m);
      nearVec(T(s.m, inst[4].id).position, [55, 10, 32], 1e-9, 'Pin<6> follows the seed');
      near(T(s.m, s.pin).position[1], 10, 1e-9, 'seed kept on the top by its mate');
      var threw = false; try { AS.moveComponent(s.m, inst[0].id, [1, 0, 0]); } catch (e) { threw = /pattern instance/.test(e.message); }
      assert(threw, 'moving an instance is refused');
    });
    test('Circular Component Pattern: equal spacing 4 × 90° about the base Y axis; 3 × 30° not equal; instances turn with the seed', function () {
      var s = pinRow();
      AS.moveComponent(s.m, s.pin, [5, 0, 0]);
      var p = AS.addPattern(s.m, 'circular', [s.pin], { axis: { component: s.base, axis: 'y' }, angle: 360, count: 4, equal: true });
      var q = AS.addPattern(s.m, 'circular', [s.pin], { axis: { axis: 'y' }, angle: 30, count: 3 });
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      var P = s.m.components.filter(function (c) { return c.pattern === p.id; }), Q = s.m.components.filter(function (c) { return c.pattern === q.id; });
      assert(p.name === 'LocalCirPattern1' && q.name === 'LocalCirPattern2' && P.length === 3 && Q.length === 2, p.name + ' ' + P.length + ' ' + Q.length);
      [[10, 10, -15], [-15, 10, -10], [-10, 10, 15]].forEach(function (w, i) { nearVec(P[i].transform.position, w, 1e-9, P[i].name); nearRot(P[i].transform.rotation, ry(90 * (i + 1)), 1e-12, P[i].name); });
      Q.forEach(function (c, i) {
        var a = 30 * (i + 1) * Math.PI / 180;
        nearVec(c.transform.position, [15 * Math.cos(a) + 10 * Math.sin(a), 10, -15 * Math.sin(a) + 10 * Math.cos(a)], 1e-9, c.name);
      });
      AS.rotateComponent(s.m, s.pin, 'y', 10, T(s.m, s.pin).position); AS.rebuild(s.m);
      nearRot(T(s.m, P[0].id).rotation, ry(100), 1e-9, 'instance turned with the seed');
    });
    test('Mirror Components: a copy in the Right plane lands on the mirror image with a proper rotation; opposite hand in the Front plane is reflected (det −1), both volumes 8000', function () {
      var s = asm(), blk = AS.insert(s.m, { script: BLOCK }, { position: [10, 10, 5], fixed: true }).id;
      var p = AS.addPattern(s.m, 'mirror', [blk], { plane: { component: s.base, plane: 'Right' } });
      var q = AS.addPattern(s.m, 'mirror', [blk], { plane: { plane: 'Front' }, oppositeHand: true });
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      var c1 = s.m.components.filter(function (c) { return c.pattern === p.id; })[0], c2 = s.m.components.filter(function (c) { return c.pattern === q.id; })[0];
      assert(p.name === 'MirrorComponent1' && c1.name === 'Block<2>' && c2.name === 'Block<3>', p.name + ' ' + c1.name + ' ' + c2.name);
      nearVec(c1.transform.position, [-30, 10, 5], 1e-9, 'copy'); nearRot(c1.transform.rotation, I3, 1e-12, 'copy');
      near(det(c2.transform.rotation), -1, 1e-12, 'opposite hand det');
      nearVec(c2.transform.position, [10, 10, -5], 1e-9, 'opposite hand');
      var i1 = s.m.components.indexOf(c1), i2 = s.m.components.indexOf(c2);
      near(b.bodies[i1].volume(), 8000, 1e-6, 'copy volume'); near(b.bodies[i2].volume(), 8000, 1e-6, 'reflected volume (outward normals)');
      var mp = AS.massProps(s.m, b);
      nearVec(mp.components[i2].centroid, [20, 20, -15], 1e-9, 'reflected centroid');
      nearRel(K.massProps(K.meshFromBody(b.body), 1).volume, 100 * 60 * 10 + 3 * 8000, 1e-9, 'assembly volume');
    });
    test('patterns: a mate on an instance positions its component (solved again after the instances move); count 3 → 2 drops the last instance and its mate', function () {
      var s = pinRow();
      var p = AS.addPattern(s.m, 'linear', [s.pin], { direction: { axis: 'x' }, spacing: 30, count: 3 });
      var cap = AS.insert(s.m, { script: 'p.name("Cap"); p.cylinder(6, 4);' }, { position: [0, 50, 0] }).id;
      var i2 = s.m.components.filter(function (c) { return c.pattern === p.id; })[1];
      AS.addMate(s.m, 'concentric', { component: cap, cylinder: [6, 2, 0] }, { component: i2.id, cylinder: [4, 10, 0] });
      AS.addMate(s.m, 'coincident', { component: cap, face: [1, 0, 1] }, { component: i2.id, face: [1, 20, 1] });
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      nearVec(T(s.m, cap).position, [70, 30, 10], 1e-6, 'cap on Pin<3>');
      AS.moveComponent(s.m, s.pin, [0, 0, 5]); AS.rebuild(s.m);
      nearVec(T(s.m, cap).position, [70, 30, 15], 1e-6, 'cap follows the seed through the instance');
      AS.setPatternValues(s.m, p, { count: 2 }); b = AS.rebuild(s.m);
      assert(s.m.components.filter(function (c) { return c.pattern === p.id; }).length === 1 && s.m.mates.length === 1, 'instance and its mates removed: ' + s.m.mates.length);
      noAsmErrors(b);
    });
    test('patterns: deleting the seed deletes the instances and the pattern; removePattern keeps the seed; bad values are errors on the pattern', function () {
      var s = pinRow();
      var p = AS.addPattern(s.m, 'linear', [s.pin], { direction: { axis: 'x' }, spacing: 30, count: 3 });
      assert(AS.removePattern(s.m, p.id) && s.m.components.length === 2 && !s.m.patterns.length, 'removePattern');
      p = AS.addPattern(s.m, 'linear', [s.pin], { direction: { axis: 'x' }, spacing: 30, count: 3 });
      AS.removeComponent(s.m, s.pin);
      assert(s.m.components.length === 1 && !s.m.patterns.length, 'seed delete: ' + s.m.components.map(function (c) { return c.name; }).join());
      var t = pinRow();
      var c = AS.addPattern(t.m, 'circular', [t.pin], { axis: { component: t.base, face: [50, 10, 30] }, angle: 90, count: 2 });
      var b = AS.rebuild(t.m);
      assert(b.errors[c.id] === 'Pattern axis must be a cylindrical face or an axis', b.errors[c.id]);
      AS.setPatternValues(t.m, c, { axis: { axis: 'y' }, count: 0 }); b = AS.rebuild(t.m);
      assert(/Number of instances must be a whole number/.test(b.errors[c.id]), b.errors[c.id]);
      var threw = false; try { AS.addPattern(t.m, 'mirror', [t.m.components[0].id, 'Nope<1>'], {}); } catch (e) { threw = /Unknown component/.test(e.message); }
      assert(threw, 'unknown seed');
    });
    test('patterns: script round trip (linearPattern / circularPattern / mirrorComponents) keeps names, order and transforms', function () {
      var s = pinRow();
      AS.addPattern(s.m, 'linear', [s.pin], { direction: { component: s.base, face: [100, 5, 30] }, spacing: 25, count: 3, reverse: true });
      AS.addPattern(s.m, 'circular', [s.pin], { axis: { axis: 'y' }, angle: 45, count: 2 });
      AS.addPattern(s.m, 'mirror', [s.pin], { plane: { component: s.base, face: [50, 5, 60] } });
      AS.rebuild(s.m);
      var gen = AS.generateScript(s.m);
      assert(/a\.linearPattern\(\[c2\], \{ name: "LocalLPattern1", direction: .*reverse: true/.test(gen) && gen.indexOf('a.circularPattern(') > 0 && gen.indexOf('a.mirrorComponents(') > 0, gen);
      var m2 = AS.newAssembly(); AS.runScript(m2, gen); var b2 = AS.rebuild(m2);
      noAsmErrors(b2);
      assert(m2.components.map(function (c) { return c.name; }).join() === s.m.components.map(function (c) { return c.name; }).join(), m2.components.map(function (c) { return c.name; }).join());
      s.m.components.forEach(function (c, i) { nearVec(m2.components[i].transform.position, c.transform.position, 1e-9, c.name); });
      nearVec(T(s.m, 'Pin<3>').position, [-40, 10, 10], 1e-9, 'reversed direction');
      nearVec(T(s.m, 'Pin<5>').position, [10, 10, 110], 1e-9, 'mirrored in the back face (z = 60)');
    });

    // ---- Exploded View
    function exploded() {
      var s = pinRow();
      var blk = AS.insert(s.m, { script: BLOCK }, { position: [60, 10, 20] }).id;
      AS.addMate(s.m, 'coincident', BOTTOM(blk), TOP(s.base));
      var s1 = AS.addExplodeStep(s.m, null, [s.pin], 'y', 30);
      var s2 = AS.addExplodeStep(s.m, 'ExplView1', [blk, s.pin], [2, 0, 0], 10);
      return { m: s.m, base: s.base, pin: s.pin, blk: blk, s1: s1, s2: s2 };
    }
    test('Exploded View: two steps (Pin up 30, then Block and Pin +x 10); offsets add, explode lines per step, transforms stay collapsed', function () {
      var s = exploded(), v = s.m.explodedViews[0];
      assert(v.name === 'ExplView1' && s.s1.name === 'Explode Step1' && s.s2.name === 'Explode Step2', v.name + ' ' + s.s1.name + ' ' + s.s2.name);
      nearVec(s.s2.direction, [1, 0, 0], 1e-12, 'direction normalised');
      var c0 = AS.rebuild(s.m);
      assert(c0.explode === null, 'collapsed');
      var vol0 = K.massProps(K.meshFromBody(c0.body), 1).volume;
      AS.setExploded(s.m, true);
      var b = AS.rebuild(s.m, c0.cache);
      noAsmErrors(b);
      nearVec(b.explode.offsets[s.pin], [10, 30, 0], 1e-12, 'pin offset'); nearVec(b.explode.offsets[s.blk], [10, 0, 0], 1e-12, 'block offset');
      assert(b.explode.offsets[s.base] == null, 'base does not move');
      nearVec(T(s.m, s.pin).position, [10, 10, 10], 1e-9, 'pin transform collapsed');
      assert(b.explode.lines.length === 3, 'lines ' + b.explode.lines.length);
      var pc = AS.transformPoint(T(s.m, s.pin), [0, 10, 0]);
      nearVec(b.explode.lines[0].from, pc, 1e-9, 'line 1 from the pin centre'); nearVec(b.explode.lines[0].to, [pc[0], pc[1] + 30, pc[2]], 1e-9, 'line 1 to');
      nearVec(b.explode.lines[2].from, [pc[0], pc[1] + 30, pc[2]], 1e-9, 'pin line 2 starts where line 1 ended');
      var bb = K.massProps(K.meshFromBody(b.bodies[1]), 1).bbox;
      nearVec(bb.min, [16, 40, 6], 1e-9, 'pin body exploded (10 + 10 − 4, 10 + 30, 10 − 4)');
      nearRel(K.massProps(K.meshFromBody(b.body), 1).volume, vol0, 1e-12, 'volume unchanged');
      var hb = AS.explodedBodies(s.m, b);
      near(K.massProps(K.meshFromBody(hb[1]), 1).bbox.min[1], 40, 1e-9, 'explodedBodies hook (drawings)');
    });
    test('Exploded View animation: t = 0.25 is half of step 1, t = 0.75 is step 1 and half of step 2; collapse; a pick in the exploded view maps to the collapsed part', function () {
      var s = exploded();
      AS.setExploded(s.m, 'ExplView1');
      var b = AS.rebuild(s.m, null, { explodeT: 0.25 });
      nearVec(b.explode.offsets[s.pin], [0, 15, 0], 1e-12, 't 0.25');
      b = AS.rebuild(s.m, b.cache, { explodeT: 0.75 });
      nearVec(b.explode.offsets[s.pin], [5, 30, 0], 1e-12, 't 0.75'); nearVec(b.explode.offsets[s.blk], [5, 0, 0], 1e-12, 't 0.75 block');
      b = AS.rebuild(s.m, b.cache);
      var mesh = K.meshFromBody(b.body), fi = -1;
      mesh.faces.forEach(function (f, i) { if (fi < 0 && f.body === 1 && f.normal[1] > 0.99) fi = i; });   // the pin's top
      var ref = AS.refFromPick(s.m, b, fi, [20, 60, 10], mesh);   // the pin top (y = 30) moved by [10, 30, 0]
      assert(ref && ref.component === s.pin && ref.face, JSON.stringify(ref));
      nearVec(ref.face, [0, 20, 0], 1e-9, 'local pick point');
      AS.setExploded(s.m, false); b = AS.rebuild(s.m, b.cache);
      assert(b.explode === null && s.m.exploded == null, 'collapsed');
    });
    test('Exploded View editing: bad direction / distance throw, deleting a component drops it from the steps (an empty step goes), script round trip', function () {
      var s = exploded(), threw = 0;
      try { AS.addExplodeStep(s.m, null, [s.pin], [0, 0, 0], 5); } catch (e) { if (/Explode direction/.test(e.message)) threw++; }
      try { AS.addExplodeStep(s.m, null, [s.pin], 'y', 'far'); } catch (e) { if (/Explode distance/.test(e.message)) threw++; }
      assert(threw === 2, 'errors ' + threw);
      AS.setExploded(s.m, true);
      var gen = AS.generateScript(s.m);
      assert(gen.indexOf('a.explode([c2], [0, 1, 0], 30, { view: "ExplView1", name: "Explode Step1" });') >= 0 && gen.indexOf('a.exploded("ExplView1");') >= 0, gen);
      var m2 = AS.newAssembly(); AS.runScript(m2, gen); var b2 = AS.rebuild(m2);
      noAsmErrors(b2);
      assert(JSON.stringify(m2.explodedViews[0].steps.map(function (x) { return [x.name, x.direction, x.distance]; })) === JSON.stringify(s.m.explodedViews[0].steps.map(function (x) { return [x.name, x.direction, x.distance]; })), 'steps');
      nearVec(b2.explode.offsets[AS.findComponent(m2, 'Pin<1>').id], [10, 30, 0], 1e-12, 'exploded after the round trip');
      AS.removeComponent(s.m, s.pin);
      var v = s.m.explodedViews[0];
      assert(v.steps.length === 1 && v.steps[0].components.join() === String(s.blk), JSON.stringify(v.steps));
      assert(AS.removeExplodeStep(s.m, v.steps[0].id) && !v.steps.length, 'removeExplodeStep');
      assert(AS.removeExplodedView(s.m, v.id) && !s.m.explodedViews.length && s.m.exploded == null, 'removeExplodedView');
    });
    test('Gear train and patterns example: BOM counts pattern instances (Dot Pin 3, Pin 5), three explode steps', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Gear train and patterns'; })[0];
      assert(ex, 'example');
      var r = buildAsm(ex.code);
      noAsmErrors(r.build);
      if (typeof Drawing !== 'undefined' && Drawing.bomRows) {
        var rows = Drawing.bomRows(r.model, r.mesh), q = {};
        rows.forEach(function (row) { q[row.partNumber] = row.qty; });
        assert(q['Dot Pin'] === 3 && q.Pin === 5 && q.Base === 1 && rows.length === 7, JSON.stringify(q));
      }
      assert(r.model.patterns.length === 3 && r.model.explodedViews[0].steps.length === 3, 'patterns / steps');
      AS.setExploded(r.model, true);
      var b = AS.rebuild(r.model, r.build.cache);
      nearVec(b.explode.offsets[AS.findComponent(r.model, 'Dot Pin<3>').id], [0, 20, 0], 1e-12, 'pattern instance exploded with its gear');
      return r.model.components.length + ' components, ' + r.model.mates.length + ' mates';
    });
  })();

