  // --- rfMG (2026-11-12, lane importperf) --- "major freezes on complex 3d imported models". The page keeps the mesh,
  // the edges and OpenCascade's exact solid on screen when a rebuild leaves every solid as it was (ui-core.js "Same
  // solids", worker.js `same`): Edit ▸ Rebuild with nothing changed, a new sketch or plane. It tells by object
  // identity, which rests on the rebuild cache handing back the very same body and tool objects for an unchanged
  // feature prefix. These tests pin that (a kernel change that copies the bodies on a cached rebuild would quietly
  // bring back a second of frozen window per rebuild on a 70 000 triangle import), and that the build without its
  // solids, which is all the worker then sends, still carries the planes, profiles and errors. The heavy part is a
  // generated mesh (a torus of quads), never a customer's geometry.
  (function () {
    group('rfMG: a rebuild that leaves the solids alone hands back the same solids (heavy imported bodies)');
    // p.importMesh of a closed torus, nu x nv quads = 2 nu nv triangles
    function rfMGcode(nu, nv) {
      return 'var P = [], T = [], nu = ' + nu + ', nv = ' + nv + ', R = 40, r = 12, i, j;\n' +
        'for (i = 0; i < nu; i++) for (j = 0; j < nv; j++) { var a = 2 * Math.PI * i / nu, b = 2 * Math.PI * j / nv; P.push((R + r * Math.cos(b)) * Math.cos(a), r * Math.sin(b), (R + r * Math.cos(b)) * Math.sin(a)); }\n' +
        'function v(i, j) { return (i % nu) * nv + (j % nv); }\n' +
        'for (i = 0; i < nu; i++) for (j = 0; j < nv; j++) T.push(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i, j + 1));\n' +
        'p.importMesh({ name: "Imported1", solids: [{ name: "Torus", positions: P, triangles: T }] });\n';
    }
    function rfMGsame(a, b) {
      if (a.bodies.length !== b.bodies.length) return 'body count ' + a.bodies.length + ' / ' + b.bodies.length;
      for (var i = 0; i < a.bodies.length; i++) if (a.bodies[i] !== b.bodies[i]) return 'body ' + i + ' is another object';
      var ka = Object.keys(a.tools || {}), kb = Object.keys(b.tools || {});
      if (ka.length !== kb.length) return 'tools ' + ka.length + ' / ' + kb.length;
      for (i = 0; i < ka.length; i++) if (a.tools[ka[i]] !== b.tools[ka[i]]) return 'tool ' + ka[i] + ' is another object';
      return '';
    }
    var rfMGS = null;
    function rfMGpart() {
      if (rfMGS) return rfMGS;
      var r = build(rfMGcode(100, 80));
      noErrors(r);
      return (rfMGS = r);
    }

    test('rfMG: an imported body of 16 000 triangles: built, closed, the volume of the torus', function () {
      var r = rfMGpart();
      assert(r.mesh.triCount === 16000, r.mesh.triCount + ' triangles');
      assert(r.build.bodies.length === 1, r.build.bodies.length + ' bodies');
      // the faceted torus is a little under 2 pi^2 R r^2
      var v = K.massProps(r.mesh, 1).volume, exact = 2 * Math.PI * Math.PI * 40 * 12 * 12;
      assert(v < exact && v > exact * 0.995, 'volume ' + v + ' against ' + exact);
    });

    test('rfMG: the unchanged model rebuilds to the very same body and tool objects, three times, quickly', function () {
      var r = rfMGpart(), b = r.build, t0 = performance.now();
      for (var k = 0; k < 3; k++) {
        var n = K.rebuild(r.model, b.cache);
        var why = rfMGsame(n, r.build);
        assert(!why, 'rebuild ' + (k + 1) + ': ' + why);
        assert(n.reused === r.model.features.length, 'reused ' + n.reused + ' of ' + r.model.features.length + ' features');
        b = n;
      }
      var ms = performance.now() - t0;
      assert(ms < 6000, 'three cached rebuilds took ' + Math.round(ms) + ' ms');
      rfMGS.last = b;
    });

    test('rfMG: a sketch and a plane after it leave the solids the same objects; their profile and frame are in the build', function () {
      var r = rfMGpart(), before = r.model.features.length;
      K.runScript(r.model, 'p.sketch("Front").rect(0, 0, 5, 5).end();\np.plane("Top", 10);\n');
      assert(r.model.features.length === before + 2, 'features ' + r.model.features.length);
      var n = K.rebuild(r.model, (rfMGS.last || r.build).cache), why = rfMGsame(n, r.build);
      assert(!why, why);
      var sk = r.model.features[before], pl = r.model.features[before + 1];
      assert(n.profiles[sk.id] && n.profiles[sk.id].loops, 'the sketch has its profile');
      assert(n.planes[pl.id], 'the plane has its frame');
      assert(!Object.keys(n.errors).length, 'errors: ' + JSON.stringify(n.errors));
      rfMGS.last = n;
    });

    test('rfMG: that build without its solids packs small and unpacks with planes, profiles and errors (what the worker sends)', function () {
      var r = rfMGpart(), n = rfMGS.last, shell = {};
      Object.keys(n).forEach(function (k) { shell[k] = n[k]; });
      shell.bodies = []; shell.body = null; shell.tools = {};
      var packed = K.packBuild(shell, r.model), bytes = JSON.stringify(packed).length;
      assert(bytes < 20000, 'the packed build is ' + bytes + ' characters');
      assert(!K.packTransferables(packed).length, 'no buffers to transfer');
      var u = K.unpackBuild(packed);
      assert(u.bodies.length === 0 && !u.body, 'no solids in it');
      assert(Object.keys(u.planes).length === Object.keys(n.planes).length && Object.keys(u.profiles).length === Object.keys(n.profiles).length, 'planes and profiles');
      assert(JSON.stringify(u.errors) === JSON.stringify(n.errors), 'errors');
    });

    test('rfMG: a boss apart from it is a second body: the imported body is still the same object, the body list is not', function () {
      var r = rfMGpart();
      K.runScript(r.model, 'p.sketch("Top").rect(200, 200, 10, 10).end().extrude(5);\n');
      var n = K.rebuild(r.model, rfMGS.last.cache);
      assert(!Object.keys(n.errors).length, 'errors: ' + JSON.stringify(n.errors));
      assert(n.bodies.length === 2, n.bodies.length + ' bodies');
      assert(n.bodies[0] === r.build.bodies[0], 'the imported body was built again');
      assert(rfMGsame(n, r.build) !== '', 'the solids differ, and the test for "the same" says so');
    });
  })();
  // --- end rfMG ---
