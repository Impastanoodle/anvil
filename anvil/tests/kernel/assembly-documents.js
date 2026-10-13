  // ------------------------------------------------------------------ assembly documents (assembly.js)
  // Assembly model: { type: 'assembly', features: [], components: [{ id, name, source, fixed, transform }], mates, nextId }.
  // Reference geometry used below: 'Plate with bolt holes' is x ∈ [0,100], y ∈ [0,8], z ∈ [0,60] with Ø8 through holes
  // (16-gons) at x ∈ {10, 90}, z ∈ {10, 50}; the pin is p.cylinder(4, 20): a Ø8 16-gon along local +y from its origin.
  group('assembly');
  if (typeof Assembly === 'undefined') {
    test('assembly.js loads', function () { fail('Assembly is not defined (is ../assembly.js missing?)'); });
  } else (function () {
    var AS = Assembly;
    var PIN = 'p.name("Pin"); p.cylinder(4, 20);';
    var BLOCK = 'p.name("Block"); p.box(10, 10, 10);';
    // polygonal (CSG) volumes; massProps gives the exact ones, PIN_X (true curves)
    var PLATE_V = 100 * 60 * 8 - 4 * polyCircleArea(4) * 8, PIN_V = polyCircleArea(4) * 20;
    var PLATE_X = 100 * 60 * 8 - 4 * circleArea(4) * 8, PIN_X = circleArea(4) * 20;
    var I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    // row-major rotation about a unit axis by `deg` degrees (Rodrigues)
    function rot(axis, deg) {
      var l = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]);
      var x = axis[0] / l, y = axis[1] / l, z = axis[2] / l, a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
      return [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
        t * x * y + s * z, t * y * y + c, t * y * z - s * x,
        t * x * z - s * y, t * y * z + s * x, t * z * z + c];
    }
    // world = R · local + position
    function apply(T, p) {
      var R = T.rotation, q = T.position;
      return [R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + q[0], R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + q[1], R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + q[2]];
    }
    function dirOf(T, d) { var R = T.rotation; return [R[0] * d[0] + R[1] * d[1] + R[2] * d[2], R[3] * d[0] + R[4] * d[1] + R[5] * d[2], R[6] * d[0] + R[7] * d[1] + R[8] * d[2]]; }
    function nearRot(a, b, tol, label) { for (var i = 0; i < 9; i++) near(a[i], b[i], tol, (label || 'rotation') + '[' + i + ']'); }
    function isProperRotation(R) {
      var det = R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
      near(det, 1, 1e-9, 'det(R)');
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
        var d = R[i * 3] * R[j * 3] + R[i * 3 + 1] * R[j * 3 + 1] + R[i * 3 + 2] * R[j * 3 + 2];
        near(d, i === j ? 1 : 0, 1e-9, 'R·Rᵀ[' + i + '][' + j + ']');
      }
    }
    function bb(csg) { return K.massProps(K.meshFromBody(csg), 1).bbox; }
    function noAsmErrors(b) {
      var ids = Object.keys(b.errors);
      if (ids.length) fail('assembly errors: ' + ids.map(function (id) { return id + ': ' + b.errors[id]; }).join(' | '));
    }
    function comp(model, id) { return AS.findComponent(model, id); }
    // fixed plate + a floating pin dropped at an arbitrary position and rotation
    var PIN_AT = [37, -12, 55], PIN_ROT = rot([1, 2, -0.5], 73);
    function platePin() {
      var m = AS.newAssembly();
      var plate = AS.insert(m, { example: 'Plate with bolt holes' });
      var pin = AS.insert(m, { script: PIN }, { position: PIN_AT.slice(), rotation: PIN_ROT.slice() });
      return { model: m, plate: plate, pin: pin };
    }
    var HOLE_10_10 = function (plateId) { return { component: plateId, cylinder: [14, 4, 10] }; };
    var PIN_SIDE = function (pinId) { return { component: pinId, cylinder: [4, 10, 0] }; };
    var PLATE_BOTTOM = function (plateId) { return { component: plateId, face: [50, 0, 30] }; };
    var PLATE_TOP = function (plateId) { return { component: plateId, face: [50, 8, 30] }; };
    var PIN_BOTTOM = function (pinId) { return { component: pinId, face: [1, 0, 1] }; };
    // plate + pin concentric in the (10, 10) hole + flush bottoms
    function pinnedPlate() {
      var s = platePin();
      s.conc = AS.addMate(s.model, 'concentric', PIN_SIDE(s.pin.id), HOLE_10_10(s.plate.id));
      s.coin = AS.addMate(s.model, 'coincident', PIN_BOTTOM(s.pin.id), PLATE_BOTTOM(s.plate.id), { alignment: 'aligned' });
      return s;
    }
    function buildComp(b, id) { return b.components.filter(function (c) { return c.id === id; })[0]; }

    test('newAssembly: type, name, units, empty features / components / mates, nextId; isAssembly', function () {
      var m = AS.newAssembly();
      assert(m.type === 'assembly' && m.name === 'Assem1' && m.units === 'mm', JSON.stringify(m));
      assert(Array.isArray(m.features) && m.features.length === 0, 'features must be an empty array');
      assert(Array.isArray(m.components) && m.components.length === 0 && Array.isArray(m.mates) && m.mates.length === 0, 'components / mates');
      assert(m.nextId === 1, 'nextId ' + m.nextId);
      assert(AS.newAssembly('Gearbox').name === 'Gearbox', 'named assembly');
      assert(AS.isAssembly(m) === true, 'isAssembly(assembly)');
      assert(!AS.isAssembly(K.newModel('P')), 'a part is not an assembly');
      assert(!AS.isAssembly(null) && !AS.isAssembly(undefined), 'null / undefined');
      assert(JSON.stringify(JSON.parse(JSON.stringify(m))) === JSON.stringify(m), 'plain JSON');
    });
    test('insert: names Plate<1> / Plate<2> / Pin<1>, first component fixed, later ones float, ids unique', function () {
      var m = AS.newAssembly();
      var c1 = AS.insert(m, { example: 'Plate with bolt holes' });
      var c2 = AS.insert(m, 'Plate with bolt holes');  // a string source is an example name
      var c3 = AS.insert(m, { script: PIN });
      assert(c1.name === 'Plate<1>' && c2.name === 'Plate<2>' && c3.name === 'Pin<1>', [c1.name, c2.name, c3.name].join());
      assert(c1.fixed === true && !c2.fixed && !c3.fixed, 'fixed flags ' + [c1.fixed, c2.fixed, c3.fixed].join());
      assert(c1.id !== c2.id && c2.id !== c3.id && c1.id !== c3.id, 'ids ' + [c1.id, c2.id, c3.id].join());
      assert(m.components.length === 3 && m.components[1] === c2, 'components array');
      assert(JSON.stringify(c2.source) === JSON.stringify({ example: 'Plate with bolt holes' }), 'string source stored as { example }: ' + JSON.stringify(c2.source));
      nearVec(c1.transform.position, [0, 0, 0], 0, 'default position'); nearRot(c1.transform.rotation, I3, 0, 'default rotation');
      var c4 = AS.insert(m, { script: PIN }, { name: 'Dowel', at: [1, 2, 3], fixed: true });
      assert(c4.name === 'Dowel' && c4.fixed === true, 'opts.name / opts.fixed');
      nearVec(c4.transform.position, [1, 2, 3], 0, 'opts.at alias');
      var m2 = AS.newAssembly();
      assert(AS.insert(m2, { script: PIN }, { fixed: false }).fixed === false, 'fixed: false on the first component');
      return m.components.map(function (c) { return c.name; }).join(', ');
    });
    test('findComponent by id and name; setFixed; findMate', function () {
      var s = pinnedPlate();
      assert(comp(s.model, s.pin.id) === s.pin && comp(s.model, 'Pin<1>') === s.pin, 'findComponent');
      assert(comp(s.model, 'Nope<1>') === null, 'unknown component → null');
      assert(AS.findMate(s.model, s.conc.id) === s.conc && AS.findMate(s.model, s.conc.name) === s.conc, 'findMate');
      assert(s.conc.name === 'Concentric1' && s.coin.name === 'Coincident1', 'mate names ' + s.conc.name + ', ' + s.coin.name);
      var c2 = AS.addMate(s.model, 'coincident', { component: s.pin.id, plane: 'Front' }, { plane: 'Front' }, { suppressed: true });
      assert(c2.name === 'Coincident2', 'second coincident: ' + c2.name);
      AS.setFixed(s.model, s.pin.id, true);
      assert(s.pin.fixed === true, 'setFixed true');
      AS.setFixed(s.model, s.pin.id, false);
      assert(!s.pin.fixed, 'setFixed false');
    });
    test('partModel: example, script and embedded model sources; unknown example throws', function () {
      var a = AS.partModel({ example: 'Plate with bolt holes' });
      assert(a.name === 'Plate' && a.features.length > 0 && !AS.isAssembly(a), 'example part: ' + a.name);
      var b = AS.partModel({ script: PIN });
      assert(b.name === 'Pin' && b.features.length === 2, 'script part: ' + b.name + ', ' + b.features.length + ' features');
      var src = K.newModel('Embedded'); K.runScript(src, 'p.box(5, 5, 5);');
      var c = AS.partModel({ model: src });
      assert(c.name === 'Embedded' && c.features.length === src.features.length, 'model part');
      nearRel(K.rebuild(c).body.volume(), 125, 1e-9, 'embedded part volume');
      var thrown = null;
      try { AS.partModel({ example: 'Nope' }); } catch (e) { thrown = e; }
      assert(thrown && /Unknown Design Library part "Nope"/.test(thrown.message), 'unknown example: ' + (thrown && thrown.message));
    });
    test('rebuild: bodies, bodyNames, bodyFeatures in component order; polygons and mesh faces tagged with the component index', function () {
      var s = platePin();
      var b = AS.rebuild(s.model);
      noAsmErrors(b);
      assert(b.assembly === true, 'build.assembly');
      assert(b.bodies.length === 2 && b.bodyNames.join() === 'Plate<1>,Pin<1>', 'bodyNames ' + b.bodyNames);
      assert(b.bodyFeatures[0] === s.plate.id && b.bodyFeatures[1] === s.pin.id, 'bodyFeatures ' + b.bodyFeatures);
      assert(b.body.polygons.every(function (p) { return p.body === 0 || p.body === 1; }), 'every polygon tagged 0 or 1');
      var mesh = K.meshFromBody(b.body), seen = {};
      mesh.faces.forEach(function (f) { seen[f.body] = (seen[f.body] || 0) + 1; });
      assert(seen[0] > 0 && seen[1] > 0 && Object.keys(seen).length === 2, 'mesh faces per body ' + JSON.stringify(seen));
      assert(b.components.length === 2 && b.components[1].name === 'Pin<1>' && b.components[1].index === 1, 'build.components');
      assert(b.partBuilds[s.plate.id] && b.partBuilds[s.pin.id], 'partBuilds keyed by component id');
      return mesh.faces.length + ' faces: ' + JSON.stringify(seen);
    });
    test('rebuild applies each transform: the unmated pin sits where it was inserted', function () {
      var s = platePin();
      var b = AS.rebuild(s.model);
      noAsmErrors(b);
      nearVec(s.pin.transform.position, PIN_AT, 1e-9, 'unmated position kept');
      nearRot(s.pin.transform.rotation, PIN_ROT, 1e-9, 'unmated rotation kept');
      // the pin's centroid is the image of its local centroid (0, 10, 0)
      var mp = K.massProps(K.meshFromBody(b.bodies[1]), 1);
      nearVec(mp.centroid, apply(s.pin.transform, [0, 10, 0]), 1e-6, 'pin centroid');
      nearRel(mp.volume, PIN_X, 1e-9, 'pin volume after the rigid transform');
      assert(buildComp(b, s.pin.id).dof === 6 && buildComp(b, s.pin.id).underDefined === true, 'unmated pin: 6 DOF');
    });
    test('total volume = Σ part volumes regardless of placement (overlapping components are not merged)', function () {
      var m = AS.newAssembly();
      AS.insert(m, { example: 'Plate with bolt holes' });
      AS.insert(m, { script: PIN }, { position: [50, -5, 30] });  // straight through solid plate material
      AS.insert(m, { script: PIN }, { position: [50, -5, 30] });  // and a second pin in the same place
      var b = AS.rebuild(m);
      noAsmErrors(b);
      var V = PLATE_V + 2 * PIN_V;
      nearRel(b.body.volume(), V, 1e-9, 'polygon volume');
      nearRel(K.massProps(K.meshFromBody(b.body), 1).volume, PLATE_X + 2 * PIN_X, 1e-9, 'mesh volume (exact)');
      nearRel(b.bodies[0].volume(), PLATE_V, 1e-9, 'plate body'); nearRel(b.bodies[2].volume(), PIN_V, 1e-9, 'pin<2> body');
      return 'volume ' + fmt(V);
    });
    test('concentric pin-in-hole + coincident aligned bottoms: pin at [10, 0, 10], axis +Y, 1 DOF left', function () {
      var s = pinnedPlate();
      var b = AS.rebuild(s.model);
      noAsmErrors(b);
      assert(b.mates[s.conc.id].ok && b.mates[s.coin.id].ok, 'mates ok: ' + JSON.stringify(b.mates));
      nearVec(s.pin.transform.position, [10, 0, 10], 1e-6, 'pin origin');
      nearVec(dirOf(s.pin.transform, [0, 1, 0]), [0, 1, 0], 1e-6, 'pin axis');
      isProperRotation(s.pin.transform.rotation);
      var box = bb(b.bodies[1]);
      near(box.min[1], 0, 1e-6, 'pin bottom'); near(box.max[1], 20, 1e-6, 'pin top');
      near((box.min[0] + box.max[0]) / 2, 10, 1e-6, 'pin centre x'); near((box.min[2] + box.max[2]) / 2, 10, 1e-6, 'pin centre z');
      assert(buildComp(b, s.pin.id).dof === 1, 'pin dof ' + buildComp(b, s.pin.id).dof + ' (rotation about its axis is free)');
      assert(buildComp(b, s.plate.id).dof === 0 && buildComp(b, s.plate.id).fixed === true, 'fixed plate has 0 DOF');
      nearVec(s.plate.transform.position, [0, 0, 0], 0, 'the fixed plate never moves');
      nearRel(b.body.volume(), PLATE_V + PIN_V, 1e-9, 'volume');
      return 'pin at ' + s.pin.transform.position.map(fmt).join(', ');
    });
    test('dof: concentric alone leaves 2 (slide + spin), + coincident 1, fixed 0, unmated 6', function () {
      var s = platePin();
      var conc = AS.addMate(s.model, 'concentric', PIN_SIDE(s.pin.id), HOLE_10_10(s.plate.id));
      var b = AS.rebuild(s.model);
      noAsmErrors(b);
      assert(buildComp(b, s.pin.id).dof === 2, 'concentric only: dof ' + buildComp(b, s.pin.id).dof);
      var p = s.pin.transform.position, d = dirOf(s.pin.transform, [0, 1, 0]);
      near(p[0], 10, 1e-6, 'on the hole axis x'); near(p[2], 10, 1e-6, 'on the hole axis z');
      nearVec(d, [0, 1, 0], 1e-6, 'axis (aligned by default)');
      AS.addMate(s.model, 'coincident', PIN_BOTTOM(s.pin.id), PLATE_BOTTOM(s.plate.id), { alignment: 'aligned' });
      b = AS.rebuild(s.model, b.cache);
      assert(buildComp(b, s.pin.id).dof === 1 && buildComp(b, s.pin.id).underDefined === true, 'with coincident: dof ' + buildComp(b, s.pin.id).dof);
      AS.setFixed(s.model, s.pin.id, true);
      b = AS.rebuild(s.model, b.cache);
      assert(buildComp(b, s.pin.id).dof === 0 && buildComp(b, s.pin.id).underDefined === false, 'fixed: dof ' + buildComp(b, s.pin.id).dof);
      assert(!b.errors[conc.id], 'the already satisfied mate between two fixed components is fine: ' + b.errors[conc.id]);
    });
    test('coincident face-face (default anti-aligned): a rotated block lands on the plate top, bottom face at y = 8', function () {
      var m = AS.newAssembly();
      var plate = AS.insert(m, { example: 'Plate with bolt holes' });
      var blk = AS.insert(m, { script: BLOCK }, { position: [-30, 44, 17], rotation: rot([0.3, -1, 2], 131) });
      var mate = AS.addMate(m, 'coincident', { component: blk.id, face: [5, 0, 5] }, PLATE_TOP(plate.id));
      assert(!mate.alignment || mate.alignment === 'anti-aligned', 'face-face default is anti-aligned: ' + mate.alignment);
      var b = AS.rebuild(m);
      noAsmErrors(b);
      var box = bb(b.bodies[1]);
      near(box.min[1], 8, 1e-6, 'block bottom'); near(box.max[1], 18, 1e-6, 'block top');
      nearVec(dirOf(blk.transform, [0, -1, 0]), [0, -1, 0], 1e-6, 'block bottom normal faces down');
      assert(buildComp(b, blk.id).dof === 3, 'plane-on-plane leaves 3 DOF, got ' + buildComp(b, blk.id).dof);
      return 'block y ∈ [' + fmt(box.min[1]) + ', ' + fmt(box.max[1]) + ']';
    });
    test('plane refs and assembly-origin refs: three plane mates put a floating block at the origin, unrotated', function () {
      var m = AS.newAssembly();
      var blk = AS.insert(m, { script: BLOCK }, { fixed: false, position: [12, -7, 33], rotation: rot([1, 1, 1], 40) });
      ['Front', 'Top', 'Right'].forEach(function (pl) { AS.addMate(m, 'coincident', { component: blk.id, plane: pl }, { plane: pl }); });
      var b = AS.rebuild(m);
      noAsmErrors(b);
      nearVec(blk.transform.position, [0, 0, 0], 1e-6, 'position');
      nearRot(blk.transform.rotation, I3, 1e-6, 'rotation');
      assert(buildComp(b, blk.id).dof === 0 && !blk.fixed, 'fully defined but not fixed: dof ' + buildComp(b, blk.id).dof);
      var r = AS.resolveRef(m, b.partBuilds, { plane: 'Top' });
      assert(r.kind === 'plane', 'origin Top is a plane'); nearVec(r.normal, [0, 1, 0], 1e-12, 'Top normal'); near(r.point[1], 0, 1e-12, 'Top through origin');
      var f = AS.resolveRef(m, b.partBuilds, { component: blk.id, plane: 'Front' });
      nearVec(f.normal, [0, 0, 1], 1e-6, 'component Front normal (+Z)');
    });
    test('axis refs: concentric pin axis y with the assembly X axis lays the pin along +X through the origin', function () {
      var m = AS.newAssembly();
      var pin = AS.insert(m, { script: PIN }, { fixed: false, position: [5, 6, 7], rotation: rot([0, 0, 1], 20) });
      var mate = AS.addMate(m, 'concentric', { component: pin.id, axis: 'y' }, { axis: 'x' });
      var b = AS.rebuild(m);
      noAsmErrors(b);
      assert(b.mates[mate.id].ok, 'mate ok');
      nearVec(dirOf(pin.transform, [0, 1, 0]), [1, 0, 0], 1e-6, 'pin axis');
      near(pin.transform.position[1], 0, 1e-6, 'on the X axis (y)'); near(pin.transform.position[2], 0, 1e-6, 'on the X axis (z)');
      var r = AS.resolveRef(m, b.partBuilds, { component: pin.id, cylinder: [4, 10, 0] });
      assert(r.kind === 'axis', 'cylinder resolves to an axis');
      near(Math.abs(r.dir[0]), 1, 1e-6, 'cylinder axis along X'); near(r.point[1], 0, 1e-6, 'axis point y'); near(r.point[2], 0, 1e-6, 'axis point z');
      assert(buildComp(b, pin.id).dof === 2, 'dof ' + buildComp(b, pin.id).dof);
    });
    test('alignment flip: anti-aligned concentric hangs the pin upside down from the plate top (origin [10, 8, 10], axis −Y)', function () {
      var s = platePin();
      AS.addMate(s.model, 'concentric', PIN_SIDE(s.pin.id), HOLE_10_10(s.plate.id), { alignment: 'anti-aligned' });
      // the pin's bottom face (local −Y) now points up, like the plate top: aligned
      AS.addMate(s.model, 'coincident', PIN_BOTTOM(s.pin.id), PLATE_TOP(s.plate.id), { alignment: 'aligned' });
      var b = AS.rebuild(s.model);
      noAsmErrors(b);
      nearVec(dirOf(s.pin.transform, [0, 1, 0]), [0, -1, 0], 1e-6, 'pin axis');
      nearVec(s.pin.transform.position, [10, 8, 10], 1e-6, 'pin origin');
      var box = bb(b.bodies[1]);
      near(box.min[1], -12, 1e-6, 'pin tip'); near(box.max[1], 8, 1e-6, 'pin head flush with the top');
      // plane-plane flip: Top anti-aligned with the origin Top turns the block over
      var m = AS.newAssembly();
      var blk = AS.insert(m, { script: BLOCK }, { fixed: false });
      AS.addMate(m, 'coincident', { component: blk.id, plane: 'Top' }, { plane: 'Top' }, { alignment: 'anti-aligned' });
      noAsmErrors(AS.rebuild(m));
      nearVec(dirOf(blk.transform, [0, 1, 0]), [0, -1, 0], 1e-6, 'flipped Top normal');
      near(blk.transform.position[1], 0, 1e-6, 'still on the Top plane');
    });
    test('wrong reference kinds give the documented mate errors, not exceptions', function () {
      var s = platePin();
      var c = AS.addMate(s.model, 'coincident', PIN_SIDE(s.pin.id), HOLE_10_10(s.plate.id));
      var k = AS.addMate(s.model, 'concentric', PIN_BOTTOM(s.pin.id), PLATE_BOTTOM(s.plate.id));
      var b = AS.rebuild(s.model);
      assert(b.errors[c.id] === 'Coincident needs two planar faces or planes', 'coincident: ' + b.errors[c.id]);
      assert(b.errors[k.id] === 'Concentric needs two cylindrical faces or axes', 'concentric: ' + b.errors[k.id]);
      assert(b.mates[c.id].ok === false && b.mates[c.id].error === b.errors[c.id], 'build.mates carries the error');
    });
    test('conflicting mates: the unsatisfiable one gets errors[mateId], rebuild does not throw', function () {
      var s = pinnedPlate();
      // the pin bottom cannot also lie on the top face (8 mm away, parallel)
      var bad = AS.addMate(s.model, 'coincident', PIN_BOTTOM(s.pin.id), PLATE_TOP(s.plate.id), { alignment: 'aligned' });
      var b = AS.rebuild(s.model);
      var failing = [s.conc.id, s.coin.id, bad.id].filter(function (id) { return b.errors[id]; });
      assert(failing.length >= 1, 'no mate error: ' + JSON.stringify(b.mates));
      failing.forEach(function (id) {
        assert(/cannot be satisfied|conflict|over-defined/i.test(b.errors[id]), 'message: ' + b.errors[id]);
        assert(b.mates[id].ok === false, 'mates[' + id + '].ok');
      });
      assert(b.mates[bad.id].ok === false || b.mates[s.coin.id].ok === false, 'one of the two parallel coincidents fails');
      nearVec(s.plate.transform.position, [0, 0, 0], 0, 'fixed plate never moves');
      // a mate between two refs on the fixed plate that is not satisfied is an error too
      var self = AS.addMate(s.model, 'coincident', PLATE_TOP(s.plate.id), PLATE_BOTTOM(s.plate.id), { alignment: 'aligned' });
      b = AS.rebuild(s.model, b.cache);
      assert(b.errors[self.id], 'unsatisfied mate within one component: no error');
      return failing.map(function (id) { return id + ': ' + b.errors[id]; }).join(' | ');
    });
    test('a face point on no face: mate error on rebuild, resolveRef throws a readable Error', function () {
      var s = platePin();
      var ref = { component: s.plate.id, face: [500, 500, 500] };
      var mate = AS.addMate(s.model, 'coincident', PIN_BOTTOM(s.pin.id), ref);
      var b = AS.rebuild(s.model);
      assert(typeof b.errors[mate.id] === 'string' && b.errors[mate.id].length > 0, 'errors[mate]: ' + b.errors[mate.id]);
      nearVec(s.pin.transform.position, PIN_AT, 1e-9, 'the pin stays put');
      var thrown = null;
      try { AS.resolveRef(s.model, b.partBuilds, ref); } catch (e) { thrown = e; }
      assert(thrown instanceof Error && thrown.message.length > 0, 'resolveRef should throw');
      var m2 = AS.newAssembly();
      AS.insert(m2, { script: PIN });
      m2.components[0].source = { example: 'Nope' };  // a source that stopped resolving (renamed library part)
      var b2 = AS.rebuild(m2);
      assert(b2.errors[m2.components[0].id] && b2.components[0].error, 'a bad source is a component error: ' + JSON.stringify(b2.errors));
      assert(b2.bodies.length === 1 && b2.bodies[0].polygons.length === 0, 'its body is an empty CSG');
      return thrown.message;
    });
    test('suppressed mates are ignored', function () {
      var s = platePin();
      var mate = AS.addMate(s.model, 'concentric', PIN_SIDE(s.pin.id), HOLE_10_10(s.plate.id), { suppressed: true });
      assert(mate.suppressed === true, 'suppressed stored');
      var b = AS.rebuild(s.model);
      noAsmErrors(b);
      nearVec(s.pin.transform.position, PIN_AT, 1e-9, 'pin not moved');
      nearRot(s.pin.transform.rotation, PIN_ROT, 1e-9, 'pin not rotated');
      assert(buildComp(b, s.pin.id).dof === 6, 'dof ' + buildComp(b, s.pin.id).dof);
      mate.suppressed = false;
      b = AS.rebuild(s.model, b.cache);
      near(s.pin.transform.position[0], 10, 1e-6, 'unsuppressed: pin on the axis');
    });
    test('removeComponent removes its mates; removeMate removes one', function () {
      var s = pinnedPlate();
      var other = AS.insert(s.model, { script: BLOCK });
      var m3 = AS.addMate(s.model, 'coincident', { component: other.id, face: [5, 0, 5] }, PLATE_TOP(s.plate.id));
      AS.removeMate(s.model, s.coin.id);
      assert(s.model.mates.length === 2 && !AS.findMate(s.model, s.coin.id), 'removeMate');
      AS.removeComponent(s.model, s.pin.id);
      assert(s.model.components.length === 2 && !comp(s.model, s.pin.id), 'component removed');
      assert(s.model.mates.length === 1 && s.model.mates[0] === m3, 'mates of the pin removed: ' + s.model.mates.map(function (m) { return m.name; }));
      var b = AS.rebuild(s.model);
      noAsmErrors(b);
      assert(b.bodies.length === 2 && b.bodyNames.join() === 'Plate<1>,Block<1>', 'bodies ' + b.bodyNames);
    });
    test('rebuild stability: solving an already solved model moves nothing (1e-9)', function () {
      var s = pinnedPlate();
      var b = AS.rebuild(s.model);
      noAsmErrors(b);
      var before = JSON.parse(JSON.stringify(s.model.components));
      var b2 = AS.rebuild(s.model, b.cache);
      noAsmErrors(b2);
      s.model.components.forEach(function (c, i) {
        nearVec(c.transform.position, before[i].transform.position, 1e-9, c.name + ' position');
        nearRot(c.transform.rotation, before[i].transform.rotation, 1e-9, c.name + ' rotation');
      });
      // a saved and reloaded model rebuilds to the same place too
      var copy = JSON.parse(JSON.stringify(s.model));
      noAsmErrors(AS.rebuild(copy));
      nearVec(copy.components[1].transform.position, s.pin.transform.position, 1e-9, 'reloaded pin');
    });
    test('cache: a second rebuild with the returned cache reuses the part builds', function () {
      var s = pinnedPlate();
      var b1 = AS.rebuild(s.model);
      var b2 = AS.rebuild(s.model, b1.cache);
      assert(b2.partBuilds[s.plate.id] === b1.partBuilds[s.plate.id], 'plate build not reused');
      assert(b2.partBuilds[s.pin.id] === b1.partBuilds[s.pin.id], 'pin build not reused');
      assert(b2.cache, 'build.cache');
      var b3 = AS.rebuild(s.model);
      assert(b3.partBuilds[s.plate.id] !== b1.partBuilds[s.plate.id], 'without a cache the part is rebuilt');
      nearRel(b3.body.volume(), b2.body.volume(), 1e-12, 'same result');
    });
    test('generateScript → runScript round trip: same names, fixed flags, transforms (1e-6) and volume', function () {
      var s = pinnedPlate();
      AS.insert(s.model, { script: BLOCK }, { position: [3, 4, 5], rotation: rot([0, 1, 0], 90) });
      var b = AS.rebuild(s.model);
      noAsmErrors(b);
      var script = AS.generateScript(s.model);
      assert(/a\.insert\(/.test(script) && /a\.mate\(|a\.concentric\(|a\.coincident\(/.test(script), 'script: ' + script);
      assert(AS.isAssemblyScript(script), 'isAssemblyScript(generated)');
      var m2 = AS.newAssembly();
      var builder = AS.runScript(m2, script);
      assert(builder, 'runScript returns the Builder');
      var b2 = AS.rebuild(m2);
      noAsmErrors(b2);
      assert(m2.name === s.model.name && m2.units === s.model.units, 'name / units');
      assert(m2.components.length === 3 && m2.mates.length === 2, 'counts');
      s.model.components.forEach(function (c, i) {
        var d = m2.components[i];
        assert(d.name === c.name && !!d.fixed === !!c.fixed && JSON.stringify(d.source) === JSON.stringify(c.source), 'component ' + c.name + ' vs ' + d.name);
        nearVec(d.transform.position, c.transform.position, 1e-6, c.name + ' position');
        nearRot(d.transform.rotation, c.transform.rotation, 1e-6, c.name + ' rotation');
      });
      s.model.mates.forEach(function (mt, i) { assert(m2.mates[i].type === mt.type && m2.mates[i].name === mt.name, 'mate ' + mt.name); });
      nearRel(b2.body.volume(), b.body.volume(), 1e-9, 'volume');
      return script.split('\n').length + ' lines';
    });
    test('Builder: refs by component name, coincident / concentric shortcuts, fix / float, a and asm', function () {
      var m = AS.newAssembly();
      AS.runScript(m, [
        'a.name("Bench").units("mm");',
        'var plate = a.insert("Plate with bolt holes");',
        'var pin = asm.insert({ script: \'' + PIN + '\' }, { at: [1, 2, 3] });',
        'a.concentric({ component: "Pin<1>", cylinder: [4, 10, 0] }, { component: "Plate<1>", cylinder: [94, 4, 50] });',
        'a.mate("coincident", { component: pin, face: [1, 0, 1] }, { component: plate, face: [50, 0, 30] }, { alignment: "aligned", name: "Flush" });',
        'a.float(plate); a.fix(plate);'
      ].join('\n'));
      assert(m.name === 'Bench' && m.components.length === 2 && m.mates.length === 2, 'model ' + JSON.stringify({ n: m.name, c: m.components.length, m: m.mates.length }));
      assert(typeof m.mates[0].a.component === 'number' || m.mates[0].a.component === 'Pin<1>', 'ref component stored');
      assert(m.mates[1].name === 'Flush' && m.mates[1].alignment === 'aligned', 'mate opts');
      assert(m.components[0].fixed === true, 'fix');
      var b = AS.rebuild(m);
      noAsmErrors(b);
      nearVec(m.components[1].transform.position, [90, 0, 50], 1e-6, 'pin in the (90, 50) hole');
    });
    test('isAssemblyScript tells assembly scripts from part scripts', function () {
      assert(AS.isAssemblyScript('var c = a.insert({ example: "Bushing" });') === true, 'a.insert');
      assert(AS.isAssemblyScript('asm.mate("concentric", x, y);') === true, 'asm.mate');
      assert(AS.isAssemblyScript('a.coincident(x, y)') === true && AS.isAssemblyScript('a.concentric(x, y)') === true, 'shortcuts');
      assert(AS.isAssemblyScript('p.box(10, 10, 10);') === false, 'part script');
      assert(AS.isAssemblyScript(K.generateScript(build('p.box(1, 2, 3);').model)) === false, 'generated part script');
    });
    test('refFromPick: a picked plate top face gives a face ref, a picked pin side facet a cylinder ref (local coords)', function () {
      var s = pinnedPlate();
      var b = AS.rebuild(s.model);
      noAsmErrors(b);
      var mesh = K.meshFromBody(b.body), P = mesh.positions64;
      function triCentroid(fi) {
        var k = mesh.faces[fi].start * 9;
        return [(P[k] + P[k + 3] + P[k + 6]) / 3, (P[k + 1] + P[k + 4] + P[k + 7]) / 3, (P[k + 2] + P[k + 5] + P[k + 8]) / 3];
      }
      var top = -1, side = -1;
      mesh.faces.forEach(function (f, i) {
        if (f.body === 0 && Math.abs(f.normal[1] - 1) < 1e-9 && (top < 0 || f.area > mesh.faces[top].area)) top = i;
        if (f.body === 1 && Math.abs(f.normal[1]) < 1e-6 && side < 0) side = i;
      });
      assert(top >= 0 && side >= 0, 'faces found: top ' + top + ', side ' + side);
      var pTop = triCentroid(top), rTop = AS.refFromPick(s.model, b, top, pTop, mesh);
      assert(rTop && rTop.component === s.plate.id && rTop.face && !rTop.cylinder, 'top ref: ' + JSON.stringify(rTop));
      nearVec(rTop.face, pTop, 1e-6, 'plate is at identity: local = world');
      var pSide = triCentroid(side), rSide = AS.refFromPick(s.model, b, side, pSide, mesh);
      assert(rSide && rSide.component === s.pin.id && rSide.cylinder && !rSide.face, 'side ref: ' + JSON.stringify(rSide));
      var back = apply(s.pin.transform, rSide.cylinder);
      nearVec(back, pSide, 1e-5, 'local point maps back to the picked point');
      var ax = AS.resolveRef(s.model, b.partBuilds, rSide);
      assert(ax.kind === 'axis', 'pin side resolves to an axis');
      near(Math.abs(ax.dir[1]), 1, 1e-6, 'axis vertical');
      near(ax.point[0], 10, 1e-6, 'axis x'); near(ax.point[2], 10, 1e-6, 'axis z');
      var pl = AS.resolveRef(s.model, b.partBuilds, rTop);
      assert(pl.kind === 'plane', 'top face resolves to a plane'); nearVec(pl.normal, [0, 1, 0], 1e-9, 'top normal'); near(pl.point[1], 8, 1e-9, 'top plane y');
      return JSON.stringify(rTop) + ' · ' + JSON.stringify(rSide);
    });
    test('massProps: mass = Σ volume · density with per-part densities, centroid mass-weighted, per-component rows', function () {
      var m = AS.newAssembly();
      var steel = K.newModel('Steel'); K.runScript(steel, 'p.box(10, 10, 10);'); steel.density = 7850;
      var alu = K.newModel('Alu'); K.runScript(alu, 'p.box(10, 10, 10);'); alu.density = 2700;
      AS.insert(m, { model: steel });
      AS.insert(m, { model: alu }, { position: [30, 0, 0] });
      var b = AS.rebuild(m);
      noAsmErrors(b);
      var mp = AS.massProps(m, b);
      nearRel(mp.volume, 2000, 1e-9, 'volume');
      var ms = 1000 * 7850, ma = 1000 * 2700;
      nearRel(mp.mass, ms + ma, 1e-9, 'mass');
      nearVec(mp.centroid, [(5 * ms + 35 * ma) / (ms + ma), 5, 5], 1e-6, 'mass-weighted centroid');
      nearVec(mp.bbox.min, [0, 0, 0], 1e-6, 'bbox.min'); nearVec(mp.bbox.max, [40, 10, 10], 1e-6, 'bbox.max');
      assert(mp.components.length === 2 && mp.components[0].name === 'Steel<1>' && mp.components[1].name === 'Alu<1>', 'rows');
      assert(mp.components[1].density === 2700 && mp.components[1].index === 1, 'row density / index');
      nearRel(mp.components[1].mass, ma, 1e-9, 'Alu mass'); nearVec(mp.components[1].centroid, [35, 5, 5], 1e-6, 'Alu centroid');
      nearRel(mp.area, 1200, 1e-9, 'area');
      // consistent with Kernel.massProps per body
      var km = K.massProps(K.meshFromBody(b.bodies[0]), 7850);
      nearRel(mp.components[0].mass, km.mass, 1e-9, 'same units as Kernel.massProps');
      return 'mass ' + fmt(mp.mass) + ', centroid ' + mp.centroid.map(fmt).join(', ');
    });
    test('transformPoint / inverseTransformPoint / transformDir / IDENTITY', function () {
      var T = { position: [1, 2, 3], rotation: rot([0, 0, 1], 90) };
      nearVec(AS.transformPoint(T, [1, 0, 0]), [1, 3, 3], 1e-12, 'transformPoint');
      nearVec(AS.inverseTransformPoint(T, [1, 3, 3]), [1, 0, 0], 1e-12, 'inverseTransformPoint');
      nearVec(AS.transformDir(T, [1, 0, 0]), [0, 1, 0], 1e-12, 'transformDir ignores the translation');
      nearRot(AS.IDENTITY, I3, 0, 'IDENTITY');
    });
  })();

