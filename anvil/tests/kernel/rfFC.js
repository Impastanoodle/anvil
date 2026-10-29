  // --- rfFC (2026-10-29, lane FC: configurations) --- Suppress / Unsuppress as SolidWorks: f.suppressed and per
  // configuration configuration.suppressed { id: true | false }; children (by id) follow; both kernels skip a suppressed
  // feature by the flag resolvedModel puts on it; scripts round-trip (p.suppress / p.unsuppress); the design table grid
  // (Kernel.designTable / applyDesignTable, TSV); assembly components referencing a part configuration (c.config) and
  // assembly configurations (component suppression / configuration).
  (function () {
    group('rfFC: suppression, configurations, design table, configurations in assemblies');
    var rfFCPart = 'p.configurations([{ name: "Default", values: {} }, { name: "NoHole", values: {} }], "Default");\n' +
      'p.sketch("Front").rect(0, 0, 100, 60).end().extrude(20);\n' +
      'var hole = p.sketch("Front", 20).circle(50, 30, 10).end().cut(0, { throughAll: true, reverse: true }).last();\n' +
      'p.fillet(2, [{ at: [0, 0, 10] }]);\n' +
      'p.suppress(hole, ["NoHole"]);';
    function rfFCVol(model) { var b = K.rebuild(model); return { b: b, v: K.massProps(K.meshFromBody(b.body)).volume }; }
    function rfFCByName(model, n) { return model.features.filter(function (f) { return f.name === n; })[0]; }

    test('rfFC: a block with a hole and a fillet; config NoHole suppresses the hole: the volume differs exactly by the hole, and switching back restores it', function () {
      var r = build(rfFCPart);
      noErrors(r);
      var a = r.mp.volume;
      r.model.activeConfiguration = 'NoHole';
      var nh = rfFCVol(r.model);
      assert(!Object.keys(nh.b.errors).length, 'no errors in NoHole: ' + JSON.stringify(nh.b.errors));
      nearRel(nh.v - a, Math.PI * 100 * 20, 1e-9, 'hole volume');
      var cut = rfFCByName(r.model, 'Cut-Extrude1'), sk = rfFCByName(r.model, 'Sketch2');
      assert(nh.b.suppressed[cut.id] && !nh.b.suppressed[sk.id], 'the cut suppressed, its sketch not: ' + JSON.stringify(nh.b.suppressed));
      r.model.activeConfiguration = 'Default';
      nearRel(rfFCVol(r.model).v, a, 1e-12, 'Default restored');
      return 'hole ' + fmt(nh.v - a);
    });

    test('rfFC: suppressing a sketch suppresses what is built from it (children by id), and the incremental cache reuses the features before it', function () {
      var r = build('p.sketch("Front").rect(0, 0, 40, 30).end().extrude(10);\np.sketch("Front", 10).circle(20, 15, 5).end().extrude(5);\np.sketch("Front").rect(50, 0, 10, 10).end().extrude(4);');
      noErrors(r);
      var sk2 = rfFCByName(r.model, 'Sketch2'), ex2 = rfFCByName(r.model, 'Boss-Extrude2');
      K.setSuppressed(r.model, sk2.id, true);
      var b = K.rebuild(r.model, r.build.cache);
      assert(b.suppressed[sk2.id] && b.suppressed[ex2.id], 'sketch and boss suppressed');
      assert(b.reused >= 2, 'reused ' + b.reused);
      nearRel(K.massProps(K.meshFromBody(b.body)).volume, 40 * 30 * 10 + 400, 1e-12, 'without the cylinder');
      assert(K.featureChildren(r.model, sk2.id).indexOf(ex2.id) >= 0, 'featureChildren');
      assert(K.featureAncestors(r.model, ex2.id).indexOf(sk2.id) >= 0, 'featureAncestors');
      K.setSuppressed(r.model, sk2.id, false);
      nearRel(rfFCVol(r.model).v, r.mp.volume, 1e-12, 'unsuppressed again');
    });

    test('rfFC: All / this / specified configurations: overrides stored only where they differ from f.suppressed', function () {
      var r = build(rfFCPart.replace('p.suppress(hole, ["NoHole"]);', 'p.configurations([{ name: "A", values: {} }, { name: "B", values: {} }, { name: "C", values: {} }], "A");'));
      var cut = rfFCByName(r.model, 'Cut-Extrude1'), id = String(cut.id);
      K.setSuppressed(r.model, cut.id, true, 'all');
      assert(cut.suppressed === true && !r.model.configurations.some(function (c) { return c.suppressed; }), 'all: f.suppressed only');
      K.setSuppressed(r.model, cut.id, false, 'this');
      assert(r.model.configurations[0].suppressed[id] === false && !r.model.configurations[1].suppressed, 'this: A unsuppressed, B / C follow f.suppressed');
      assert(!K.isSuppressed(r.model, cut.id, 'A') && K.isSuppressed(r.model, cut.id, 'B') && K.isSuppressed(r.model, cut.id, 'C'), 'states A U, B S, C S');
      K.setSuppressed(r.model, cut.id, false, ['C']);
      assert(!K.isSuppressed(r.model, cut.id, 'C') && K.isSuppressed(r.model, cut.id, 'B'), 'C unsuppressed, B kept');
      K.setSuppressed(r.model, cut.id, false, 'all');
      assert(!cut.suppressed && !r.model.configurations.some(function (c) { return c.suppressed; }), 'all: overrides cleared');
    });

    test('rfFC: generateScript round trip keeps f.suppressed and every configuration override (renumbered ids)', function () {
      var r = build(rfFCPart + '\np.suppress("Fillet1");\np.unsuppress("Fillet1", ["NoHole"]);');
      // a gap in the ids: delete the first feature's id order by inserting and removing a plane
      var s = K.generateScript(r.model);
      assert(/p\.suppress\(\[f\d+\], null, \{ exact: true \}\);/.test(s) && /p\.suppress\(\[f\d+\], \["NoHole"\], \{ exact: true \}\);/.test(s) && /p\.unsuppress\(\[f\d+\], \["NoHole"\], \{ exact: true \}\);/.test(s), 'suppress lines:\n' + s.split('\n').filter(function (l) { return /suppress/.test(l); }).join('\n'));
      var m2 = K.newModel('x'); K.runScript(m2, s);
      assert(JSON.stringify(m2.configurations) === JSON.stringify(r.model.configurations), JSON.stringify(m2.configurations));
      assert(rfFCByName(m2, 'Fillet1').suppressed === true, 'Fillet1 suppressed');
      var m3 = K.newModel('y'); K.runScript(m3, 'p.plane("Front", 5);\n' + s.replace(/^p\.name.*$/m, ''));   // ids shift by one
      var nh = m3.configurations[1].suppressed, cut3 = rfFCByName(m3, 'Cut-Extrude1');
      assert(nh[String(cut3.id)] === true, 'NoHole names the renumbered cut: ' + JSON.stringify(nh));
      var bad = false; try { K.runScript(K.newModel('z'), 'p.sketch("Front").rect(0,0,1,1).end().extrude(1);\np.suppress("Boss-Extrude1", ["Nope"]);'); } catch (e) { bad = /no configuration/.test(e.message); }
      assert(bad, 'an unknown configuration name throws');
    });

    test('rfFC: design table: variables, D1@Feature (linked through a new variable), $STATE@ columns round-trip both rows; bad cells are reported per cell', function () {
      var r = build('p.equations({ W: 100 });\np.sketch("Front").rect(0, 0, 100, 60).end().extrude(20);\np.sketch("Front", 20).circle(50, 30, 10).end().cut(0, { throughAll: true, reverse: true });');
      noErrors(r);
      var g = [['', 'W', 'D1@Boss-Extrude1', '$STATE@Cut-Extrude1'], ['Default', '100', '20', 'U'], ['NoHole', '100', '25', 'S']];
      var res = K.applyDesignTable(r.model, g);
      assert(res.ok, JSON.stringify(res.errors));
      assert(res.created.join() === 'D1_Boss_Extrude1' && rfFCByName(r.model, 'Boss-Extrude1').depth === '=D1_Boss_Extrude1', 'depth linked');
      assert(JSON.stringify(K.designTable(r.model)) === JSON.stringify(g), 'designTable reads it back: ' + JSON.stringify(K.designTable(r.model)));
      assert(JSON.stringify(K.tsvToGrid(K.gridToTSV(g))) === JSON.stringify(g), 'TSV round trip');
      var d = rfFCVol(r.model).v; r.model.activeConfiguration = 'NoHole'; var n = rfFCVol(r.model).v;
      nearRel(d, 100 * 60 * 20 - Math.PI * 100 * 20, 1e-9, 'Default');
      nearRel(n, 100 * 60 * 25, 1e-12, 'NoHole: 25 deep, no hole');
      var s = K.generateScript(r.model), m2 = K.newModel('x'); K.runScript(m2, s);
      assert(JSON.stringify(K.designTable(m2)) === JSON.stringify(g), 'the script keeps the table');
      var before = JSON.stringify(r.model.configurations);
      var bad = K.applyDesignTable(r.model, [['', 'W', '$STATE@Nope', 'D9@Boss-Extrude1'], ['A', '1', 'S', '1']]);
      assert(!bad.ok && bad.errors.length === 2 && bad.errors[0].row === 0 && bad.errors[0].col === 2, JSON.stringify(bad.errors));
      bad = K.applyDesignTable(r.model, [['', 'W', '$STATE@Cut-Extrude1'], ['A', 'W2*', 'Q'], ['A', '1', 'S']]);
      assert(!bad.ok && bad.errors.length === 1 && bad.errors[0].col === 0, 'duplicate row name: ' + JSON.stringify(bad.errors));
      bad = K.applyDesignTable(r.model, [['', 'W', '$STATE@Cut-Extrude1'], ['A', 'W2*', 'Q']]);
      assert(!bad.ok && bad.errors.some(function (e) { return e.row === 1 && e.col === 1; }) && bad.errors.some(function (e) { return e.row === 1 && e.col === 2; }), 'bad value and bad state: ' + JSON.stringify(bad.errors));
      assert(JSON.stringify(r.model.configurations) === before, 'a refused table changes nothing');
    });

    test('rfFC: an assembly with two instances of the part, one referencing NoHole, shows both bodies with the right volumes; an assembly configuration suppresses one', function () {
      var pm = K.newModel('Blk'); K.runScript(pm, rfFCPart);
      var src = JSON.stringify({ model: JSON.parse(JSON.stringify(pm, function (k, v) { return k === 'profile' ? undefined : v; })) });
      var r = buildAsm('a.insert(' + src + ', { name: "B1" });\na.insert(' + src + ', { name: "B2", config: "NoHole", position: [0, 0, 100] });');
      assert(!Object.keys(r.errors).length, JSON.stringify(r.errors));
      var mp = Assembly.massProps(r.model, r.build), full = 100 * 60 * 20;
      nearRel(mp.components[1].volume - mp.components[0].volume, Math.PI * 100 * 20, 1e-9, 'B2 has no hole');
      assert(mp.components[1].volume < full && mp.components[1].volume > full - 100, 'B2 is the filleted block');
      var B1 = Assembly.findComponent(r.model, 'B1');
      r.model.configurations = [{ name: 'Default', components: {} }, { name: 'One', components: {} }];
      r.model.activeConfiguration = 'One';
      Assembly.setComponentState(r.model, B1.id, { suppressed: true }, 'this');
      Assembly.setComponentState(r.model, 'B2', { config: null }, 'this');
      var b = Assembly.rebuild(r.model, r.build.cache), mp2 = Assembly.massProps(r.model, b);
      assert(mp2.components[0].volume === 0 && b.components[0].suppressed && !b.components[0].broken, 'B1 suppressed, not broken');
      nearRel(mp2.components[1].volume, mp.components[0].volume, 1e-9, 'B2 back to Default (the part\'s own active)');
      var s = Assembly.generateScript(r.model), m2 = Assembly.newAssembly(); Assembly.runScript(m2, s);
      assert(/config: "NoHole"/.test(s) && /a\.configuration\("One", \{ components: \{"B1":\{"suppressed":true\},"B2":\{"config":null\}\} \}\);/.test(s), s.split('\n').filter(function (l) { return /config/i.test(l); }).map(function (l) { return l.slice(-120); }).join('\n'));
      assert(m2.activeConfiguration === 'One' && Assembly.compState(m2, Assembly.findComponent(m2, 'B1')).suppressed, 'script round trip');
      r.model.activeConfiguration = 'Default';
      var b3 = Assembly.rebuild(r.model, b.cache);
      nearRel(Assembly.massProps(r.model, b3).components[1].volume, mp.components[1].volume, 1e-9, 'Default: B2 NoHole again');
    });

    test('rfFC2: p.suppress of a hole in a script takes the fillet on its edge with it (as the UI does), the volume is the plain block exactly; p.unsuppress brings the hole alone, { dependents: true } both; the script round trip sets exactly the same states', function () {
      var base = 'p.configurations([{ name: "Default", values: {} }, { name: "NoHole", values: {} }], "Default");\n' +
        'p.sketch("Front").rect(0, 0, 100, 60).end().extrude(20);\n' +
        'var hole = p.sketch("Front", 20).circle(50, 30, 10).end().cut(0, { throughAll: true, reverse: true }).last();\n' +
        'p.fillet(2, [{ at: [60, 30, 20] }]);\np.fillet(1, [{ at: [0, 0, 10] }]);\n';
      var r0 = build(base);
      noErrors(r0);
      var r = build(base + 'p.suppress(hole, ["NoHole"]);');
      var hole = rfFCByName(r.model, 'Cut-Extrude1'), f1 = rfFCByName(r.model, 'Fillet1'), f2 = rfFCByName(r.model, 'Fillet2');
      assert(K.isSuppressed(r.model, f1.id, 'NoHole') && !K.isSuppressed(r.model, f2.id, 'NoHole') && !K.isSuppressed(r.model, f1.id, 'Default'), 'Fillet1 (on the hole edge) suppressed in NoHole, Fillet2 (outer edge) not: ' + JSON.stringify(r.model.configurations));
      assert(K.suppressionChildren(r.model, [hole.id]).join() === String(f1.id), 'the kernel helper names Fillet1 only');
      r.model.activeConfiguration = 'NoHole';
      var nh = rfFCVol(r.model);
      assert(!Object.keys(nh.b.errors).length, 'no errors: ' + JSON.stringify(nh.b.errors));
      var one = build('p.sketch("Front").rect(0, 0, 100, 60).end().extrude(20);\np.fillet(1, [{ at: [0, 0, 10] }]);');
      nearRel(nh.v, one.mp.volume, 1e-12, 'NoHole = the block with only the outer fillet');
      var r2 = build(base + 'p.suppress(hole);\np.unsuppress(hole);');
      assert(!K.isSuppressed(r2.model, hole.id) && K.isSuppressed(r2.model, f1.id), 'unsuppress: the hole back, Fillet1 still suppressed');
      var r3 = build(base + 'p.suppress(hole);\np.unsuppress(hole, null, { dependents: true });');
      noErrors(r3);
      nearRel(r3.mp.volume, r0.mp.volume, 1e-12, 'with dependents: as before');
      var r4 = build(base + 'p.suppress(hole, null, { exact: true });');
      assert(!K.isSuppressed(r4.model, f1.id), '{ exact: true }: the hole only');
      var s = K.generateScript(r.model), m2 = K.newModel('x'); K.runScript(m2, s);
      assert(JSON.stringify(m2.configurations) === JSON.stringify(r.model.configurations), 'round trip: ' + JSON.stringify(m2.configurations));
      return 'NoHole ' + fmt(nh.v);
    });
  })();
