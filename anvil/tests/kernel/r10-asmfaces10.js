  // --- r10/asmfaces10 ---
  (function () {
    var AS = Assembly;
    function asm(name, code) { var m = AS.newAssembly(name); AS.runScript(m, code); return m; }
    function partsOf(f) { var s = {}; f.polys.forEach(function (p) { s[p.part] = 1; }); return Object.keys(s); }
    // two 10 × 10 × 10 blocks side by side (x 0..10 and 10..20): fronts (z = 0), tops and bottoms exactly coplanar and touching
    function pair() { return asm('Pair', 'a.insert({ script: \'p.name("L"); p.box(10, 10, 10);\' }, { fixed: true }); a.insert({ script: \'p.name("R"); p.box(10, 10, 10);\' }, { fixed: true, position: [10, 0, 0] });'); }
    group('assembly: faces never merge across parts (Anvil kernel)');
    test('Hinged cover: every mesh face holds one part; each leaf / arm front and back is its own face (30 faces, not 25)', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Hinged cover (sub-assemblies)'; })[0];
      var m = asm('x', ex.code), b = AS.rebuild(m), mesh = K.meshFromBody(b.body);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      mesh.faces.forEach(function (f, i) { assert(partsOf(f).length === 1, 'face ' + i + ' mixes parts ' + partsOf(f)); assert(f.part === f.polys[0].part, 'face.part'); });
      assert(mesh.faces.length === 30, 'faces ' + mesh.faces.length);
      var fronts = mesh.faces.filter(function (f) { return Math.abs(f.normal[2] + 1) < 1e-9 && Math.abs(f.w) < 1e-9 && f.body > 0; });
      assert(fronts.length === 4 && fronts.every(function (f) { return Math.abs(f.area - 200) < 1e-6; }), JSON.stringify(fronts.map(function (f) { return [f.body, f.part, f.area]; })));
      near(K.massProps(mesh, 1).volume, ex.volume, 1e-6, 'volume');
    });
    test('touching coplanar parts inside a rigid and a Flexible sub-assembly, two levels down: separate faces and the shared edge between them', function () {
      [false, true].forEach(function (flex) {
        var mid = AS.newAssembly('Mid'); AS.insert(mid, { model: pair() }, { fixed: true, position: [1, 2, 3] });
        var top = AS.newAssembly('Top'); AS.insert(top, { script: 'p.box(5, 5, 5);' }, { fixed: true, position: [-50, 0, 0] });
        AS.insert(top, { model: mid }, { fixed: true, flexible: flex });
        var b = AS.rebuild(top), mesh = K.meshFromBody(b.body);
        assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
        var fr = mesh.faces.filter(function (f) { return f.body === 1 && Math.abs(f.normal[2] + 1) < 1e-9; });
        assert(fr.length === 2 && fr[0].part !== fr[1].part && fr.every(function (f) { return Math.abs(f.area - 100) < 1e-9; }), (flex ? 'flexible ' : 'rigid ') + JSON.stringify(fr.map(function (f) { return [f.part, f.area]; })));
        mesh.faces.forEach(function (f, i) { assert(partsOf(f).length === 1, 'face ' + i + ' mixes parts'); });
        // the edge x = 11 on the front (z = 3) between the two fronts is a real edge of the mesh
        var e = K.bodyEdges(mesh).filter(function (e) { return Math.abs(e.a[0] - 11) < 1e-9 && Math.abs(e.b[0] - 11) < 1e-9 && Math.abs(e.a[2] - 3) < 1e-9 && Math.abs(e.b[2] - 3) < 1e-9; });
        assert(e.length >= 1, 'shared front edge');
        near(K.massProps(mesh, 1).volume, 2125, 1e-9, 'volume');
      });
    });
    test('part tags survive CSG clone, transform, split and pack / unpack; a part body stays untagged', function () {
      var b = AS.rebuild(pair()), body = b.body;
      var tags = body.polygons.map(function (p) { return p.part; });
      assert(tags.indexOf(0) >= 0 && tags.indexOf(1) >= 0 && tags.every(function (t) { return t === 0 || t === 1; }), 'tags ' + tags.join());
      var moved = body.transform(function (v) { return new CSG.Vector(v.x + 5, v.y, v.z); });
      assert(moved.polygons.every(function (p, i) { return p.part === tags[i]; }), 'transform');
      assert(body.polygons[0].clone().part === tags[0], 'clone');
      // a notch across both blocks' tops (x 13..17, y 8..12): the tops are split, their fragments keep their tags (the
      // notch walls come from the untagged tool)
      var cut = moved.subtract(build('p.box(4, 12, 4, { at: [13, 8, -1] });').body);
      var tops = cut.polygons.filter(function (p) { return p.plane.normal.y > 0.999 && Math.abs(p.plane.w - 10) < 1e-9; });
      assert(tops.length >= 2 && tops.every(function (p) { return p.part === 0 || p.part === 1; }) && tops.some(function (p) { return p.part === 0; }) && tops.some(function (p) { return p.part === 1; }), 'split fragments keep their tag');
      var un = CSG.unpack(body.pack());
      assert(un.polygons.every(function (p, i) { return p.part === tags[i]; }), 'pack / unpack');
      assert(K.meshFromBody(un).faces.length === 12, 'two blocks: 12 faces, got ' + K.meshFromBody(un).faces.length);
      var r = build('p.box(10, 10, 10);');
      assert(r.mesh.faces.every(function (f) { return f.part === undefined && f.polys.every(function (q) { return q.part === undefined; }); }), 'a part has no tags');
    });
    test('a multibody part (Two-body clamp) in an assembly and inside a rigid sub-assembly: its base and cap fronts stay two faces; the part build itself is not tagged', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Two-body clamp'; })[0];
      var one = asm('One', 'a.insert({ example: "Two-body clamp" }, { fixed: true });');
      var top = AS.newAssembly('Top'); AS.insert(top, { script: 'p.box(5, 5, 5);' }, { fixed: true, position: [-50, 0, 0] }); AS.insert(top, { model: one }, { fixed: true, position: [0, 0, 7] });
      [[one, 0, 0], [top, 1, 7]].forEach(function (c) {
        var b = AS.rebuild(c[0]), mesh = K.meshFromBody(b.body);
        assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
        var fr = mesh.faces.filter(function (f) { return f.body === c[1] && Math.abs(f.normal[2] + 1) < 1e-9 && Math.abs(f.w + c[2]) < 1e-9; });
        assert(fr.length === 2 && fr[0].part !== fr[1].part, 'fronts ' + JSON.stringify(fr.map(function (f) { return [f.part, f.area]; })));
        mesh.faces.forEach(function (f, i) { assert(partsOf(f).length === 1, 'face ' + i + ' mixes parts'); });
        var pb = b.partBuilds[c[0].components[c[1]].id];
        assert(pb.body.polygons.every(function (p) { return p.part === undefined || c[1] === 1; }), 'part build untouched');
        nearRel(K.massProps(mesh, 1).volume - (c[1] ? 125 : 0), ex.volume, 1e-3, 'volume');
      });
    });
  })();
  // --- end r10/asmfaces10 ---
