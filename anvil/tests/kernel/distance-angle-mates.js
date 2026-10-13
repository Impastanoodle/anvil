  // ------------------------------------------------------------------ Distance / Angle mates, offsets, Move / Rotate, Interference (run cloud-2026-09-25e)
  // Base 100 × 10 × 60 (x ∈ [0,100], y ∈ [0,10], z ∈ [0,60]) fixed; Block p.box(20, 20, 20) = [0,20]³ locally;
  // Bar p.box(40, 10, 4): x ∈ [0,40], y ∈ [0,4], z ∈ [0,10].
  group('assembly mates & interference');
  if (typeof Assembly === 'undefined') {
    test('assembly.js loads', function () { fail('Assembly is not defined'); });
  } else (function () {
    var AS = Assembly;
    var BASE = 'p.name("Base"); p.box(100, 60, 10);', BLOCK = 'p.name("Block"); p.box(20, 20, 20);', BAR = 'p.name("Bar"); p.box(40, 10, 4);';
    var PIN = 'p.name("Pin"); p.cylinder(4, 20);';
    var TILT = [0.965926, -0.258819, 0, 0.258819, 0.965926, 0, 0, 0, 1];
    var I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    function ry(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
    function nearRot(a, b, tol, label) { for (var i = 0; i < 9; i++) near(a[i], b[i], tol, (label || 'rotation') + '[' + i + ']'); }
    function noAsmErrors(b) { var ids = Object.keys(b.errors); if (ids.length) fail('assembly errors: ' + ids.map(function (id) { return id + ': ' + b.errors[id]; }).join(' | ')); }
    function st(b, id) { return b.components.filter(function (c) { return c.id === id; })[0]; }
    // base (fixed) + a block dropped in tilted
    function baseBlock(pos) {
      var m = AS.newAssembly();
      var base = AS.insert(m, { script: BASE });
      var block = AS.insert(m, { script: BLOCK }, { position: pos || [5, 40, 5], rotation: TILT.slice() });
      return { m: m, base: base.id, block: block.id };
    }
    var BOTTOM = function (id) { return { component: id, face: [10, 0, 10] }; }, TOP = function (id) { return { component: id, face: [50, 10, 30] }; };
    var LEFT_B = function (id) { return { component: id, face: [0, 10, 10] }; }, LEFT = function (id) { return { component: id, face: [0, 5, 30] }; };
    var FRONT_B = function (id) { return { component: id, face: [10, 10, 0] }; }, FRONT = function (id) { return { component: id, face: [50, 5, 0] }; };
    // three plane mates: bottom to top (type / value under test), left faces flush, front faces flush
    function placed(type, opts) {
      var s = baseBlock();
      s.mate = AS.addMate(s.m, type, BOTTOM(s.block), TOP(s.base), opts);
      AS.addMate(s.m, 'coincident', LEFT_B(s.block), LEFT(s.base), { alignment: 'aligned' });
      AS.addMate(s.m, 'coincident', FRONT_B(s.block), FRONT(s.base), { alignment: 'aligned' });
      s.b = AS.rebuild(s.m);
      return s;
    }
    // the bar lying on the base top, hinged about the base's Y axis, Angle mate between the side faces
    function hinged(deg, opts) {
      var m = AS.newAssembly();
      var base = AS.insert(m, { script: BASE }).id, bar = AS.insert(m, { script: BAR }, { position: [60, 30, 20] }).id;
      AS.addMate(m, 'coincident', { component: bar, face: [20, 0, 5] }, TOP(base));
      AS.addMate(m, 'concentric', { component: bar, axis: 'y' }, { component: base, axis: 'y' });
      var mt = AS.addMate(m, 'angle', { component: bar, face: [20, 2, 0] }, FRONT(base), Object.assign({ angle: deg }, opts || {}));
      return { m: m, base: base, bar: bar, mate: mt, b: AS.rebuild(m) };
    }

    test('Distance 15 between the block bottom and the base top (anti-aligned faces): block 15 above, fully defined', function () {
      var s = placed('distance', { distance: 15 });
      noAsmErrors(s.b);
      nearVec(AS.findComponent(s.m, s.block).transform.position, [0, 25, 0], 1e-6, 'position');
      nearRot(AS.findComponent(s.m, s.block).transform.rotation, I3, 1e-6);
      assert(s.mate.name === 'Distance1' && s.mate.distance === 15 && s.mate.type === 'distance', JSON.stringify(s.mate));
      assert(AS.defaultAlignment(s.mate) === 'anti-aligned', 'face–face Distance defaults to anti-aligned');
      assert(st(s.b, s.block).dof === 0 && !st(s.b, s.block).underDefined, 'dof ' + st(s.b, s.block).dof);
      near(s.b.mates[s.mate.id].residual, 0, 1e-6, 'residual');
    });
    test('Distance with Flip dimension puts the block on the other side of the top face (y = 10 − 15)', function () {
      var s = placed('distance', { distance: 15, flip: true });
      noAsmErrors(s.b);
      nearVec(AS.findComponent(s.m, s.block).transform.position, [0, -5, 0], 1e-6, 'position');
      assert(s.mate.flip === true, 'flip stored');
    });
    test('Distance 0 is the same placement as Coincident', function () {
      var a = placed('distance', { distance: 0 }), b = placed('coincident');
      noAsmErrors(a.b); noAsmErrors(b.b);
      nearVec(AS.findComponent(a.m, a.block).transform.position, AS.findComponent(b.m, b.block).transform.position, 1e-6, 'same position');
      nearVec(AS.findComponent(a.m, a.block).transform.position, [0, 10, 0], 1e-6, 'on the top');
    });
    test('Coincident offset 7 (and flipped) = Distance 7; offset 0 is not stored', function () {
      var a = placed('coincident', { offset: 7 }), b = placed('coincident', { offset: 7, flip: true }), c = placed('coincident', { offset: 0, flip: true });
      noAsmErrors(a.b); noAsmErrors(b.b);
      near(AS.findComponent(a.m, a.block).transform.position[1], 17, 1e-6, 'offset 7');
      near(AS.findComponent(b.m, b.block).transform.position[1], 3, 1e-6, 'offset 7 flipped');
      assert(c.mate.offset == null && c.mate.flip == null, 'offset 0 / flip dropped: ' + JSON.stringify(c.mate));
    });
    test('Distance between origin / component planes: the block Top plane 12 above the assembly Top plane leaves 3 DOF', function () {
      var s = baseBlock();
      var mt = AS.addMate(s.m, 'distance', { plane: 'Top' }, { component: s.block, plane: 'Top' }, { distance: 12 });
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      var c = AS.findComponent(s.m, s.block);
      near(c.transform.position[1], 12, 1e-6, 'y');
      near(c.transform.rotation[4], 1, 1e-9, 'block +Y stays up (aligned planes)');
      assert(st(b, s.block).dof === 3, 'dof ' + st(b, s.block).dof);
      assert(AS.defaultAlignment(mt) === 'aligned', 'planes default to aligned');
    });
    test('Distance / Angle / offset errors: negative distance, angle out of range, a cylinder in a Distance, negative offset', function () {
      var s = baseBlock();
      var d = AS.addMate(s.m, 'distance', BOTTOM(s.block), TOP(s.base), { distance: -3 });
      var g = AS.addMate(s.m, 'angle', BOTTOM(s.block), TOP(s.base), { angle: 200 });
      var o = AS.addMate(s.m, 'coincident', BOTTOM(s.block), TOP(s.base), { offset: -1 });
      var pin = AS.insert(s.m, { script: PIN }).id;
      var c = AS.addMate(s.m, 'distance', { component: pin, cylinder: [4, 10, 0] }, TOP(s.base), { distance: 5 });
      var b = AS.rebuild(s.m);
      assert(/Distance must be a number ≥ 0/.test(b.errors[d.id]), 'distance: ' + b.errors[d.id]);
      assert(/Angle must be between 0° and 180°/.test(b.errors[g.id]), 'angle: ' + b.errors[g.id]);
      assert(/Offset must be a number ≥ 0/.test(b.errors[o.id]), 'offset: ' + b.errors[o.id]);
      assert(/Distance needs two planar faces or planes/.test(b.errors[c.id]), 'cylinder: ' + b.errors[c.id]);
    });
    test('Distance that contradicts a Coincident on the same faces is rejected, the Coincident kept', function () {
      var s = baseBlock();
      var c = AS.addMate(s.m, 'coincident', BOTTOM(s.block), TOP(s.base));
      var d = AS.addMate(s.m, 'distance', BOTTOM(s.block), TOP(s.base), { distance: 4 });
      var b = AS.rebuild(s.m);
      assert(!b.errors[c.id], 'coincident ok');
      assert(/cannot be satisfied/.test(b.errors[d.id] || ''), 'distance error: ' + b.errors[d.id]);
      near(AS.findComponent(s.m, s.block).transform.position[1], 10, 1e-6, 'block stays on the top');
    });
    test('Angle 30° on a hinged bar: Ry(−30°), fully defined; Flip dimension gives Ry(+30°)', function () {
      var h = hinged(30);
      noAsmErrors(h.b);
      var c = AS.findComponent(h.m, h.bar);
      nearVec(c.transform.position, [0, 10, 0], 1e-6, 'position');
      nearRot(c.transform.rotation, ry(-30), 1e-6, 'Ry(-30)');
      assert(st(h.b, h.bar).dof === 0, 'dof ' + st(h.b, h.bar).dof);
      assert(h.mate.name === 'Angle1' && h.mate.angle === 30 && AS.defaultAlignment(h.mate) === 'aligned', JSON.stringify(h.mate));
      var f = hinged(30, { flip: true });
      noAsmErrors(f.b);
      nearRot(AS.findComponent(f.m, f.bar).transform.rotation, ry(30), 1e-6, 'Ry(+30)');
      // toggling flip on a solved model moves it across, and a second rebuild keeps it there
      h.mate.flip = true; noAsmErrors(AS.rebuild(h.m));
      nearRot(AS.findComponent(h.m, h.bar).transform.rotation, ry(30), 1e-6, 'after flip');
      AS.rebuild(h.m);
      nearRot(AS.findComponent(h.m, h.bar).transform.rotation, ry(30), 1e-9, 'stable after a second rebuild');
    });
    test('Angle 0°, 90° and 180° on the hinged bar; the far bar end lands where the angle says', function () {
      [[0, ry(0)], [90, ry(-90)], [180, ry(180)], [135, ry(-135)]].forEach(function (c) {
        var h = hinged(c[0]);
        noAsmErrors(h.b);
        var T = AS.findComponent(h.m, h.bar).transform;
        nearRot(T.rotation, c[1], 1e-6, c[0] + '°');
        var a = c[0] * Math.PI / 180;
        nearVec(AS.transformPoint(T, [40, 0, 0]), [40 * Math.cos(a), 10, 40 * Math.sin(a)], 1e-6, c[0] + '° bar end');
        assert(st(h.b, h.bar).dof === 0, c[0] + '°: dof ' + st(h.b, h.bar).dof);
      });
    });
    test('Angle alone on a free block removes one rotation (5 DOF); the 3D angle between the faces is 40°', function () {
      var s = baseBlock([30, 40, 20]);
      var mt = AS.addMate(s.m, 'angle', FRONT_B(s.block), FRONT(s.base), { angle: 40 });
      var b = AS.rebuild(s.m);
      noAsmErrors(b);
      assert(st(b, s.block).dof === 5, 'dof ' + st(b, s.block).dof);
      var A = AS.resolveRef(s.m, b.partBuilds, mt.a), B = AS.resolveRef(s.m, b.partBuilds, mt.b);
      near(Math.acos(Math.max(-1, Math.min(1, A.normal[0] * B.normal[0] + A.normal[1] * B.normal[1] + A.normal[2] * B.normal[2]))) * 180 / Math.PI, 40, 1e-6, 'angle');
    });
    test('Angle between two axes: a pin at 45° to the assembly Y axis, standing on the Top plane', function () {
      var m = AS.newAssembly();
      AS.insert(m, { script: BASE });
      var pin = AS.insert(m, { script: PIN }, { position: [30, 20, 30] }).id;
      AS.addMate(m, 'concentric', { component: pin, axis: 'z' }, { axis: 'z' });
      var mt = AS.addMate(m, 'angle', { component: pin, axis: 'y' }, { axis: 'y' }, { angle: 45 });
      var b = AS.rebuild(m);
      noAsmErrors(b);
      var d = AS.transformDir(AS.findComponent(m, pin).transform, [0, 1, 0]);
      near(d[1], Math.SQRT1_2, 1e-6, 'cos 45° with +Y'); near(d[2], 0, 1e-6, 'stays in the XY plane');
      assert(st(b, pin).dof === 1, 'slides along Z: dof ' + st(b, pin).dof);
      assert(b.mates[mt.id].ok, 'angle ok');
    });
    test('Conflicting Angle mates: the second is rejected', function () {
      var h = hinged(30);
      var m2 = AS.addMate(h.m, 'angle', { component: h.bar, face: [20, 2, 0] }, FRONT(h.base), { angle: 60 });
      var b = AS.rebuild(h.m);
      assert(!b.errors[h.mate.id], 'first ok');
      assert(/cannot be satisfied/.test(b.errors[m2.id] || ''), 'second: ' + b.errors[m2.id]);
      nearRot(AS.findComponent(h.m, h.bar).transform.rotation, ry(-30), 1e-6, 'keeps 30°');
    });
    test('Builder a.distance / a.angle and generateScript round trip distance, angle, offset and flip', function () {
      var m = AS.newAssembly();
      AS.runScript(m, [
        'var base = a.insert({ script: \'' + BASE + '\' });',
        'var blk = a.insert({ script: \'' + BLOCK + '\' }, { position: [5, 40, 5] });',
        'a.distance({ component: blk, face: [10, 0, 10] }, { component: base, face: [50, 10, 30] }, 15, { name: "Gap" });',
        'a.coincident({ component: blk, face: [0, 10, 10] }, { component: base, face: [0, 5, 30] }, { alignment: "aligned", offset: 30 });',
        'a.distance({ component: blk, face: [10, 10, 20] }, { component: base, face: [50, 5, 60] }, 10, { alignment: "aligned", flip: true });',
        'var bar = a.insert({ script: \'' + BAR + '\' });',
        'a.coincident({ component: bar, face: [20, 0, 5] }, { component: base, face: [50, 10, 30] });',
        'a.concentric({ component: bar, axis: "y" }, { component: base, axis: "y" });',
        'a.angle({ component: bar, face: [20, 2, 0] }, { component: base, face: [50, 5, 0] }, 30, { flip: true });'
      ].join('\n'));
      assert(m.mates[0].name === 'Gap' && m.mates[0].distance === 15, 'distance mate: ' + JSON.stringify(m.mates[0]));
      assert(m.mates[5].type === 'angle' && m.mates[5].angle === 30 && m.mates[5].flip === true, 'angle mate: ' + JSON.stringify(m.mates[5]));
      var b = AS.rebuild(m);
      noAsmErrors(b);
      nearVec(m.components[1].transform.position, [30, 25, 50], 1e-6, 'block');
      nearRot(m.components[2].transform.rotation, ry(30), 1e-6, 'bar (flipped)');
      var code = AS.generateScript(m);
      assert(/distance: 15/.test(code) && /offset: 30/.test(code) && /angle: 30/.test(code) && /flip: true/.test(code), code);
      assert(AS.isAssemblyScript('a.distance(x, y, 3);') && AS.isAssemblyScript('asm.angle(x, y, 30);'), 'isAssemblyScript');
      var m2 = AS.newAssembly(); AS.runScript(m2, code);
      var sig = function (x) { return [x.name, x.type, x.distance, x.angle, x.offset, !!x.flip, x.alignment || AS.defaultAlignment(x)]; };
      assert(JSON.stringify(m2.mates.map(sig)) === JSON.stringify(m.mates.map(sig)), 'mates survive the round trip: ' + JSON.stringify(m2.mates.map(sig)));
      var b2 = AS.rebuild(m2);
      noAsmErrors(b2);
      m.components.forEach(function (c, i) { nearVec(m2.components[i].transform.position, c.transform.position, 1e-6, c.name); nearRot(m2.components[i].transform.rotation, c.transform.rotation, 1e-6, c.name); });
      // ids (and so the c<id> variable names) renumber on the first round trip; from then on the text is a fixed point
      var code2 = AS.generateScript(m2), m3 = AS.newAssembly(); AS.runScript(m3, code2); AS.rebuild(m3);
      assert(AS.generateScript(m3) === code2, 'generateScript is a fixed point');
    });
    test('setMateValues keeps only the keys of the mate type', function () {
      var m = { type: 'distance', distance: 5, flip: true };
      m.type = 'angle'; AS.setMateValues(m, { angle: 20 });
      assert(m.distance == null && m.angle === 20 && m.flip === true, JSON.stringify(m));
      m.type = 'concentric'; AS.setMateValues(m, {});
      assert(m.angle == null && m.flip == null, JSON.stringify(m));
      m.type = 'coincident'; AS.setMateValues(m, { offset: 2, flip: true });
      assert(m.offset === 2 && m.flip === true, JSON.stringify(m));
      assert(AS.MATE_TYPES.slice(0, 4).join() === 'coincident,concentric,distance,angle', AS.MATE_TYPES.join());
    });
    test('re-solving the solved Distance and angle mates example changes nothing (1e-9)', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Distance and angle mates'; })[0];
      var m = AS.newAssembly(); AS.runScript(m, ex.code);
      var b = AS.rebuild(m);
      noAsmErrors(b);
      var before = JSON.parse(JSON.stringify(m.components));
      AS.rebuild(m, b.cache);
      m.components.forEach(function (c, i) { nearVec(c.transform.position, before[i].transform.position, 1e-9, c.name); nearRot(c.transform.rotation, before[i].transform.rotation, 1e-9, c.name); });
      b.components.forEach(function (c) { assert(c.fixed || (c.dof === 0 && !c.underDefined), c.name + ' should be fully defined, dof ' + c.dof); });
    });

    // ---- Move / Rotate Component: change the stored transform, the rebuild re-solves (free DOF keep the move)
    function onTop() {
      var m = AS.newAssembly();
      var base = AS.insert(m, { script: BASE }).id, block = AS.insert(m, { script: BLOCK }, { position: [10, 30, 10] }).id;
      AS.addMate(m, 'coincident', BOTTOM(block), TOP(base));
      return { m: m, base: base, block: block, b: AS.rebuild(m) };
    }
    test('moveComponent: a block mated to the top slides in x and z, the mate pulls y back; 3 DOF', function () {
      var s = onTop();
      noAsmErrors(s.b);
      assert(st(s.b, s.block).dof === 3, 'dof ' + st(s.b, s.block).dof);
      nearVec(AS.findComponent(s.m, s.block).transform.position, [10, 10, 10], 1e-9, 'start');
      AS.moveComponent(s.m, s.block, [10, 5, 7]);
      nearVec(AS.findComponent(s.m, s.block).transform.position, [20, 15, 17], 1e-12, 'moved');
      noAsmErrors(AS.rebuild(s.m));
      nearVec(AS.findComponent(s.m, s.block).transform.position, [20, 10, 17], 1e-9, 'after re-solve');
    });
    test('rotateComponent: a turn about Y survives the re-solve, a tilt about X is undone; the pivot is respected', function () {
      var s = onTop();
      var ctr = AS.componentCenter(s.m, s.b, s.block);
      nearVec(ctr, [20, 20, 20], 1e-9, 'componentCenter');
      AS.rotateComponent(s.m, s.block, 'y', 90, ctr);
      nearVec(AS.componentCenter(s.m, s.b, s.block), ctr, 1e-9, 'centre stays put');
      noAsmErrors(AS.rebuild(s.m));
      nearRot(AS.findComponent(s.m, s.block).transform.rotation, ry(90), 1e-9, 'Ry(90) kept');
      nearVec(AS.componentCenter(s.m, s.b, s.block), [20, 20, 20], 1e-9, 'still centred');
      AS.rotateComponent(s.m, s.block, [1, 0, 0], 20, AS.componentCenter(s.m, s.b, s.block));
      noAsmErrors(AS.rebuild(s.m));
      var R = AS.findComponent(s.m, s.block).transform.rotation;
      nearVec([R[1], R[4], R[7]], [0, 1, 0], 1e-6, 'block +Y back up');
      near(AS.findComponent(s.m, s.block).transform.position[1], 10, 1e-6, 'back on the top');
    });
    test('moveComponent / rotateComponent refuse fixed components, unknown components and bad axes', function () {
      var s = onTop();
      var msg = function (f) { try { f(); } catch (e) { return e.message; } return 'no error'; };
      assert(/Base<1> is fixed/.test(msg(function () { AS.moveComponent(s.m, s.base, [1, 0, 0]); })), 'fixed');
      assert(/Unknown component/.test(msg(function () { AS.moveComponent(s.m, 999, [1, 0, 0]); })), 'unknown');
      assert(/Rotate needs an axis/.test(msg(function () { AS.rotateComponent(s.m, s.block, 'w', 10); })), 'axis');
      nearVec(AS.findComponent(s.m, s.base).transform.position, [0, 0, 0], 0, 'base untouched');
    });

    // ---- Interference Detection
    test('interference: a 20³ block sunk 5 into the base overlaps 20 × 5 × 20; the common body is returned', function () {
      var s = placed('coincident', { offset: 5, flip: true });
      noAsmErrors(s.b);
      var r = AS.interference(s.m, s.b);
      assert(r.pairs.length === 1 && r.checked === 1, JSON.stringify({ n: r.pairs.length, checked: r.checked }));
      var p = r.pairs[0];
      assert(p.aName === 'Base<1>' && p.bName === 'Block<1>' && p.a === s.base && p.b === s.block && p.aIndex === 0 && p.bIndex === 1, JSON.stringify({ a: p.aName, b: p.bName }));
      nearRel(p.volume, 2000, 1e-9, 'volume'); nearRel(r.volume, 2000, 1e-9, 'total');
      nearRel(p.body.volume(), 2000, 1e-9, 'body volume');
      var bb = K.massProps(K.meshFromBody(p.body), 1).bbox;
      nearVec(bb.min, [0, 5, 0], 1e-9, 'common min'); nearVec(bb.max, [20, 10, 20], 1e-9, 'common max');
    });
    test('interference: faces that only touch (Coincident) and disjoint components are not interferences', function () {
      var s = placed('coincident');
      var r = AS.interference(s.m, s.b);
      assert(r.pairs.length === 0 && r.volume === 0, JSON.stringify(r.pairs.map(function (p) { return p.volume; })));
      var t = placed('distance', { distance: 3 });
      assert(AS.interference(t.m, t.b).pairs.length === 0 && AS.interference(t.m, t.b).checked === 0, 'a gap: nothing to check');
    });
    test('interference: the Pinned plate assembly (pins in their Ø8 holes, cap seated) has none', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0];
      var r = buildAsm(ex.code);
      var x = AS.interference(r.model, r.build);
      assert(x.pairs.length === 0, x.pairs.map(function (p) { return p.aName + '/' + p.bName + ' ' + p.volume; }).join(', '));
      assert(x.checked >= 2, 'pins checked against the plate: ' + x.checked);
    });
    test('interference: Interference check example lists Base/Block 2000 and Base/Pin<2> 8·π·4², largest first; minVolume filters', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Interference check'; })[0];
      var r = buildAsm(ex.code);
      noAsmErrors(r.build);
      var x = AS.interference(r.model, r.build);
      assert(x.pairs.length === 2 && x.pairs[0].bName === 'Block<1>' && x.pairs[1].bName === 'Pin<2>', x.pairs.map(function (p) { return p.aName + '/' + p.bName; }).join(', '));
      nearRel(x.pairs[0].volume, 2000, 1e-9, 'block'); nearRel(x.pairs[1].volume, 8 * circleArea(4), 1e-9, 'pin');   // exact: the surface records (cloud-2026-09-26r)
      nearRel(x.volume, 2000 + 8 * circleArea(4), 1e-9, 'total');
      assert(AS.interference(r.model, r.build, { minVolume: 1000 }).pairs.length === 1, 'minVolume');
      assert(AS.interference(r.model).pairs.length === 2, 'rebuilds when no build is given');
    });
    test('interference: a component whose part fails to build is skipped', function () {
      var s = placed('coincident', { offset: 5, flip: true });
      AS.insert(s.m, { script: 'p.box(10, 10, 10); p.nonsense();' }, { position: [5, 5, 5] });
      var b = AS.rebuild(s.m);
      var r = AS.interference(s.m, b);
      assert(r.pairs.length === 1 && r.pairs[0].bName === 'Block<1>', r.pairs.map(function (p) { return p.aName + '/' + p.bName; }).join(', '));
    });
  })();

