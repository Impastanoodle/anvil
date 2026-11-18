  // --- rfPB (2026-11-17, lane chamferpat) --- Mirror / Circular Pattern of a Chamfer with two distances or an angle.
  // A feature-mode Mirror / LPattern / CirPattern of a chamfer runs the chamfer again at the copied picks (rfGB,
  // kernel-rebuild.js edgeFamily; occt-kernel.js edgeFeatureCopies). Kernel.chamferFace puts d on the face looking
  // more to +Y, then +X, then +Z, so at a mirrored or rotated copy of an upright edge it named the other face: the copy
  // had d and d2 swapped (same volume, not the mirror / rotated image). Now each copy takes the rule at the original
  // edge (its normals taken back through the copy's linear part). Measured here: the volume and the centre of volume
  // of each part against the closed form (the base solids minus every removed triangular prism, the copies' prisms
  // being the original's moved by the copy's map), both engines, 1e-9; and the two engines against each other.
  (function () {
    group('rfPB: Mirror / Circular Pattern of a two-distance or angle chamfer is the mirror / rotated image of it, on both engines');
    var T25 = Math.tan(25 * Math.PI / 180), T30 = Math.tan(Math.PI / 6);
    // B: a 6 x .5 x 2 base (x 0..6, y 0..0.5, z 0..2) with 1 x 1 x 1 bosses at x 1..2 and 4..5 (z .5..1.5)
    var rfPBB = 'p.units("in");\np.sketch("Top").rect(0, -2, 6, 2).end().extrude(0.5);\np.sketch("Top", 0.5).rect(1, -1.5, 1, 1).end().extrude(1);\np.sketch("Top", 0.5).rect(4, -1.5, 1, 1).end().extrude(1);\n';
    var rfPBBbase = [[6, [3, 0.25, 1]], [1, [1.5, 1, 1]], [1, [4.5, 1, 1]]];
    // C: a 6 x .5 x 6 base with four 1 x 1 x 1 bosses round (3, y, 3), the first at x 1..2, z 2.5..3.5
    var rfPBC = 'p.units("in");\np.sketch("Top").rect(0, -6, 6, 6).end().extrude(0.5);\nvar b = p.sketch("Top", 0.5).rect(1, -3.5, 1, 1).end().extrude(1).last();\np.circularPattern({ feature: b, axis: "y", center: [3, 0, 3], count: 4 });\n';
    function rfPBrotY(deg) { var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return function (q) { var x = q[0] - 3, z = q[2] - 3; return [3 + x * c + z * s, q[1], 3 + z * c - x * s]; }; }
    var rfPBCbase = [[18, [3, 0.25, 3]]].concat([0, 90, 180, 270].map(function (d) { return [1, rfPBrotY(d)([1.5, 1, 3])]; }));
    function rfPBid(q) { return q; }
    function rfPBmirX(q) { return [6 - q[0], q[1], q[2]]; }
    function rfPBmirZ(q) { return [q[0], q[1], 6 - q[2]]; }
    function rfPBmovX(q) { return [q[0] + 3, q[1], q[2]]; }
    // a removed triangular prism along an edge, legs a and b along the unit directions u and w in the two faces
    // (away from the edge), length L, the edge's middle at m: [volume, centroid]
    function rfPBprism(m, u, a, w, b, L) { return [a * b * L / 2, [0, 1, 2].map(function (k) { return m[k] + u[k] * a / 3 + w[k] * b / 3; })]; }
    // the seed chamfers: the upright edge (2, y, z0) of a boss (faces +X and -Z): the rule puts d on +X (legs: d along
    // +Z on the +X face, d2 along -X on the -Z face); flipped, the other way round
    var PX = [1, 0, 0], NX = [-1, 0, 0], PZ = [0, 0, 1], NZ = [0, 0, -1], NY = [0, -1, 0];
    function rfPBup(x, z0, alongZ, alongX, dirX, dirZ) { return rfPBprism([x, 1, z0], dirZ, alongZ, dirX, alongX, 1); }
    // [name, script, base solids, seed prisms, maps of every instance (identity first)]
    var rfPBCASES = [
      ['the seed alone (B, D1 .1 / D2 .3 on the upright edge at x 2)', rfPBB + 'p.chamfer(0.1, [[2, 1, 0.5]], { d2: 0.3 });', rfPBBbase, [rfPBup(2, 0.5, 0.1, 0.3, NX, PZ)], [rfPBid]],
      ['Mirror (Right, offset 3) of it: d on the mirrored face', rfPBB + 'var c = p.chamfer(0.1, [[2, 1, 0.5]], { d2: 0.3 }).last();\np.mirror("Right", { feature: c, offset: 3 });', rfPBBbase, [rfPBup(2, 0.5, 0.1, 0.3, NX, PZ)], [rfPBid, rfPBmirX]],
      ['Mirror of it flipped', rfPBB + 'var c = p.chamfer(0.1, [[2, 1, 0.5]], { d2: 0.3, flip: true }).last();\np.mirror("Right", { feature: c, offset: 3 });', rfPBBbase, [rfPBup(2, 0.5, 0.3, 0.1, NX, PZ)], [rfPBid, rfPBmirX]],
      ['Mirror of a D .1 at 30 deg chamfer', rfPBB + 'var c = p.chamfer(0.1, [[2, 1, 0.5]], { angle: 30 }).last();\np.mirror("Right", { feature: c, offset: 3 });', rfPBBbase, [rfPBup(2, 0.5, 0.1, 0.1 * T30, NX, PZ)], [rfPBid, rfPBmirX]],
      ['Linear Pattern of it (a copy moved: unchanged)', rfPBB + 'var c = p.chamfer(0.1, [[2, 1, 0.5]], { d2: 0.3 }).last();\np.linearPattern({ feature: c, dir: "x", spacing: 3, count: 2 });', rfPBBbase, [rfPBup(2, 0.5, 0.1, 0.3, NX, PZ)], [rfPBid, rfPBmovX]],
      ['Circular Pattern x4 about (3, y, 3)', rfPBC + 'var c = p.chamfer(0.1, [[2, 1, 2.5]], { d2: 0.3 }).last();\np.circularPattern({ feature: c, axis: "y", center: [3, 0, 3], count: 4 });', rfPBCbase, [rfPBup(2, 2.5, 0.1, 0.3, NX, PZ)], [0, 90, 180, 270].map(rfPBrotY)],
      ['Circular Pattern 3 over 180 deg (0, 90, 180)', rfPBC + 'var c = p.chamfer(0.1, [[2, 1, 2.5]], { d2: 0.3 }).last();\np.circularPattern({ feature: c, axis: "y", center: [3, 0, 3], count: 3, angle: 180 });', rfPBCbase, [rfPBup(2, 2.5, 0.1, 0.3, NX, PZ)], [0, 90, 180].map(rfPBrotY)],
      // three picks: two upright edges (d on +X at x 2, on -Z at x 1) and the top edge at z 3.5 (d on the top face);
      // at 90 deg the second upright's copy needs the flip toggled and the others not: Anvil's engine runs two features
      ['Circular Pattern x4 of a chamfer on three edges (two uprights and a top edge)', rfPBC + 'var c = p.chamfer(0.1, [[2, 1, 2.5], [1, 1, 2.5], [1.5, 1.5, 3.5]], { d2: 0.3 }).last();\np.circularPattern({ feature: c, axis: "y", center: [3, 0, 3], count: 4 });', rfPBCbase,
        [rfPBup(2, 2.5, 0.1, 0.3, NX, PZ), rfPBprism([1, 1, 2.5], PX, 0.1, PZ, 0.3, 1), rfPBprism([1.5, 1.5, 3.5], NZ, 0.1, NY, 0.3, 1)], [0, 90, 180, 270].map(rfPBrotY)],
      ['Circular Pattern x4 of a D .1 at 25 deg chamfer on two uprights', rfPBC + 'var c = p.chamfer(0.1, [[2, 1, 2.5], [1, 1, 3.5]], { angle: 25 }).last();\np.circularPattern({ feature: c, axis: "y", center: [3, 0, 3], count: 4 });', rfPBCbase,
        [rfPBup(2, 2.5, 0.1, 0.1 * T25, NX, PZ), rfPBprism([1, 1, 3.5], PX, 0.1, NZ, 0.1 * T25, 1)], [0, 90, 180, 270].map(rfPBrotY)],
      // (OpenCascade said "Mirror source feature has no geometry" for a Mirror of a Mirror of a chamfer)
      ['Mirror (Front, offset 3) of a Mirror (Right, offset 3) of it', rfPBC + 'var c = p.chamfer(0.1, [[2, 1, 2.5]], { d2: 0.3 }).last();\nvar m = p.mirror("Right", { feature: c, offset: 3 }).last();\np.mirror("Front", { feature: m, offset: 3 });', rfPBCbase, [rfPBup(2, 2.5, 0.1, 0.3, NX, PZ)],
        [rfPBid, rfPBmirX, rfPBmirZ, function (q) { return rfPBmirZ(rfPBmirX(q)); }]]
    ];
    // follow-up: a feature-mode Mirror / LPattern / CirPattern of a Shell (also of a Mirror of one) says why it copies
    // nothing, on both engines (it was "Mirror source feature has no geometry."); the part is the shelled block
    var rfPBSH = 'p.units("in");\np.sketch("Top").rect(0, -2, 6, 2).end().extrude(1);\nvar s = p.shell(0.1, [[1.5, 1, 1]]).last();\n';
    var rfPBSHELL = [
      ['Mirror of a Shell', rfPBSH + 'p.mirror("Right", { feature: s, offset: 3 });', /^Cannot mirror Shell1: a Shell hollows the whole body/],
      ['LPattern of a Shell', rfPBSH + 'p.linearPattern({ feature: s, dir: "x", spacing: 3, count: 2 });', /^Cannot pattern Shell1: a Shell hollows the whole body/],
      ['CirPattern of a Shell', rfPBSH + 'p.circularPattern({ feature: s, axis: "y", center: [3, 0, 1], count: 2 });', /^Cannot pattern Shell1: /],
      ['CirPattern of a Mirror of a Shell', rfPBSH + 'var m = p.mirror("Right", { feature: s, offset: 3 }).last();\np.circularPattern({ feature: m, axis: "y", center: [3, 0, 1], count: 2 });', /^Cannot mirror Shell1: /]   // (the Mirror fails first; the pattern of it fails after it)
    ];
    var rfPBSHELLV = 12 - 5.8 * 1.8 * 0.9;   // the 6 x 1 x 2 block shelled .1 open at the top
    // the closed form: the base solids minus every map's image of every seed prism -> { volume, centroid }
    function rfPBwant(c) {
      var V = 0, M = [0, 0, 0];
      c[2].forEach(function (s) { V += s[0]; for (var k = 0; k < 3; k++) M[k] += s[0] * s[1][k]; });
      c[4].forEach(function (map) { c[3].forEach(function (p) { var q = map(p[1]); V -= p[0]; for (var k = 0; k < 3; k++) M[k] -= p[0] * q[k]; }); });
      return { volume: V, centroid: M.map(function (x) { return x / V; }) };
    }
    function rfPBcheck(what, got, want) {
      nearRel(got.volume, want.volume, 1e-9, what + ': volume');
      for (var k = 0; k < 3; k++) near(got.centroid[k], want.centroid[k], 1e-9, what + ': centre of volume ' + 'xyz'[k] + ' (d and d2 swapped on a copy moves it by about 1e-4)');
    }

    test('rfPB: Anvil\'s engine: the seed, a Mirror (plain, flipped, by angle), a Linear Pattern, Circular Patterns (x4, 3 over 180 deg, of three edges, of an angle chamfer on two edges) and a Mirror of a Mirror: closed solids, volume and centre of volume = the closed form to 1e-9 (the copies had d and d2 swapped: x off by 1.3e-4 on the Mirror)', function () {
      var worst = 0;
      rfPBCASES.forEach(function (c) {
        var r = build(c[1]);
        noErrors(r);
        var chk = Evaluate.checkBody(r.body);
        assert(!chk.openEdges.length && !chk.nonManifoldEdges.length, c[0] + ': ' + chk.openEdges.length + ' open, ' + chk.nonManifoldEdges.length + ' non-manifold edges');
        var w = rfPBwant(c);
        rfPBcheck(c[0], r.mp, w);
        for (var k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(r.mp.centroid[k] - w.centroid[k]));
      });
      return rfPBCASES.length + ' parts, the worst centre of volume ' + worst.toExponential(1) + ' off';
    });
    test('rfPB: Edit Feature data: the Mirror / CirPattern keeps the chamfer\'s own d, d2, angle and flip (nothing is written into the copies or the source)', function () {
      var r = build(rfPBCASES[7][1]), f = r.model.features, ch = f.filter(function (x) { return x.type === 'chamfer'; })[0], cp = f[f.length - 1];
      noErrors(r);
      assert(ch.d === 0.1 && ch.d2 === 0.3 && !ch.flip && ch.edges.length === 3, 'the chamfer: ' + JSON.stringify(ch));
      assert(cp.type === 'cpattern' && cp.feature === ch.id && !('flip' in cp) && !('edges' in cp), 'the pattern: ' + JSON.stringify(cp));
      return 'chamfer ' + JSON.stringify({ d: ch.d, d2: ch.d2 }) + ', pattern of #' + cp.feature;
    });

    test('rfPB: Mirror / LPattern / CirPattern of a Shell (and of a Mirror of one) on Anvil\'s engine: the pattern fails with "Cannot mirror / pattern Shell1: a Shell hollows the whole body …" (was "source feature has no geometry"), the part stays the shelled block', function () {
      rfPBSHELL.forEach(function (c) {
        var r = build(c[1]), ids = Object.keys(r.errors).sort(function (a, b) { return a - b; }), first = r.model.features.filter(function (x) { return x.type !== 'sketch' && x.type !== 'extrude' && x.type !== 'shell'; })[0];
        assert(ids.length >= 1 && +ids[0] === first.id && c[2].test(r.errors[ids[0]]) && ids.length === r.model.features.length - 3, c[0] + ': ' + JSON.stringify(r.errors));
        nearRel(r.mp.volume, rfPBSHELLV, 1e-9, c[0] + ': the part');
      });
      return rfPBSHELL.length + ' parts; ' + build(rfPBSHELL[0][1]).errors[4];
    });
    // OpenCascade under Node in a worker thread, as rfOB does (rfOBocct): plain synchronous rows, skipped in the
    // browser and where anvil/vendor/occt is absent. -> { rows: { name: { volume, centroid, valid, ok, bodies, bad } } }
    var rfPBocc = null;
    function rfPBworker() {
      var wt = require('worker_threads'), path = require('path'), d = wt.workerData, flag = new Int32Array(d.sab);
      function done(msg) { d.port.postMessage(msg); Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); }
      try {
        var req = require('module').createRequire(path.join(d.dir, 'x.js'));
        var g = req('./load.js').load({ occt: true }), K = g.Kernel, O = g.OcctKernel;
        req('./occt.js').loadOpenCascade({}).then(function (r) {
          var rows = {};
          d.cases.forEach(function (c) {
            try {
              var m = K.newModel('rfPB'); K.runScript(m, c.code);
              var o = O.build(r.oc, K, m, {});
              rows[c.name] = { volume: o.volume, centroid: o.bodyProps && o.bodyProps[0] ? o.bodyProps[0].centroid : null, valid: o.valid, ok: o.ok, bodies: o.bodies,
                bad: Object.keys(o.status).filter(function (k) { return o.status[k] !== 'ok'; }).map(function (k) { return o.status[k]; }) };
            } catch (e) { rows[c.name] = { error: String((e && e.message) || e) }; }
          });
          done({ rows: rows, loadMs: r.loadMs });
        }, function (e) { done({ skipped: 'the OpenCascade engine did not load: ' + String((e && e.message) || e) }); });
      } catch (e) { done({ skipped: 'the OpenCascade engine did not start: ' + String((e && e.message) || e) }); }
    }
    function rfPBocct() {
      if (rfPBocc) return rfPBocc;
      var gm = typeof process !== 'undefined' && process && process.getBuiltinModule;
      if (!gm) return (rfPBocc = { skipped: 'skipped: not under Node (node anvil/headless/anvil.js test --only rfPB runs OpenCascade)' });
      var fs = gm('fs'), path = gm('path'), wt = gm('worker_threads');
      var dir = [path.resolve('anvil/headless'), path.resolve('headless')].filter(function (x) { return fs.existsSync(path.join(x, 'occt.js')) && fs.existsSync(path.join(x, 'load.js')); })[0];
      if (!dir) return (rfPBocc = { skipped: 'skipped: anvil/headless was not found from ' + process.cwd() });
      var eng = path.resolve(dir, '..', 'vendor', 'occt');
      if (!fs.existsSync(path.join(eng, 'opencascade.full.js')) || !fs.existsSync(path.join(eng, 'opencascade.full.wasm'))) return (rfPBocc = { skipped: 'skipped: no OpenCascade engine in anvil/vendor/occt (anvil/vendor/get-occt.ps1)' });
      var cases = rfPBCASES.map(function (c) { return { name: c[0], code: c[1] }; });
      rfPBSHELL.forEach(function (c) { cases.push({ name: c[0], code: c[1] }); });
      var sab = new SharedArrayBuffer(4), flag = new Int32Array(sab), ch = new wt.MessageChannel();
      var w = new wt.Worker('(' + rfPBworker.toString() + ')()', { eval: true, workerData: { dir: dir, cases: cases, sab: sab, port: ch.port2 }, transferList: [ch.port2] });
      var waited = Atomics.wait(flag, 0, 0, 240000), got = null;
      for (var i = 0; i < 200 && !got; i++) { got = wt.receiveMessageOnPort(ch.port1); if (!got) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); }
      try { w.terminate(); ch.port1.close(); } catch (e) { }
      if (!got) fail('OpenCascade did not answer in 240 s (' + waited + ')');
      return (rfPBocc = got.message);
    }
    test('rfPB: OpenCascade builds the same parts (each copy an edge feature seeded from the original\'s face normals; a Mirror of a Mirror of a chamfer said "Mirror source feature has no geometry"): valid, one body, volume and centre of volume = the closed form to 1e-9 and = Anvil\'s engine to 1e-9', function () {
      var o = rfPBocct();
      if (o.skipped) return o.skipped;
      var worst = 0;
      rfPBCASES.forEach(function (c) {
        var r = o.rows[c[0]];
        if (!r) fail('no OpenCascade row ' + c[0]);
        if (r.error) fail(c[0] + ': ' + r.error);
        assert(r.ok && r.valid && r.bodies === 1 && r.centroid, c[0] + ': OpenCascade ' + JSON.stringify(r));
        rfPBcheck('OpenCascade, ' + c[0], r, rfPBwant(c));
        var a = build(c[1]);
        nearRel(r.volume, a.mp.volume, 1e-9, c[0] + ': the two engines\' volumes');
        for (var k = 0; k < 3; k++) { near(r.centroid[k], a.mp.centroid[k], 1e-9, c[0] + ': the two engines\' centres'); worst = Math.max(worst, Math.abs(r.centroid[k] - a.mp.centroid[k])); }
      });
      return rfPBCASES.length + ' parts, the engines\' centres at most ' + worst.toExponential(1) + ' apart; engine loaded in ' + (o.loadMs / 1000).toFixed(1) + ' s';
    });
    test('rfPB: OpenCascade: Mirror / LPattern / CirPattern of a Shell fail with the same message as Anvil\'s engine, the part the shelled block', function () {
      var o = rfPBocct();
      if (o.skipped) return o.skipped;
      rfPBSHELL.forEach(function (c) {
        var r = o.rows[c[0]];
        if (!r || r.error) fail(c[0] + ': ' + JSON.stringify(r));
        assert(r.bad.length >= 1 && c[2].test(r.bad[0].replace(/^error: /, '')), c[0] + ': ' + JSON.stringify(r.bad));
        nearRel(r.volume, rfPBSHELLV, 1e-9, 'OpenCascade, ' + c[0]);
      });
      return rfPBSHELL.length + ' parts';
    });
  })();
  // --- end rfPB ---
