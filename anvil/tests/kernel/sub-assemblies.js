  // ------------------------------------------------------------------ sub-assemblies and live links (run cloud-2026-09-25o)
  // Components that are assemblies (rigid, or Flexible: their mates solved in context), mates to faces inside them
  // (path refs), BOM / mass / interference across levels, live links to the document store ({ file }), broken
  // references, Pack and Go, and nested STEP / 3MF export.
  group('assembly: sub-assemblies and live links');
  (function () {
    if (typeof Assembly === 'undefined') { test('assembly.js loads', function () { fail('Assembly is undefined'); }); return; }
    var AS = Assembly, D = AS.Documents, X = typeof Exchange !== 'undefined' ? Exchange : null;
    function I3() { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; }
    function rz(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
    function ry(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
    function mv(R, v) { return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]; }
    function tp(T, p) { var q = mv(T.rotation, p); return [q[0] + T.position[0], q[1] + T.position[1], q[2] + T.position[2]]; }
    function bodyMp(csg) { return K.massProps(K.meshFromBody(csg), 1); }
    function box(name, w, d, h) { return { script: 'p.name("' + name + '"); p.box(' + w + ', ' + d + ', ' + h + ');' }; }
    function fresh() { D.use(null); }
    function asm(name, code) { var m = AS.newAssembly(name); AS.runScript(m, code); return m; }
    function hingeCover() { var ex = AnvilExamples.filter(function (e) { return e.name === 'Hinged cover (sub-assemblies)'; })[0]; return asm('x', ex.code); }

    test('nested transforms: a part two levels down is placed by T_top · T_sub · T_part; path refs and viewport picks resolve through both levels', function () {
      fresh();
      // Inner: a 10 × 4 × 2 box turned 90° about z and moved +5 in x; Mid holds Inner turned about y and moved; Top holds Mid
      var inner = asm('Inner', 'a.insert(' + JSON.stringify(box('Blk', 10, 2, 4)) + ', { fixed: true, position: [5, 0, 0], rotation: ' + JSON.stringify(rz(90)) + ' });');
      var mid = AS.newAssembly('Mid'); AS.insert(mid, { model: inner }, { fixed: true, position: [0, 20, 0], rotation: ry(90) });
      var top = AS.newAssembly('Top'); AS.insert(top, { model: mid }, { fixed: true, position: [100, 0, -3], rotation: rz(-90) });
      var b = AS.rebuild(top);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      assert(b.components[0].subAssembly, 'sub-assembly status');
      var T1 = { position: [5, 0, 0], rotation: rz(90) }, T2 = { position: [0, 20, 0], rotation: ry(90) }, T3 = { position: [100, 0, -3], rotation: rz(-90) };
      function world(p) { return tp(T3, tp(T2, tp(T1, p))); }
      var mp = bodyMp(b.bodies[0]);
      near(mp.volume, 80, 1e-9, 'volume');
      nearVec(mp.centroid, world([5, 2, 1]), 1e-9, 'centroid through three transforms');
      // the corners of the box land where the composed transform puts them
      var want = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      [0, 10].forEach(function (x) { [0, 4].forEach(function (y) { [0, 2].forEach(function (z) { var q = world([x, y, z]); for (var k = 0; k < 3; k++) { want.min[k] = Math.min(want.min[k], q[k]); want.max[k] = Math.max(want.max[k], q[k]); } }); }); });
      nearVec(mp.bbox.min, want.min, 1e-9, 'bbox min'); nearVec(mp.bbox.max, want.max, 1e-9, 'bbox max');
      // a ref by path (ids or names) to the box's top face (local y = 4) resolves to the world plane
      var W = AS.resolveRef(top, b.partBuilds, { component: 1, path: [1, 'Blk<1>'], face: [5, 4, 1] });
      nearVec(W.point, world([5, 4, 1]), 1e-9, 'face point');
      nearVec(W.normal, mv(T3.rotation, mv(T2.rotation, mv(T1.rotation, [0, 1, 0]))), 1e-12, 'face normal');
      // a viewport pick on that face gives the path ref back, in the part's own coordinates
      var mesh = K.meshFromBody(b.body), fi = -1;
      mesh.faces.forEach(function (f, i) { var n = f.normal, w = W.normal; if (Math.abs(n[0] * w[0] + n[1] * w[1] + n[2] * w[2] - 1) < 1e-9) fi = i; });
      assert(fi >= 0, 'picked face');
      var ref = AS.refFromPick(top, b, fi, world([3, 4, 1.5]), mesh);
      assert(ref && ref.component === 1 && JSON.stringify(ref.path) === '[1,1]' && ref.face, JSON.stringify(ref));
      nearVec(ref.face, [3, 4, 1.5], 1e-6, 'local pick point');
      // the leaf list carries the full path and name
      var leaves = AS.leafBodies(top, b);
      assert(leaves.length === 1 && leaves[0].name === 'Mid<1>/Inner<1>/Blk<1>' && JSON.stringify(leaves[0].path) === '[1,1]', leaves.map(function (l) { return l.name; }).join());
      return 'centroid ' + mp.centroid.map(fmt).join(', ');
    });

    test('BOM across levels: Top-level only, Indented (items 1.1, 3.1.2, qty per parent) and Parts only (quantities multiplied through the levels)', function () {
      fresh();
      var PIN = { script: 'p.name("Pin"); p.cylinder(4, 20);' };
      // Top: 2 × Pinned plate (plate, 2 pins, cap), 1 loose pin, 1 Frame (a sub-assembly holding a Pinned plate and a rail)
      var frame = asm('Frame', 'a.insert({ script: \'p.name("Rail"); p.box(100, 10, 5);\' }, { fixed: true }); a.insert({ example: "Pinned plate assembly" }, { fixed: true, position: [0, 5, 0] });');
      var top = asm('Top', 'a.insert({ example: "Pinned plate assembly" }, { fixed: true }); a.insert({ example: "Pinned plate assembly" }, { fixed: true, position: [0, 0, 100] });' +
        'a.insert(' + JSON.stringify(PIN) + ', { fixed: true, position: [200, 0, 0] }); a.insert({ model: ' + JSON.stringify(frame) + ' }, { fixed: true, position: [0, -50, 0] });');
      var b = AS.rebuild(top);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      function txt(rows) { return rows.map(function (r) { return r.item + ' ' + r.name + ' ×' + r.qty; }).join(' | '); }
      var tl = txt(AS.bom(top, b, { type: 'top' }));
      assert(tl === '1 Pinned Plate ×2 | 2 Pin ×1 | 3 Frame ×1', tl);
      var ind = txt(AS.bom(top, b, { type: 'indented' }));
      assert(ind === '1 Pinned Plate ×2 | 1.1 Plate ×1 | 1.2 Pin ×2 | 1.3 Cap ×1 | 2 Pin ×1 | 3 Frame ×1 | 3.1 Rail ×1 | 3.2 Pinned Plate ×1 | 3.2.1 Plate ×1 | 3.2.2 Pin ×2 | 3.2.3 Cap ×1', ind);
      var lv = AS.bom(top, b, { type: 'indented' }).map(function (r) { return r.level; }).join('');
      assert(lv === '01110011222', 'levels ' + lv);
      var po = txt(AS.bom(top, b, { type: 'parts' }));
      assert(po === '1 Plate ×3 | 2 Pin ×7 | 3 Cap ×3 | 4 Rail ×1', po);
      // without a build the BOM reads the sources (same rows)
      assert(txt(AS.bom(top, null, { type: 'parts' })) === po, 'from sources');
      return po;
    });

    test('Drawing BOM across levels (cloud-2026-09-26r): Indented and Parts only in a drawing come from Assembly.bom (items 1.1, 3.2.2, quantities multiplied); Top-level only keeps the sub-assemblies as rows', function () {
      if (typeof Drawing === 'undefined' || !Drawing.bomRows) fail('drawing.js not loaded');
      fresh();
      var PIN = { script: 'p.name("Pin"); p.cylinder(4, 20);' };
      var frame = asm('Frame', 'a.insert({ script: \'p.name("Rail"); p.box(100, 10, 5);\' }, { fixed: true }); a.insert({ example: "Pinned plate assembly" }, { fixed: true, position: [0, 5, 0] });');
      var top = asm('Top', 'a.insert({ example: "Pinned plate assembly" }, { fixed: true }); a.insert({ example: "Pinned plate assembly" }, { fixed: true, position: [0, 0, 100] });' +
        'a.insert(' + JSON.stringify(PIN) + ', { fixed: true, position: [200, 0, 0] }); a.insert({ model: ' + JSON.stringify(frame) + ' }, { fixed: true, position: [0, -50, 0] });');
      var b = AS.rebuild(top);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      function txt(rows) { return rows.map(function (r) { return r.item + ' ' + r.partNumber + ' ×' + r.qty; }).join(' | '); }
      function ref(rows) { return rows.map(function (r) { return r.item + ' ' + r.name + ' ×' + r.qty; }).join(' | '); }
      ['indented', 'parts'].forEach(function (t) {
        var dr = txt(Drawing.bomRows(top, null, { type: t }, { build: b })), ar = ref(AS.bom(top, b, { type: t }));
        assert(dr === ar, t + ': ' + dr + ' vs ' + ar);
      });
      var ind = Drawing.bomRows(top, null, { type: 'indented' }, { build: b });
      assert(ind.map(function (r) { return r.level; }).join('') === '01110011222', 'levels');
      assert(ind[0].indices.join() === '0,1' && ind[1].indices.length === 0, 'top-level rows keep their body indices');
      var tl = txt(Drawing.bomRows(top, null, { type: 'top' }, { build: b }));
      assert(tl === '1 Pinned Plate ×2 | 2 Pin ×1 | 3 Frame ×1', tl);
      assert(Drawing.bomType('indented') === 'indented' && Drawing.bomType('x') === 'top' && Drawing.BOM_TYPES.length === 3, 'types');
      return txt(Drawing.bomRows(top, null, { type: 'parts' }, { build: b }));
    });

    test('mass properties across levels: volumes add, the centroid is mass-weighted through every level, each sub-assembly row lists its own components in world coordinates', function () {
      fresh();
      var m = hingeCover(), b = AS.rebuild(m);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      var mp = AS.massProps(m, b), c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
      // base (60, 5, 30) 72000; each leaf / arm 4000: Hinge<1> at (50, 15, 0) with its arm standing (Rz 90), Hinge<2> at (110, 15, 0) with its arm at 30°
      // (the arm's local centroid is (21, 2.5, 10): it starts 1 mm clear of the hinge line)
      var parts = [[72000, [60, 5, 30]], [4000, [30, 12.5, 10]], [4000, [47.5, 36, 10]], [4000, [90, 12.5, 10]], [4000, [110 + 21 * c30 - 2.5 * s30, 15 + 21 * s30 + 2.5 * c30, 10]]];
      var V = 0, C = [0, 0, 0];
      parts.forEach(function (p) { V += p[0]; for (var k = 0; k < 3; k++) C[k] += p[0] * p[1][k]; });
      C = C.map(function (x) { return x / V; });
      nearRel(mp.volume, 88000, 1e-9, 'volume');
      nearRel(mp.mass, 88000 * 7850, 1e-9, 'mass');
      nearVec(mp.centroid, C, 1e-9, 'centroid');
      var h2 = mp.components[2];
      assert(h2.subAssembly && h2.components.length === 2, 'Hinge<2> row with its components');
      near(h2.volume, 8000, 1e-9, 'Hinge<2> volume');
      nearVec(h2.components[1].centroid, parts[4][1], 1e-9, 'Hinge<2>/Arm<1> centroid in world');
      nearVec(h2.centroid, [(parts[3][1][0] + parts[4][1][0]) / 2, (parts[3][1][1] + parts[4][1][1]) / 2, 10], 1e-9, 'Hinge<2> centroid');
      return 'centroid ' + mp.centroid.map(fmt).join(', ');
    });

    test('Flexible vs Rigid: the Angle mate on a face inside Hinge<2> over-defines it when rigid, opens its arm to 30° when flexible (the sub-assembly document is not changed); flexState round-trips through the script', function () {
      fresh();
      var m = hingeCover(), b = AS.rebuild(m), h2 = AS.findComponent(m, 'Hinge<2>');
      assert(h2.flexible && b.components[2].flexible, 'flexible');
      var arm = h2.flexState && h2.flexState['2'];
      assert(arm, 'flexState ' + JSON.stringify(h2.flexState));
      for (var i = 0; i < 9; i++) near(arm.rotation[i], rz(30)[i], 1e-9, 'arm rotation[' + i + ']');
      // the rigid hinge keeps the layout of its own document
      var inner = b.partBuilds[AS.findComponent(m, 'Hinge<1>').id].model.components[1].transform.rotation;
      for (i = 0; i < 9; i++) near(inner[i], rz(90)[i], 1e-9, 'rigid arm rotation[' + i + ']');
      // Solve as Rigid: the Angle mate cannot be satisfied any more, the arm is back at 90°
      var r = JSON.parse(JSON.stringify(m));
      AS.setFlexible(r, 'Hinge<2>', false);
      var rb = AS.rebuild(r), am = r.mates[r.mates.length - 1];
      assert(!r.components[2].flexible && !r.components[2].flexState, 'rigid');
      assert(rb.mates[am.id] && /cannot be satisfied/.test(rb.mates[am.id].error), 'angle over-defines the rigid hinge: ' + JSON.stringify(rb.mates[am.id]));
      var rarm = rb.partBuilds[r.components[2].id].model.components[1].transform.rotation;
      for (i = 0; i < 9; i++) near(rarm[i], rz(90)[i], 1e-9, 'arm back at 90° [' + i + ']');
      var bad = null; try { AS.setFlexible(r, 'Base<1>', true); } catch (e) { bad = e.message; }
      assert(/not a sub-assembly/.test(bad), 'a part cannot be flexible: ' + bad);
      // round trip: flexible and its in-context state in the script
      var s = AS.generateScript(m);
      assert(/flexible: true, flexState: \{ "2": \{ position: \[0, 0, 0\], rotation: \[0\.866025, -0\.5,/.test(s), s);
      assert(/path: \["Arm<1>"\]/.test(s), 'path refs written');
      var m2 = asm('y', s), b2 = AS.rebuild(m2);
      assert(!Object.keys(b2.errors).length, JSON.stringify(b2.errors));
      for (i = 0; i < 9; i++) near(m2.components[2].flexState['2'].rotation[i], rz(30)[i], 1e-6, 'round-trip arm [' + i + ']');   // the script rounds to 1e-6
      nearRel(AS.massProps(m2, b2).volume, 88000, 1e-9, 'round-trip volume');
      return 'arm at 30° in context';
    });

    test('live links: editing a referenced part in the document store updates every assembly that uses it on rebuild (directly and through a linked sub-assembly); dirty edits show before they are saved', function () {
      fresh();
      D.put('Pin', { name: 'Pin', units: 'mm', features: [], nextId: 1 });
      var pin = K.newModel('Pin'); K.runScript(pin, 'p.name("Pin"); p.box(10, 10, 10);'); D.put('Pin', pin);
      D.put('PinPair', asm('PinPair', 'a.insert({ file: "Pin" }, { fixed: true }); a.insert({ file: "Pin" }, { fixed: true, position: [20, 0, 0] });'));
      var a1 = asm('A1', 'var b = a.insert(' + JSON.stringify(box('Base', 50, 50, 5)) + ', { fixed: true }); var p = a.insert({ file: "Pin" }, { position: [3, 30, 3] });' +
        'a.coincident({ component: p, face: [5, 0, 5] }, { component: b, face: [25, 5, 25] }); a.coincident({ component: p, face: [0, 5, 5] }, { component: b, face: [0, 2, 25] }, { alignment: "aligned" }); a.coincident({ component: p, face: [5, 5, 0] }, { component: b, face: [25, 2, 0] }, { alignment: "aligned" });');
      var a2 = asm('A2', 'a.insert({ file: "PinPair" }, { fixed: true }); a.insert({ file: "Pin" }, { fixed: true, position: [0, 0, 40] });');
      assert(a1.components[1].name === 'Pin<1>' && a2.components[0].name === 'PinPair<1>', 'named after the document');
      var b1 = AS.rebuild(a1), b2 = AS.rebuild(a2);
      near(AS.massProps(a1, b1).volume, 12500 + 1000, 1e-9, 'A1 before');
      near(AS.massProps(a2, b2).volume, 3000, 1e-9, 'A2 before');
      nearVec(a1.components[1].transform.position, [0, 5, 0], 1e-9, 'pin mated on the base');
      assert(JSON.stringify(AS.references(a2)) === '["Pin","PinPair"]', 'references ' + JSON.stringify(AS.references(a2)));
      // edit the part (Open Part, change, Save): 10 -> 10 × 10 × 16 tall
      pin = D.get('Pin'); pin.features = []; K.runScript(pin, 'p.name("Pin"); p.box(10, 10, 16);'); D.put('Pin', pin);
      var c1 = AS.rebuild(a1, b1.cache), c2 = AS.rebuild(a2, b2.cache);
      near(AS.massProps(a1, c1).volume, 12500 + 1600, 1e-9, 'A1 after the edit');
      near(AS.massProps(a2, c2).volume, 3 * 1600, 1e-9, 'A2 after the edit (two of them inside the linked PinPair)');
      assert(!Object.keys(c1.errors).length && c1.mates[a1.mates[0].id].ok, 'mates still solve');
      // an unchanged document reuses the cached build
      var d1 = AS.rebuild(a1, c1.cache);
      assert(d1.partBuilds[a1.components[1].id] === c1.partBuilds[a1.components[1].id], 'cache reused while the document is unchanged');
      // an edit kept in memory (not saved) already shows; saving the assembly's references saves it
      pin = D.get('Pin'); pin.features = []; K.runScript(pin, 'p.name("Pin"); p.box(10, 10, 20);'); D.put('Pin', pin, { dirty: true });
      assert(D.isDirty('Pin'), 'dirty');
      near(AS.massProps(a2, AS.rebuild(a2, c2.cache)).volume, 3 * 2000, 1e-9, 'dirty edit shows');
      assert(JSON.stringify(AS.saveReferences(a2)) === '["Pin"]' && !D.isDirty('Pin'), 'saved with the assembly');
      D.put('Pin', pin, { dirty: true }); D.revert('Pin');
      near(AS.massProps(a1, AS.rebuild(a1)).volume, 12500 + 2000, 1e-9, 'saved version');
      return 'A1 ' + fmt(12500 + 2000) + ', A2 ' + fmt(6000);
    });

    test('broken reference: a missing document is a suppressed component with a warning (no error), its mates are suppressed, BOM and mass leave it out; it comes back when the document exists; a document that contains itself is an error, not a loop', function () {
      fresh();
      var m = asm('Br', 'var b = a.insert(' + JSON.stringify(box('Base', 50, 50, 5)) + ', { fixed: true }); var g = a.insert({ file: "Gone" }, { position: [0, 5, 0] });' +
        'a.coincident({ component: g, face: [5, 0, 5] }, { component: b, face: [25, 5, 25] }); var k = a.insert(' + JSON.stringify(box('Cube', 10, 10, 10)) + ', { position: [0, 5, 0] }); a.coincident({ component: k, face: [5, 0, 5] }, { component: b, face: [25, 5, 25] });');
      var b = AS.rebuild(m), g = m.components[1], mt = m.mates[0];
      assert(!Object.keys(b.errors).length, 'no errors: ' + JSON.stringify(b.errors));
      assert(b.warnings[g.id] === 'Cannot find the referenced document "Gone"', 'warning ' + b.warnings[g.id]);
      var st = b.components[1];
      assert(st.suppressed && st.broken && st.file === 'Gone' && st.dof === 0 && !st.error, JSON.stringify(st));
      assert(b.mates[mt.id].suppressed && b.mates[mt.id].ok && /suppressed component/.test(b.mates[mt.id].warning), JSON.stringify(b.mates[mt.id]));
      assert(b.mates[m.mates[1].id].ok && !b.mates[m.mates[1].id].suppressed, 'the other mate solves');
      assert(b.bodies[1].polygons.length === 0, 'no body');
      var mp = AS.massProps(m, b);
      near(mp.volume, 12500 + 1000, 1e-9, 'mass leaves it out');
      assert(mp.components[1].suppressed && mp.components[1].volume === 0, 'suppressed mass row');
      assert(AS.bom(m, b).map(function (r) { return r.name; }).join() === 'Base,Cube', 'BOM leaves it out');
      assert(AS.packAndGo(m).missing.join() === 'Gone', 'Pack and Go reports it');
      // the document appears: the component and its mate come back
      var gone = K.newModel('Gone'); K.runScript(gone, 'p.box(10, 10, 4);'); D.put('Gone', gone);
      var b2 = AS.rebuild(m, b.cache);
      assert(!b2.components[1].suppressed && !b2.warnings[g.id] && b2.mates[mt.id].ok && !b2.mates[mt.id].suppressed, 'restored');
      near(AS.massProps(m, b2).volume, 12500 + 1000 + 400, 1e-9, 'volume restored');
      // a document that links to itself
      D.put('Loop', asm('Loop', 'a.insert(' + JSON.stringify(box('Blk', 5, 5, 5)) + ', { fixed: true }); a.insert({ file: "Loop" }, { position: [10, 0, 0] });'));
      var top = asm('T', 'a.insert({ file: "Loop" }, { fixed: true });'), tb = AS.rebuild(top);
      var err = JSON.stringify(tb.errors) + JSON.stringify(tb.warnings);
      assert(/Circular reference: Loop contains itself/.test(err), err);
      return 'warning: ' + b.warnings[g.id];
    });

    test('interference across levels: parts inside one sub-assembly and parts of different levels are checked by default; "treat sub-assemblies as components" checks the sub-assembly as one body', function () {
      fresh();
      // Sub: two 10-cubes overlapping by 2 in x (volume 200); Top: Sub and a 10-cube overlapping Sub's second cube by 3 in z (300)
      var sub = asm('Sub', 'a.insert(' + JSON.stringify(box('A', 10, 10, 10)) + ', { fixed: true }); a.insert(' + JSON.stringify(box('B', 10, 10, 10)) + ', { fixed: true, position: [8, 0, 0] });');
      var top = asm('Top', 'a.insert({ model: ' + JSON.stringify(sub) + ' }, { fixed: true }); a.insert(' + JSON.stringify(box('C', 10, 10, 10)) + ', { fixed: true, position: [8, 0, 7] });');
      var b = AS.rebuild(top), r = AS.interference(top, b);
      var txt = r.pairs.map(function (p) { return p.aName + '|' + p.bName + ' ' + fmt(p.volume); }).join(', ');
      assert(r.pairs.length === 3, txt);
      function pair(a, c) { return r.pairs.filter(function (p) { return p.aName === a && p.bName === c; })[0]; }
      near(pair('Sub<1>/A<1>', 'Sub<1>/B<1>').volume, 200, 1e-9, 'inside the sub-assembly');
      near(pair('Sub<1>/B<1>', 'C<1>').volume, 300, 1e-9, 'across levels');
      near(pair('Sub<1>/A<1>', 'C<1>').volume, 2 * 10 * 3, 1e-9, 'A reaches x = 10: 2 × 10 × 3');
      var p0 = pair('Sub<1>/A<1>', 'Sub<1>/B<1>');
      assert(p0.a === 1 && p0.b === 1 && p0.aIndex === 0 && JSON.stringify(p0.aPath) === '[1]' && JSON.stringify(p0.bPath) === '[2]', JSON.stringify({ a: p0.a, b: p0.b, aPath: p0.aPath, bPath: p0.bPath }));
      // parts that only touch inside the sub-assembly: as one body it meets C in 18 - 8 = 10 × 10 × 3; part by part 60 + 240
      var sub2 = asm('Sub', 'a.insert(' + JSON.stringify(box('A', 10, 10, 10)) + ', { fixed: true }); a.insert(' + JSON.stringify(box('B', 8, 10, 10)) + ', { fixed: true, position: [10, 0, 0] });');
      var top2 = asm('Top', 'a.insert({ model: ' + JSON.stringify(sub2) + ' }, { fixed: true }); a.insert(' + JSON.stringify(box('C', 10, 10, 10)) + ', { fixed: true, position: [8, 0, 7] });');
      var b2 = AS.rebuild(top2), r1 = AS.interference(top2, b2), r2 = AS.interference(top2, b2, { subAssembliesAsComponents: true });
      assert(r1.pairs.map(function (p) { return p.aName + '|' + p.bName + ' ' + fmt(p.volume); }).join(', ') === 'Sub<1>/B<1>|C<1> 240, Sub<1>/A<1>|C<1> 60', r1.pairs.map(function (p) { return p.aName + '|' + p.bName + ' ' + fmt(p.volume); }).join(', '));
      assert(r2.pairs.length === 1 && r2.pairs[0].aName === 'Sub<1>' && r2.pairs[0].bName === 'C<1>', r2.pairs.map(function (p) { return p.aName + '|' + p.bName; }).join());
      near(r2.pairs[0].volume, 300, 1e-9, 'the sub-assembly as one body ∩ C');
      return txt;
    });

    test('STEP nests sub-assemblies (NAUO per level: Hinge products under the root, Leaf / Arm under each Hinge); STEP / 3MF / OBJ re-import every part at its world place; Pack and Go embeds the links and exports the same file', function () {
      if (!X) fail('exchange.js is not loaded');
      fresh();
      var m = hingeCover(), b = AS.rebuild(m);
      var step = X.exportSTEP(m, b, { time: new Date(Date.UTC(2026, 8, 26)) });
      var nauo = [], pdName = {}, lines = step.split('\n');
      // PRODUCT_DEFINITION #pd -> product name, through PRODUCT_DEFINITION_FORMATION
      var ent = {};
      lines.forEach(function (l) { var mm = /^#(\d+)=(.*);$/.exec(l); if (mm) ent[mm[1]] = mm[2]; });
      Object.keys(ent).forEach(function (id) {
        var pd = /^PRODUCT_DEFINITION\('design','',#(\d+),/.exec(ent[id]);
        if (!pd) return;
        var pdf = /^PRODUCT_DEFINITION_FORMATION\('','',#(\d+)\)/.exec(ent[pd[1]]), pr = pdf && /^PRODUCT\('([^']*)'/.exec(ent[pdf[1]]);
        pdName[id] = pr ? pr[1] : '?';
      });
      Object.keys(ent).forEach(function (id) { var q = /^NEXT_ASSEMBLY_USAGE_OCCURRENCE\('NAUO\d+','([^']*)','',#(\d+),#(\d+),\$\)/.exec(ent[id]); if (q) nauo.push(pdName[q[2]] + ' > ' + q[1] + ' (' + pdName[q[3]] + ')'); });
      var tree = nauo.join(' | ');
      assert(tree === 'Hinge > Leaf<1> (Leaf) | Hinge > Arm<1> (Arm) | Hinge (Hinge<2>, flexible) > Leaf<1> (Leaf) | Hinge (Hinge<2>, flexible) > Arm<1> (Arm) | Hinged Cover > Base<1> (Base) | Hinged Cover > Hinge<1> (Hinge) | Hinged Cover > Hinge<2> (Hinge (Hinge<2>, flexible))', tree);
      assert((step.match(/MANIFOLD_SOLID_BREP/g) || []).length === 3, 'one B-rep per distinct part');
      // re-import: every placement path composed, each part at its world place (same volume and box as the leaf bodies)
      var want = AS.leafBodies(m, b).map(function (l) { return bodyMp(l.body); });
      var names = AS.leafBodies(m, b).map(function (l) { return l.name; });
      function vol(sol) { return X.signedVolume(sol.positions, sol.triangles); }
      function bb(sol) { var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (var i = 0; i < sol.positions.length; i += 3) for (var k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], sol.positions[i + k]); mx[k] = Math.max(mx[k], sol.positions[i + k]); } return { min: mn, max: mx }; }
      function check(res, label) {
        assert(res.solids.length === 5, label + ' solids ' + res.solids.length);
        var used = {};
        want.forEach(function (w, i) {
          var hit = res.solids.filter(function (sol, j) { if (used[j]) return false; var q = bb(sol); return Math.abs(q.min[0] - w.bbox.min[0]) + Math.abs(q.min[1] - w.bbox.min[1]) + Math.abs(q.max[2] - w.bbox.max[2]) + Math.abs(q.max[0] - w.bbox.max[0]) < 1e-6; })[0];
          assert(hit, label + ': no solid at ' + names[i]);
          used[res.solids.indexOf(hit)] = true;
          nearRel(vol(hit), w.volume, 1e-9, label + ' ' + names[i] + ' volume');
        });
      }
      check(X.importSTEP(step), 'STEP');
      var tmf = X.export3MF(m, b), xml = X.fromUtf8(X.unzip(tmf)['3D/3dmodel.model']);
      assert((xml.match(/<item /g) || []).length === 3, '3MF build items per top-level component');
      assert(/<object id="\d+" type="model" name="Hinge">\s*<components>/.test(xml), '3MF sub-assembly object');
      check(X.import3MF(tmf), '3MF');
      var obj = X.exportOBJ(m, b, { mtl: false });
      assert(/^o Hinge_1__Arm_1_/m.test(obj) || /^o Hinge<1>\/Arm<1>/m.test(obj) || /Arm/.test(obj), 'OBJ objects');
      check(X.importOBJ(obj), 'OBJ');
      // Pack and Go: the same assembly with its parts linked from the store, then packed, exports identical STEP text
      D.put('Hinge', AS.partModel({ example: 'Hinge sub-assembly' }));
      var linked = JSON.parse(JSON.stringify(m));
      linked.components.forEach(function (c) { if (c.source.example === 'Hinge sub-assembly') c.source = { file: 'Hinge' }; });
      // numbers compared to 1e-9 (re-solving from the saved positions differs in the last bits)
      function numbers(t) { return t.replace(/-?\d+\.\d*(E[-+]?\d+)?/g, function (n) { var r = Math.round(+n * 1e9) / 1e9; return String(r === 0 ? 0 : r); }); }
      var lb = AS.rebuild(linked), lstep = X.exportSTEP(linked, lb, { time: new Date(Date.UTC(2026, 8, 26)) });
      assert(numbers(lstep) === numbers(step), 'linked assembly exports the same STEP');
      var packed = AS.packAndGo(linked);
      assert(packed.embedded.join() === 'Hinge' && !packed.missing.length, JSON.stringify(packed.embedded));
      assert(JSON.stringify(packed.model).indexOf('"file"') < 0, 'no links left');
      D.use(null);   // the packed file stands alone: no documents in the store at all
      var pb = AS.rebuild(packed.model);
      assert(!Object.keys(pb.errors).length && !Object.keys(pb.warnings).length, JSON.stringify(pb.errors) + JSON.stringify(pb.warnings));
      assert(numbers(X.exportSTEP(packed.model, pb, { time: new Date(Date.UTC(2026, 8, 26)) })) === numbers(step), 'packed STEP identical');
      return nauo.length + ' NAUOs';
    });

    test('script round trip with sub-assemblies and links: { file } and { model: assembly } sources, path refs and flexible components come back with the same transforms; generateScript is a fixed point', function () {
      fresh();
      D.put('Hinge', AS.partModel({ example: 'Hinge sub-assembly' }));
      var m = hingeCover();
      m.components[1].source = { file: 'Hinge' };
      var b = AS.rebuild(m), s = AS.generateScript(m);
      assert(/a\.insert\(\{ file: "Hinge" \}/.test(s), s);
      var m2 = asm('z', s), b2 = AS.rebuild(m2);
      assert(!Object.keys(b2.errors).length, JSON.stringify(b2.errors));
      m.components.forEach(function (c, i) {
        nearVec(m2.components[i].transform.position, c.transform.position, 1e-6, c.name + ' position');
        assert(!!m2.components[i].flexible === !!c.flexible && JSON.stringify(m2.components[i].source) === JSON.stringify(c.source), c.name);
      });
      assert(AS.generateScript(m2) === s, 'fixed point');
      nearRel(AS.massProps(m2, b2).volume, AS.massProps(m, b).volume, 1e-12, 'volume');
      D.use(null);
      return s.split('\n').length + ' lines';
    });
  })();

