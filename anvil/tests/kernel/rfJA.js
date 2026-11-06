  // --- rfJA (2026-11-05, lane asmmates) --- Profile Center mate (SolidWorks 2024 Advanced Mates: a rectangular or circular
  // profile centred on another, Offset distance, Flip, Lock rotation); Symmetric refused when both entities are on one
  // side of the symmetry plane (SolidWorks: "both on the same side", test-reports 2026-11-02 item 13d); Rotate
  // Component stopped at first contact (Assembly.collisionStep).
  (function () {
    group('rfJA: Profile Center, Symmetric one-side refusal, Rotate collision stop');
    if (typeof Assembly === 'undefined') { test('assembly.js loads', function () { fail('Assembly is not defined'); }); return; }
    var AS = Assembly;
    function noErr(b) { var ids = Object.keys(b.errors); if (ids.length) fail('assembly errors: ' + ids.map(function (id) { return id + ': ' + b.errors[id]; }).join(' | ')); }
    function st(b, id) { return b.components.filter(function (c) { return c.id === id; })[0]; }
    function T(m, id) { return AS.findComponent(m, id).transform; }
    function ry(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
    function rt(m) { var m2 = AS.newAssembly(); AS.runScript(m2, AS.generateScript(m)); m2 = JSON.parse(JSON.stringify(m2)); noErr(AS.rebuild(m2)); return m2; }
    var BASE = 'p.name("Base"); p.box(200, 100, 10);';           // top face y 10, centre (100, 10, 50)
    var BAR = 'p.name("Bar"); p.box(40, 20, 10);';               // bottom face y 0, centre (20, 0, 10), long along x
    var DISC = 'p.name("Disc"); p.cylinder(10, 5);';             // bottom face y 0, centre (0, 0, 0)
    function pc(src, opts, rot, face) {
      var m = AS.newAssembly();
      var base = AS.insert(m, { script: BASE }, { fixed: true }).id;
      var c = AS.insert(m, { script: src }, { position: [30, 40, 7], rotation: rot || ry(20) }).id;
      var mt = AS.addMate(m, 'profilecenter', { component: base, face: [50, 10, 50] }, { component: c, face: face || [5, 0, 5] }, opts || {});
      var b = AS.rebuild(m);
      noErr(b);
      return { m: m, b: b, c: c, mt: mt };
    }
    test('rfJA: Profile Center: a 40 x 20 bar\'s bottom profile centred on the plate\'s top, faces touching; it keeps its turn, 1 DOF (spin)', function () {
      var s = pc(BAR);
      assert(s.mt.name === 'ProfileCenter1' && AS.defaultAlignment(s.mt) === 'anti-aligned', s.mt.name);
      var R = T(s.m, s.c).rotation, ctr = AS.transformPoint(T(s.m, s.c), [20, 0, 10]);
      near(ctr[0], 100, 1e-6, 'centre x'); near(ctr[1], 10, 1e-6, 'on the plate'); near(ctr[2], 50, 1e-6, 'centre z');
      near(Math.atan2(R[2], R[0]) * 180 / Math.PI, 20, 1e-4, 'turn kept');
      assert(st(s.b, s.c).dof === 1, 'dof ' + st(s.b, s.c).dof);
    });
    test('rfJA: Profile Center with Lock rotation: the bar\'s long sides turn parallel to the plate\'s (20° -> 0°), 0 DOF; Offset 5 lifts it; round trip keeps offset and lock', function () {
      var s = pc(BAR, { lock: true, offset: 5 });
      var R = T(s.m, s.c).rotation, ctr = AS.transformPoint(T(s.m, s.c), [20, 0, 10]);
      near(Math.atan2(R[2], R[0]) * 180 / Math.PI, 0, 1e-5, 'long sides parallel');
      near(ctr[0], 100, 1e-6, 'centre x'); near(ctr[1], 15, 1e-6, 'offset 5 above'); near(ctr[2], 50, 1e-6, 'centre z');
      assert(st(s.b, s.c).dof === 0, 'dof ' + st(s.b, s.c).dof);
      var m2 = rt(s.m), x = m2.mates[0];
      assert(x.type === 'profilecenter' && x.lock === true && x.offset === 5 && x.phase && x.phase[0] === 0, JSON.stringify(x));
      near(AS.transformPoint(m2.components[1].transform, [20, 0, 10])[1], 15, 1e-6, 'after the round trip');
      var sc = AS.generateScript(s.m);
      assert(/lock: true/.test(sc) && AS.isAssemblyScript('a.profileCenter(f, g, { lock: true });'), sc);
    });
    test('rfJA: Profile Center: a circular profile (a disc\'s end) on the plate centre; Flip with an Offset puts it below the face; a cylindrical pick is refused in plain words', function () {
      var s = pc(DISC, null, null, [3, 0, 3]);
      var p = AS.transformPoint(T(s.m, s.c), [0, 0, 0]);
      near(p[0], 100, 1e-6, 'x'); near(p[1], 10, 1e-6, 'y'); near(p[2], 50, 1e-6, 'z');
      var f = pc(BAR, { offset: 2, flip: true });
      near(AS.transformPoint(T(f.m, f.c), [20, 0, 10])[1], 8, 1e-6, 'Flip: 2 below the top face');
      var m = AS.newAssembly(), base = AS.insert(m, { script: BASE }, { fixed: true }).id, d = AS.insert(m, { script: DISC }, { position: [30, 40, 7] }).id;
      var bad = AS.addMate(m, 'profilecenter', { component: base, face: [50, 10, 50] }, { component: d, cylinder: [10, 2, 0] });
      assert(/Profile Center needs two planar faces/.test(AS.rebuild(m).errors[bad.id] || ''), 'refused');
      assert(AS.MATE_GROUPS.advanced[0] === 'profilecenter', 'first of the Advanced Mates, as SolidWorks');
      var pr = AS.faceProfile ? true : false;
      assert(pr, 'faceProfile exported');
    });
    test('rfJA: Symmetric with both faces on one side of the symmetry plane is refused (SolidWorks), the part is not moved across', function () {
      var BLOCK = 'p.name("Block"); p.box(20, 20, 20);';
      var m = AS.newAssembly();
      var a = AS.insert(m, { script: BLOCK }, { position: [30, 0, 0], fixed: true }).id;
      var b = AS.insert(m, { script: BLOCK }, { position: [70, 3, 5] }).id;
      var mt = AS.addMate(m, 'symmetric', { component: a, face: [0, 10, 10] }, { component: b, face: [20, 10, 10] }, { a2: { plane: 'Right' } });
      var r = AS.rebuild(m);
      assert(/both on the same side of the symmetry plane/.test(r.errors[mt.id] || ''), JSON.stringify(r.errors));
      near(T(m, b).position[0], 70, 1e-9, 'not moved across');
      // across the plane it still mates
      AS.findComponent(m, b).transform.position = [-70, 3, 5];
      r = AS.rebuild(m);
      noErr(r);
      near(T(m, b).position[0], -50, 1e-7, 'mirrored');
    });
    test('rfJA: Rotate Component with Collision Detection: a 60 bar turned 90° towards a wall stops at first contact (its far corner on the wall face)', function () {
      var m = AS.newAssembly();
      AS.insert(m, { script: BASE }, { fixed: true });
      AS.insert(m, { script: 'p.name("Wall"); p.box(10, 100, 40);' }, { fixed: true, position: [100, 10, 0] });
      var bar = AS.insert(m, { script: 'p.name("Bar"); p.box(60, 10, 10);' }, { position: [75, 10, 80], rotation: ry(90) }).id;   // along z, centre (80, 15, 50)
      AS.addMate(m, 'coincident', { component: 1, face: [50, 10, 50] }, { component: bar, face: [30, 0, 5] });
      var b = AS.rebuild(m);
      noErr(b);
      var prev = {};
      m.components.forEach(function (c) { prev[c.id] = JSON.parse(JSON.stringify(c.transform)); });
      var ctr = AS.componentCenter(m, b, bar);
      AS.rotateComponent(m, bar, 'y', -90, ctr);
      var r = AS.collisionStep(m, b.cache, prev);
      assert(r.collision.hit && r.collision.stopped && r.collision.t < 1, JSON.stringify({ hit: r.collision.hit, t: r.collision.t }));
      var Tb = T(m, bar), xmax = -Infinity;
      [[0, 0, 0], [60, 0, 0], [0, 0, 10], [60, 0, 10]].forEach(function (q) { xmax = Math.max(xmax, AS.transformPoint(Tb, q)[0]); });
      assert(xmax <= 100.05 && xmax > 99.9, 'far corner at the wall face x 100 (to the overlap volume tolerance): ' + xmax);
      assert(!AS.collision(m, r, [bar]).hit, 'no overlap where it stopped');
      near(AS.transformPoint(Tb, [30, 0, 5])[1], 10, 1e-6, 'still on the plate');
      var c2 = AS.componentCenter(m, r, bar);
      near(c2[0], 80, 1e-6, 'turned about its centre: x'); near(c2[2], 50, 1e-6, 'z');
    });
  })();
