  // --- rfOB (2026-11-17, lane chamfertypes) --- Chamfer with two distances or an angle, end to end. rfNT built the
  // kernel part (f.d2, f.angle, f.flip). Here:
  // 1. kernel-script.js: p.chamfer(d, edges, { d2 | angle, flip }) passes the options on (they were dropped) and
  //    generateScript writes them back, so such a part round-trips through its script; a plain chamfer's script line is
  //    what it was.
  // 2. occt-kernel.js edgeMaker: BRepFilletAPI_MakeChamfer.Add_3(d, d2, E, F) / AddDA(d, angle, E, F) on the face
  //    Kernel.chamferFace names (it called Add_2(d, E) whatever the feature said: an equal chamfer, no message). Both
  //    engines against the closed forms to 1e-9. The OpenCascade rows run under Node where anvil/vendor/occt is present
  //    (a worktree: a junction to the main tree's folder); they say "skipped" in the browser and where it is not.
  //    An engine without the two calls (the native addon until it is rebuilt) answers 'unsupported': Anvil's engine
  //    keeps the part.
  // 3. the same chamfer under a Linear Pattern, a Mirror, an equation and a configuration, through STEP and in a flat
  //    pattern.
  (function () {
    group('rfOB: Chamfer with two distances or an angle: script round trip, both engines against the closed forms, patterns, configurations, STEP, flat pattern');
    var PI = Math.PI, T30 = Math.tan(PI / 6), T60 = Math.tan(PI / 3);
    var rfOBBLOCK = 'p.units("in");\np.sketch("Top").rect(0, -2, 3, 2).end().extrude(1);\n';   // x 0..3, y 0..1, z 0..2
    var rfOBHOLE = rfOBBLOCK + 'p.hole("Top", 1.5, -1, 1, { offset: 1 });\n';                     // a through hole, R .5
    var rfOBCYL = 'p.units("in");\np.cylinder(1, 2);\n';                                         // R 1, y 0..2
    // a 4 x 3 plate with R.5 corners, 1 thick: the top face's outline is one tangent chain
    var rfOBPLATE = 'p.units("in");\np.sketch("Top").line(0.5, 0, 3.5, 0).arc(3.5, -0.5, 0.5, 0, 90).line(4, -0.5, 4, -2.5).arc(3.5, -2.5, 0.5, -90, 0).line(3.5, -3, 0.5, -3).arc(0.5, -2.5, 0.5, 180, 270).line(0, -2.5, 0, -0.5).arc(0.5, -0.5, 0.5, 90, 180).end().extrude(1);\n';
    var rfOBCORNER = '[[1.5, 1, 0], [3, 1, 1], [3, 0.5, 0]]';   // three edges meeting at (3, 1, 0)
    // a ring cut off a rim: a on the flat face (radially), b along the wall; outside = a boss's rim (the ring's
    // centroid a / 3 inside the edge circle), else a hole's
    function rfOBring(R, a, b, outside) { return PI * a * b * (outside ? R - a / 3 : R + a / 3); }
    function rfOBchain(a, b) { return 12 - (1 - PI / 4) - a * b / 2 * (10 + 2 * PI * (0.5 - a / 3)); }
    function rfOBopt(o) { return JSON.stringify(o); }
    // [name, script, exact volume]: the acceptance list (a block edge, a hole rim, a cylinder rim, a tangent chain,
    // three edges at a corner, flip on and off, an angle of 30 and 60)
    var rfOBCASES = [
      ['block edge, D1 .25 / D2 .5', rfOBBLOCK + 'p.chamfer(0.25, [[1.5, 1, 0]], { d2: 0.5 });', 6 - 0.5 * 0.25 * 0.5 * 3],
      ['block edge, D1 .25 / D2 .5, flipped', rfOBBLOCK + 'p.chamfer(0.25, [[1.5, 1, 0]], { d2: 0.5, flip: true });', 6 - 0.5 * 0.25 * 0.5 * 3],
      ['block edge, D .25 at 30 deg', rfOBBLOCK + 'p.chamfer(0.25, [[1.5, 1, 0]], { angle: 30 });', 6 - 0.5 * 0.25 * 0.25 * T30 * 3],
      ['block edge, D .25 at 60 deg', rfOBBLOCK + 'p.chamfer(0.25, [[1.5, 1, 0]], { angle: 60 });', 6 - 0.5 * 0.25 * 0.25 * T60 * 3],
      ['block edge, D .25 at 60 deg, flipped', rfOBBLOCK + 'p.chamfer(0.25, [[1.5, 1, 0]], { angle: 60, flip: true });', 6 - 0.5 * 0.25 * 0.25 * T60 * 3],
      ['hole rim, .1 on the flat face / .05 down the wall', rfOBHOLE + 'p.chamfer(0.1, [[2, 1, 1]], { d2: 0.05 });', 6 - PI / 4 - rfOBring(0.5, 0.1, 0.05, false)],
      ['hole rim, flipped (.1 down the wall)', rfOBHOLE + 'p.chamfer(0.1, [[2, 1, 1]], { d2: 0.05, flip: true });', 6 - PI / 4 - rfOBring(0.5, 0.05, 0.1, false)],
      ['hole rim, .1 at 30 deg', rfOBHOLE + 'p.chamfer(0.1, [[2, 1, 1]], { angle: 30 });', 6 - PI / 4 - rfOBring(0.5, 0.1, 0.1 * T30, false)],
      ['hole rim, .1 at 60 deg, flipped', rfOBHOLE + 'p.chamfer(0.1, [[2, 1, 1]], { angle: 60, flip: true });', 6 - PI / 4 - rfOBring(0.5, 0.1 * T60, 0.1, false)],
      ['cylinder rim, .25 on the top / .1 down the wall', rfOBCYL + 'p.chamfer(0.25, [[1, 2, 0]], { d2: 0.1 });', 2 * PI - rfOBring(1, 0.25, 0.1, true)],
      ['cylinder rim, flipped', rfOBCYL + 'p.chamfer(0.25, [[1, 2, 0]], { d2: 0.1, flip: true });', 2 * PI - rfOBring(1, 0.1, 0.25, true)],
      ['cylinder rim, .25 at 30 deg', rfOBCYL + 'p.chamfer(0.25, [[1, 2, 0]], { angle: 30 });', 2 * PI - rfOBring(1, 0.25, 0.25 * T30, true)],
      ['cylinder rim, .25 at 60 deg', rfOBCYL + 'p.chamfer(0.25, [[1, 2, 0]], { angle: 60 });', 2 * PI - rfOBring(1, 0.25, 0.25 * T60, true)],
      ['tangent chain picked on a straight, .2 / .1', rfOBPLATE + 'p.chamfer(0.2, [[2, 1, 0]], { d2: 0.1 });', rfOBchain(0.2, 0.1)],
      ['tangent chain picked on a corner, .2 / .1', rfOBPLATE + 'p.chamfer(0.2, [[' + (3.5 + 0.5 * Math.SQRT1_2) + ', 1, ' + (0.5 - 0.5 * Math.SQRT1_2) + ']], { d2: 0.1 });', rfOBchain(0.2, 0.1)],
      ['tangent chain, flipped', rfOBPLATE + 'p.chamfer(0.2, [[2, 1, 0]], { d2: 0.1, flip: true });', rfOBchain(0.1, 0.2)],
      ['tangent chain, .2 at 60 deg', rfOBPLATE + 'p.chamfer(0.2, [[2, 1, 0]], { angle: 60 });', rfOBchain(0.2, 0.2 * T60)],
      // (the block cut by the three chamfer planes and the plane through the three setback corners: kernel/rfNT.js)
      ['three edges at a corner, .25 / .5', rfOBBLOCK + 'p.chamfer(0.25, ' + rfOBCORNER + ', { d2: 0.5 });', 5.65625],
      ['three edges at a corner, .25 / .5, flipped', rfOBBLOCK + 'p.chamfer(0.25, ' + rfOBCORNER + ', { d2: 0.5, flip: true });', 5.65625],
      ['three edges at a corner, .25 at 30 deg', rfOBBLOCK + 'p.chamfer(0.25, ' + rfOBCORNER + ', { angle: 30 });', 5.896489968290086]
    ];
    // base 6 x .5 x 2 with two 1 x 1 x 1 bosses (x 1..2 and 4..5, z .5..1.5): a chamfer on the first, copied to the second
    var rfOBBOSSES = 'p.units("in");\np.sketch("Top").rect(0, -2, 6, 2).end().extrude(0.5);\np.sketch("Top", 0.5).rect(1, -1.5, 1, 1).end().extrude(1);\np.sketch("Top", 0.5).rect(4, -1.5, 1, 1).end().extrude(1);\n';
    var rfOBEQ = 'p.units("in");\np.equations({ W: 0.5, E: "=W/2" });\np.configurations([{ name: "Wide", values: { W: 0.8 } }]);\n';
    var rfOBMORE = [
      ['Linear Pattern of a two-distance chamfer (a boss\'s upright edge)', rfOBBOSSES + 'var c = p.chamfer(0.1, [[2, 1, 0.5]], { d2: 0.3 }).last();\np.linearPattern({ feature: c, dir: "x", spacing: 3, count: 2 });', 8 - 2 * 0.015],
      ['Mirror of a two-distance chamfer (a boss\'s top edge)', rfOBBOSSES + 'var c = p.chamfer(0.1, [[2, 1.5, 1]], { d2: 0.3 }).last();\np.mirror("Right", { feature: c, offset: 3 });', 8 - 2 * 0.015],
      ['d = E, d2 = W by equations (W .5, E = W/2)', rfOBEQ + 'p.sketch("Top").rect(0, -2, 3, 2).end().extrude(1);\np.chamfer("=E", [[1.5, 1, 0]], { d2: "=W" });', 6 - 0.5 * 0.25 * 0.5 * 3],
      ['the same in the configuration Wide (W .8)', rfOBEQ + 'p.sketch("Top").rect(0, -2, 3, 2).end().extrude(1);\np.chamfer("=E", [[1.5, 1, 0]], { d2: "=W" });\np.activeConfiguration("Wide");', 6 - 0.5 * 0.4 * 0.8 * 3]
    ];
    function rfOBbuild(code) {
      var r = build(code), open = 0, nm = 0;
      (r.build.bodies || []).forEach(function (x) { var c = Evaluate.checkBody(x); open += c.openEdges.length; nm += c.nonManifoldEdges.length; });
      r.open = open; r.nm = nm;
      return r;
    }
    function rfOBchamfer(m) { return m.features.filter(function (f) { return f.type === 'chamfer'; })[0]; }
    function rfOBkeys(f) { return Object.keys(f).filter(function (k) { return k !== 'id' && k !== 'name' && k !== 'edges'; }).sort().map(function (k) { return k + '=' + JSON.stringify(f[k]); }).join(' '); }

    // ---------------------------------------------------------------- 1. the script API
    test('rfOB: p.chamfer(d, edges, { d2 | angle, flip }) puts the options into the feature (they were dropped): d2 alone, angle alone, angle before d2 when both are given, flip only when true, "=expr" strings kept; a plain chamfer is the feature it was', function () {
      function f(opts) { var m = K.newModel('rfOB'); K.runScript(m, rfOBBLOCK + 'p.chamfer(0.25, [[1.5, 1, 0]]' + (opts ? ', ' + opts : '') + ');'); return rfOBkeys(rfOBchamfer(m)); }
      assert(f('') === 'd=0.25 type="chamfer"', 'plain: ' + f(''));
      assert(f('{ name: "C" }') === 'd=0.25 type="chamfer"', 'named: ' + f('{ name: "C" }'));
      assert(f('{ d2: 0.5 }') === 'd=0.25 d2=0.5 type="chamfer"', 'd2: ' + f('{ d2: 0.5 }'));
      assert(f('{ angle: 30 }') === 'angle=30 d=0.25 type="chamfer"', 'angle: ' + f('{ angle: 30 }'));
      assert(f('{ angle: 30, d2: 0.5 }') === 'angle=30 d=0.25 type="chamfer"', 'the angle wins: ' + f('{ angle: 30, d2: 0.5 }'));
      assert(f('{ d2: 0.5, flip: true }') === 'd=0.25 d2=0.5 flip=true type="chamfer"', 'flip: ' + f('{ d2: 0.5, flip: true }'));
      assert(f('{ d2: 0.5, flip: false }') === 'd=0.25 d2=0.5 type="chamfer"', 'flip false is not stored: ' + f('{ d2: 0.5, flip: false }'));
      assert(f('{ d2: "=W", chain: false }') === 'd=0.25 d2="=W" type="chamfer"', 'an equation: ' + f('{ d2: "=W", chain: false }'));
      assert(f('{ angle: "=A" }') === 'angle="=A" d=0.25 type="chamfer"', 'an equation in the angle: ' + f('{ angle: "=A" }'));
      return f('{ d2: 0.5, flip: true }');
    });
    test('rfOB: generateScript writes d2 / angle / flip back: each part comes back from its own script as the same features with the same volume; a plain chamfer\'s script line has no new option', function () {
      var plain = build(rfOBBLOCK + 'p.chamfer(0.25, [[1.5, 1, 0]]);'), line = K.generateScript(plain.model).split('\n').filter(function (l) { return /p\.chamfer/.test(l); })[0];
      assert(line === 'var f3 = p.chamfer(0.25, [{"at":[1.5,1,0],"chain":true}], { name: "Chamfer1" }).last();', 'a plain chamfer\'s line: ' + line);
      var n = 0, seen = [];
      rfOBCASES.concat(rfOBMORE).forEach(function (c) {
        var a = build(c[1]); noErrors(a);
        var script = K.generateScript(a.model), b = build(script); noErrors(b);
        var fa = a.model.features.filter(function (f) { return f.type === 'chamfer'; }), fb = b.model.features.filter(function (f) { return f.type === 'chamfer'; });
        assert(fa.length === 1 && fb.length === 1 && rfOBkeys(fa[0]) === rfOBkeys(fb[0]), c[0] + ': the chamfer came back as ' + rfOBkeys(fb[0] || {}) + ', was ' + rfOBkeys(fa[0]));
        var picks = function (f) { return JSON.stringify(f.edges.map(function (e) { return [e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }), e.chain !== false]; })); };   // (a script keeps picks to 1e-4)
        assert(picks(fa[0]) === picks(fb[0]), c[0] + ': the picks ' + picks(fb[0]) + ', were ' + picks(fa[0]));
        nearRel(b.mp.volume, a.mp.volume, 1e-13, c[0] + ': volume from the script');   // (a pick rounded to 1e-4 can start the chain at another chord)
        assert(K.generateScript(b.model) === script, c[0] + ': the script of the script differs');
        var l = script.split('\n').filter(function (x) { return /p\.chamfer/.test(x); })[0].replace(/^.*\], /, '').replace(/\)\.last\(\);$/, '');
        if (seen.indexOf(l) < 0) seen.push(l);
        n++;
      });
      assert(seen.indexOf('{ name: "Chamfer1", d2: 0.5, flip: true }') >= 0 && seen.indexOf('{ name: "Chamfer1", angle: 30 }') >= 0 && seen.indexOf('{ name: "Chamfer1", d2: "=W" }') >= 0, 'the option texts: ' + seen.join(' | '));
      return n + ' parts through their scripts; ' + seen.length + ' option texts, e.g. ' + seen[1];
    });

    // ---------------------------------------------------------------- 2. both engines against the closed forms
    test('rfOB: Anvil\'s engine: a block edge, a hole rim, a cylinder rim, a tangent chain and three edges at a corner with two distances or an angle (30 and 60 deg), flipped and not: closed solids, the closed forms to 1e-9', function () {
      var worst = 0;
      rfOBCASES.forEach(function (c) {
        var r = rfOBbuild(c[1]);
        noErrors(r);
        assert(!r.open && !r.nm, c[0] + ': ' + r.open + ' open, ' + r.nm + ' non-manifold edges');
        nearRel(r.mp.volume, c[2], 1e-9, c[0]);
        worst = Math.max(worst, Math.abs(r.mp.volume - c[2]) / c[2]);
      });
      return rfOBCASES.length + ' parts, the worst ' + worst.toExponential(1) + ' off its formula';
    });
    // OpenCascade under Node: one worker thread loads the engine (about 8 s) and builds every case; this thread waits
    // for it (Atomics.wait), so the rows below are plain synchronous tests and the page's 10 s limit for a promise
    // does not apply. -> { rows: { name: { volume, valid, ok, unsupported, bodies, faces, bad } } } | { skipped: why }
    var rfOBocc = null;
    function rfOBworker() {
      var wt = require('worker_threads'), path = require('path'), d = wt.workerData, flag = new Int32Array(d.sab);
      function done(msg) { d.port.postMessage(msg); Atomics.store(flag, 0, 1); Atomics.notify(flag, 0); }
      try {
        var req = require('module').createRequire(path.join(d.dir, 'x.js'));
        var g = req('./load.js').load({ occt: true }), K = g.Kernel, O = g.OcctKernel;
        req('./occt.js').loadOpenCascade({}).then(function (r) {
          var oc = r.oc;
          // the same engine without Add_3 / AddDA on its chamfer maker: the native addon before it is rebuilt
          var bare = new Proxy(oc, { get: function (t, k) {
            if (k !== 'BRepFilletAPI_MakeChamfer') return t[k];
            return function (body) {
              var mk = new t.BRepFilletAPI_MakeChamfer(body);
              return new Proxy(mk, { get: function (o, m) { if (m === 'Add_3' || m === 'AddDA') return undefined; var v = o[m]; return typeof v === 'function' ? v.bind(o) : v; } });
            };
          } });
          var rows = {};
          d.cases.forEach(function (c) {
            try {
              var m = K.newModel('rfOB'); K.runScript(m, c.code);
              var o = O.build(c.bare ? bare : oc, K, m, {});
              rows[c.name] = { volume: o.volume, valid: o.valid, ok: o.ok, unsupported: o.unsupported, bodies: o.bodies, faces: o.faces ? o.faces.length : null,
                bad: Object.keys(o.status).filter(function (k) { return o.status[k] !== 'ok'; }).map(function (k) { return o.status[k]; }) };
            } catch (e) { rows[c.name] = { error: String((e && e.message) || e) }; }
          });
          done({ rows: rows, loadMs: r.loadMs });
        }, function (e) { done({ skipped: 'the OpenCascade engine did not load: ' + String((e && e.message) || e) }); });
      } catch (e) { done({ skipped: 'the OpenCascade engine did not start: ' + String((e && e.message) || e) }); }
    }
    function rfOBocct() {
      if (rfOBocc) return rfOBocc;
      var gm = typeof process !== 'undefined' && process && process.getBuiltinModule;
      if (!gm) return (rfOBocc = { skipped: 'skipped: not under Node (tests/occt-tests.html and node anvil/headless/anvil.js test --only rfOB run OpenCascade)' });
      var fs = gm('fs'), path = gm('path'), wt = gm('worker_threads');
      var dir = [path.resolve('anvil/headless'), path.resolve('headless')].filter(function (x) { return fs.existsSync(path.join(x, 'occt.js')) && fs.existsSync(path.join(x, 'load.js')); })[0];
      if (!dir) return (rfOBocc = { skipped: 'skipped: anvil/headless was not found from ' + process.cwd() });
      var eng = path.resolve(dir, '..', 'vendor', 'occt');
      if (!fs.existsSync(path.join(eng, 'opencascade.full.js')) || !fs.existsSync(path.join(eng, 'opencascade.full.wasm'))) return (rfOBocc = { skipped: 'skipped: no OpenCascade engine in anvil/vendor/occt (anvil/vendor/get-occt.ps1; in a worktree a junction to the main tree\'s folder)' });
      var cases = rfOBCASES.concat(rfOBMORE).map(function (c) { return { name: c[0], code: c[1] }; });
      cases.push({ name: 'equal', code: rfOBBLOCK + 'p.chamfer(0.25, [[1.5, 1, 0]]);' });
      cases.push({ name: 'equal by d2', code: rfOBBLOCK + 'p.chamfer(0.25, [[1.5, 1, 0]], { d2: 0.25, flip: true });' });
      cases.push({ name: 'bare equal', code: rfOBBLOCK + 'p.chamfer(0.25, [[1.5, 1, 0]]);', bare: true });
      cases.push({ name: 'bare d2', code: rfOBCASES[0][1], bare: true });
      cases.push({ name: 'bare angle', code: rfOBCASES[2][1], bare: true });
      var sab = new SharedArrayBuffer(4), flag = new Int32Array(sab), ch = new wt.MessageChannel();
      var w = new wt.Worker('(' + rfOBworker.toString() + ')()', { eval: true, workerData: { dir: dir, cases: cases, sab: sab, port: ch.port2 }, transferList: [ch.port2] });
      var waited = Atomics.wait(flag, 0, 0, 240000), got = null;
      for (var i = 0; i < 200 && !got; i++) { got = wt.receiveMessageOnPort(ch.port1); if (!got) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); }
      try { w.terminate(); ch.port1.close(); } catch (e) { }
      if (!got) fail('OpenCascade did not answer in 240 s (' + waited + ')');
      return (rfOBocc = got.message);
    }
    function rfOBrow(o, name) { var r = o.rows[name]; if (!r) fail('no OpenCascade row ' + name); if (r.error) fail(name + ': ' + r.error); return r; }
    test('rfOB: OpenCascade builds the same parts with BRepFilletAPI_MakeChamfer Add(d, d2, E, F) / AddDA(d, angle, E, F) on the face Kernel.chamferFace names: valid, one body, the closed forms to 1e-9 (it built an equal-distance chamfer whatever the feature said)', function () {
      var o = rfOBocct();
      if (o.skipped) return o.skipped;
      var worst = 0;
      rfOBCASES.forEach(function (c) {
        var r = rfOBrow(o, c[0]);
        assert(r.ok && !r.unsupported && r.valid && r.bodies === 1, c[0] + ': OpenCascade ' + JSON.stringify(r));
        nearRel(r.volume, c[2], 1e-9, 'OpenCascade, ' + c[0]);
        worst = Math.max(worst, Math.abs(r.volume - c[2]) / c[2]);
      });
      return rfOBCASES.length + ' parts, the worst ' + worst.toExponential(1) + ' off its formula; engine loaded in ' + (o.loadMs / 1000).toFixed(1) + ' s';
    });
    test('rfOB: OpenCascade: an equal-distance chamfer is built as before (d2 equal to d, flipped or not, is that chamfer to the last bit); a Linear Pattern and a Mirror of a two-distance chamfer, and one driven by equations in two configurations, match the closed forms', function () {
      var o = rfOBocct();
      if (o.skipped) return o.skipped;
      var e = rfOBrow(o, 'equal'), e2 = rfOBrow(o, 'equal by d2');
      assert(e.ok && e.valid && e.volume === e2.volume && e.faces === e2.faces, 'equal ' + JSON.stringify(e) + ' / by d2 ' + JSON.stringify(e2));
      nearRel(e.volume, 6 - 0.5 * 0.0625 * 3, 1e-12, 'the equal chamfer');
      rfOBMORE.forEach(function (c) {
        var r = rfOBrow(o, c[0]);
        assert(r.ok && !r.unsupported && r.valid && r.bodies === 1, c[0] + ': OpenCascade ' + JSON.stringify(r));
        nearRel(r.volume, c[2], 1e-9, 'OpenCascade, ' + c[0]);
      });
      return 'equal ' + e.volume + ' (' + e.faces + ' faces); ' + rfOBMORE.length + ' more parts';
    });
    test('rfOB: an OpenCascade engine without Add_3 / AddDA on its chamfer maker (the native addon binds only the calls recorded in desktop/native/api-surface.json) says "unsupported" for a two-distance or angle chamfer, so Anvil\'s engine keeps the part; an equal-distance chamfer still builds on it', function () {
      var o = rfOBocct();
      if (o.skipped) return o.skipped;
      var a = rfOBrow(o, 'bare d2'), b = rfOBrow(o, 'bare angle'), e = rfOBrow(o, 'bare equal');
      assert(a.unsupported === 'Chamfer with two distances' && !a.ok && a.bad.join() === 'unsupported', 'two distances: ' + JSON.stringify(a));
      assert(b.unsupported === 'Chamfer by angle and distance' && !b.ok, 'angle: ' + JSON.stringify(b));
      assert(e.ok && !e.unsupported && e.volume === rfOBrow(o, 'equal').volume, 'equal: ' + JSON.stringify(e));
      return a.unsupported + ' / ' + b.unsupported + '; equal ' + e.volume;
    });

    // ---------------------------------------------------------------- 3. around the feature
    test('rfOB: a two-distance chamfer under a Linear Pattern and a Mirror, and one driven by equations (d = E, d2 = W) in two configurations: Anvil\'s engine against the closed forms (1e-9); DIM_FIELDS names d2 and angle, so D2@Chamfer1 can be used in an equation', function () {
      rfOBMORE.forEach(function (c) {
        var r = rfOBbuild(c[1]);
        noErrors(r);
        assert(!r.open && !r.nm, c[0] + ': ' + r.open + ' open, ' + r.nm + ' non-manifold edges');
        nearRel(r.mp.volume, c[2], 1e-9, c[0]);
      });
      assert(JSON.stringify(K.DIM_FIELDS.chamfer) === '["d","d2","angle"]', 'DIM_FIELDS.chamfer ' + JSON.stringify(K.DIM_FIELDS.chamfer));
      return rfOBMORE.length + ' parts';
    });
    test('rfOB: STEP: a block with a two-distance chamfer and an angle chamfer round a hole comes back from Anvil\'s own STEP file with the same volume (1e-12)', function () {
      if (typeof Exchange === 'undefined') fail('exchange.js is not loaded');
      var r = rfOBbuild(rfOBHOLE + 'p.chamfer(0.25, [[1.5, 1, 0]], { d2: 0.5 });\np.chamfer(0.1, [[2, 1, 1]], { angle: 30 });');
      noErrors(r);
      var want = 6 - PI / 4 - 0.5 * 0.25 * 0.5 * 3 - rfOBring(0.5, 0.1, 0.1 * T30, false);
      nearRel(r.mp.volume, want, 1e-9, 'the part');
      var res = Exchange.importFile('rfOB.step', Exchange.exportSTEP(r.model, r.build), { units: 'in' }), m2 = Exchange.newPartFromImport(res), b2 = K.rebuild(m2);
      assert(!Object.keys(b2.errors).length, 'read back: ' + JSON.stringify(b2.errors));
      var v2 = K.massProps(K.meshFromBody(b2.body), 1).volume;
      nearRel(v2, r.mp.volume, 1e-12, 'the part read back from STEP');
      return 'volume ' + r.mp.volume.toFixed(9) + ', read back ' + v2.toFixed(9);
    });
    test('rfOB: sheet metal: a 16 ga base flange with an edge flange and a two-distance chamfer through the thickness at a free corner (.5 along one edge, .25 along the other): the flat pattern loses exactly the corner triangle (area .0625), cut .25 x .5 as the folded part', function () {
      var Tk = 0.0598, base = 'p.units("in");\np.sheet(' + Tk + ', ' + Tk + ', 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, ' + Tk + ', 0]]);\n';
      var a = rfOBbuild(base), b = rfOBbuild(base + 'p.chamfer(0.5, [[4, ' + Tk / 2 + ', 3]], { d2: 0.25 });');
      noErrors(a); noErrors(b);
      nearRel(a.mp.volume - b.mp.volume, 0.0625 * Tk, 1e-9, 'the folded part lost the corner prism');
      function area(fp) { var s = 0; fp.loops.forEach(function (lp) { for (var i = 0; i < lp.length; i++) { var p = lp[i], q = lp[(i + 1) % lp.length]; s += p[0] * q[1] - q[0] * p[1]; } }); return Math.abs(s) / 2; }
      var fa = K.flatPattern(a.model, a.build, a.mesh), fb = K.flatPattern(b.model, b.build, b.mesh);
      assert(!(fb.warnings || []).length, 'flat pattern warnings: ' + JSON.stringify(fb.warnings));
      near(area(fa) - area(fb), 0.0625, 1e-9, 'the blank lost the corner triangle');
      var pts = fb.loops[0], has = function (x, y) { return pts.some(function (p) { return Math.abs(p[0] - x) < 1e-9 && Math.abs(p[1] - y) < 1e-9; }); };
      assert(has(3.75, -3) && has(4, -2.5) && !has(4, -3), 'the corner of the blank: ' + JSON.stringify(pts));
      return 'blank ' + area(fb).toFixed(6) + ' (' + area(fa).toFixed(6) + ' without the chamfer)';
    });
  })();
  // --- end rfOB ---
