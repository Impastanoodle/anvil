  // --- rfQJ (lane solidcracks, 2026-11-19; report test-reports/2026-11-19-solids-fidelity-8.md): solids that cracked
  // in STEP. 1. A hole tangent to a wall (a cylinder whose axis lies r from a parallel flat face, or r1 + r2 / |r1 - r2|
  // from another cylinder's, with the two faces' outward normals opposite) is zero-thickness geometry by the surface
  // records even when no facet vertex falls on the line (kernel-rebuild.js tangentContacts / tangentRefusal): refused
  // with what is tangent to what, as the mesh check already refused it when the facets happened to meet.
  (function () {
    group('rfQJ: solids fidelity 8: holes tangent to a wall refused, drilled lofts closed');
    var PLATE = 'p.units("in");\np.sketch("Top").centerRect(0, 0, 6, 4.25).end().extrude(0.5);\n';
    function rfQJhole(x, z, r) { return 'p.sketch("Top", 1.5).circle(' + x + ', ' + (-z) + ', ' + r + ').end().cut("through", { reverse: true });\n'; }
    function rfQJbuild(code) { var m = K.newModel('rfQJ'); K.runScript(m, code); return { m: m, b: K.rebuild(m) }; }
    function rfQJerr(b) { var k = Object.keys(b.errors); return k.length ? b.errors[k[k.length - 1]] : ''; }
    function rfQJvol(b) { return K.massProps(K.meshFromBody(b.body), 1).volume; }

    test('rfQJ: a Ø.25 hole tangent to a plate\'s side face (fuzz p6006: built, its STEP read back non-manifold) is refused as zero-thickness geometry naming the face and the line; the part stays as it was', function () {
      var r = rfQJbuild(PLATE + rfQJhole(-1.0272, 2, 0.125)), e = rfQJerr(r.b);
      assert(/zero-thickness geometry/.test(e) && K.isRefusal(e), 'not refused: ' + e);
      assert(/Ø0\.25 hole is tangent to a flat face of the part along a line through \(-1\.0272, 0, 2\.125\)/.test(e), e);
      assert(/0\.001 in or more/.test(e), 'no distance to move it: ' + e);
      near(rfQJvol(r.b), 6 * 4.25 * 0.5, 1e-9, 'the part is not the plate');
      return e;
    });
    test('rfQJ: the same hole a real gap (1e-4) inside the wall, or 1e-4 through it, builds (the plate less the hole)', function () {
      [[1.9999, 'inside'], [2.0001, 'through']].forEach(function (c) {
        var r = rfQJbuild(PLATE + rfQJhole(-1.0272, c[0], 0.125));
        assert(!Object.keys(r.b.errors).length, c[1] + ': ' + JSON.stringify(r.b.errors));
        assert(rfQJvol(r.b) < 6 * 4.25 * 0.5 - 0.02, c[1] + ': nothing cut');
      });
      return 'both build';
    });
    test('rfQJ: two holes tangent to each other at 30 deg (r .1 and .15, no facet vertex on the line between the centres) are refused, as the pair on the X axis already was; .001 apart they build', function () {
      var c = Math.cos(Math.PI / 6) * 0.25, s = Math.sin(Math.PI / 6) * 0.25;
      var r1 = rfQJbuild(PLATE + 'p.sketch("Top", 1.5).circle(0, 0, 0.1).circle(' + c + ', ' + s + ', 0.15).end().cut("through", { reverse: true });\n');
      var e = rfQJerr(r1.b);
      assert(/zero-thickness geometry/.test(e) && /Ø0\.2 hole is tangent to a Ø0\.3 hole|Ø0\.3 hole is tangent to a Ø0\.2 hole/.test(e), 'not refused: ' + e);
      var r2 = rfQJbuild(PLATE + rfQJhole(0, 0, 0.1) + rfQJhole(0, 0.251, 0.15));
      assert(!Object.keys(r2.b.errors).length, JSON.stringify(r2.b.errors));
      var r3 = rfQJbuild(PLATE + rfQJhole(0, 0, 0.1) + rfQJhole(0, 0.25, 0.15));
      assert(/zero-thickness geometry/.test(rfQJerr(r3.b)), 'the X-axis pair: ' + rfQJerr(r3.b));
      return e;
    });
    test('rfQJ: a cross hole whose wall touches a tube\'s outside at one point (fuzz t6096: Ø.5 at .75 off a Ø2 tube\'s axis) is refused at that point', function () {
      var r = rfQJbuild('p.units("in");\np.sketch("Top").circle(0, 0, 1).circle(0, 0, 0.6).end().extrude(2.5);\np.sketch("Front", 2).circle(0.75, 1.1863, 0.25).end().cut("through", { reverse: true });\n');
      var e = rfQJerr(r.b);
      assert(/zero-thickness geometry/.test(e) && /Ø0\.5 hole is tangent to a Ø2 cylindrical face at the point \(1, 1\.1863, 0\)/.test(e), 'not refused: ' + e);
      return e;
    });
    test('rfQJ: tangent but not zero-thickness: a slot, a corner round with a hole on its axis, a boss on a bar tangent to its ruling, a hole as wide as a keyway it crosses all build', function () {
      var cases = [
        PLATE + 'p.sketch("Top", 1.5).slot(-1, 0, 1, 0, 0.25).end().cut("through", { reverse: true });\np.fillet(0.25, [[3, 0.25, 2.125]]);\n',
        PLATE + 'p.fillet(0.5, [[3, 0.25, 2.125]]);\n' + rfQJhole(2.5, 1.625, 0.25),
        'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).end().extrude(1);\np.sketch("Front", 1).circle(0.125, 0.4612, 0.375).end().extrude(1, { reverse: true });\n',
        'p.units("in");\np.sketch("Top").circle(0, 0, 0.5).circle(0, 0, 0.25).end().extrude(1.5);\np.sketch("Top", 2.5).rect(-0.0625, 0.2, 0.125, 0.1425).end().cut("through", { reverse: true });\np.sketch("Front", 1.5).circle(0, 0.2559, 0.0625).end().cut("through", { reverse: true });\n'
      ];
      cases.forEach(function (code, i) { var r = rfQJbuild(code); assert(!Object.keys(r.b.errors).length, 'case ' + i + ': ' + JSON.stringify(r.b.errors)); });
      return cases.length + ' build';
    });
    // 2. csg.js healPass (healFold): a drilled loft whose cut crosses the loft's fold left a crack 5 to 6e-6 wide that the
    //    heal could not close: f6001 the inserted point made a fin at a needle polygon's tip (the tip now goes), f6040 a
    //    needle on the flat cut ran 1.8e-5 past the chord its neighbour has (the corner now goes)
    [
      ['f6001: a rectangle-to-circle loft, a hole down it and a cross hole over the fold', 'p.units("in");\nvar a = p.sketch("Top").centerRect(0, 0, 3.5, 2.5).id();\nvar b = p.sketch("Top", 2).circle(0, 0, 1.125).id();\np.loft([a, b]);\np.sketch("Top", 3).circle(0.5625, 0, 0.3375).end().cut("through", { reverse: true });\np.sketch("Front", 3.5).circle(1.125, 0.6596, 0.1875).end().cut("through", { reverse: true });\n'],
      ['f6040: a circle-to-rectangle loft, a hole down it, a sloped cut and a flat cut through the fold', 'p.units("in");\nvar a = p.sketch("Top").circle(0, 0, 0.625).id();\nvar b = p.sketch("Top", 3).centerRect(0, 0, 3, 2.5).id();\np.loft([a, b]);\np.sketch("Top", 4).circle(0, 0, 0.375).end().cut("through", { reverse: true });\np.sketch("Front", 3).polyline([[-3, 2.4], [3, 2.85], [3, 4], [-3, 4]]).end().cut("through", { reverse: true });\np.sketch("Top", 4).rect(0.75, -3, 6, 6).end().cut("through", { reverse: true });\n']
    ].forEach(function (c) {
      test('rfQJ: fuzz ' + c[0] + ': the body is closed (it had 2 open edges and 1 used three times)', function () {
        var r = rfQJbuild(c[1]);
        assert(!Object.keys(r.b.errors).length, JSON.stringify(r.b.errors));
        var ck = Evaluate.checkBody(r.b.body);
        assert(ck.openEdges.length === 0 && ck.nonManifoldEdges.length === 0, ck.openEdges.length + ' open, ' + ck.nonManifoldEdges.length + ' non-manifold');
        return 'closed, ' + fmt(rfQJvol(r.b)) + ' in³';
      });
    });
    // 3. exchange.js writer: a planar face whose loop passes one vertex twice (two pieces touching at a point) goes out
    //    as two loops; one loop read back with an edge shared by four faces (t6028, also t6011, t6022, m6035)
    test('rfQJ: fuzz t6028 (a cross hole as wide as the keyway it crosses: the keyway floor in two pieces touching at a point): Anvil\'s STEP reads back closed at the volume to 1e-8', function () {
      var r = rfQJbuild('p.units("in");\np.sketch("Top").circle(0, 0, 0.5).circle(0, 0, 0.25).end().extrude(1.5);\np.sketch("Top", 2.5).rect(-0.0625, 0.2, 0.125, 0.1425).end().cut("through", { reverse: true });\np.sketch("Front", 1.5).circle(0, 0.2559, 0.0625).end().cut("through", { reverse: true });\n');
      assert(!Object.keys(r.b.errors).length, JSON.stringify(r.b.errors));
      var v = rfQJvol(r.b), st = Exchange.exportSTEP(r.m, r.b), back = K.rebuild(Exchange.newPartFromImport(Exchange.importFile('rfQJ.step', st, { units: 'in' })));
      var ck = Evaluate.checkBody(back.body), rel = (rfQJvol(back) - v) / v;
      assert(ck.openEdges.length + ck.nonManifoldEdges.length === 0, ck.openEdges.length + ' open, ' + ck.nonManifoldEdges.length + ' non-manifold read back');
      assert(Math.abs(rel) < 1e-8, 'read back ' + rel.toExponential(2));
      return (st.match(/=ADVANCED_FACE\(/g) || []).length + ' faces, read back ' + rel.toExponential(1);
    });
  })();
  // --- end rfQJ ---
