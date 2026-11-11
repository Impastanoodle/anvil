  // --- rfLP (2026-11-11, lane evalgrey) --- the Evaluate and Assembly commands that were greyed: Costing (costing.js,
  // sheet metal and machined, against hand arithmetic), Undercut Analysis classes on a block with a side pocket,
  // Sensors (limits, values, generateScript round trip), Compare Documents on two built parts, Performance Evaluation,
  // Hole Alignment and Smart Fasteners on a two-plate stack, explode positions. Self-contained.
  (function () {
    group('rfLP: greyed Evaluate / Assembly commands (Costing, Undercut, Sensors, Compare, Performance, Hole Alignment, Smart Fasteners)');
    var AS = Assembly, E = Evaluate, C = Costing, LB = Costing.LBIN3_PER_KGM3;
    var RFLP_BLANK = 'p.units("in");\np.material("Plain Carbon Steel");\np.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -4, 10, 4).end().baseFlange();\np.hole("Top", 2, -2, 0.5, { offset: 0.0598 });\n';
    var RFLP_BLOCK = 'p.units("mm");\np.sketch("Front").rect(0, 0, 40, 30).extrude(20);\n';
    var RFLP_PLATE = 'p.name("Plate").units("in");\np.sketch("Top").rect(0, -2, 4, 2).extrude(0.25);\np.hole("Top", 1, -1, 0.281, { offset: 0.25 });\n';
    function rfLPPlates(dx) {
      var m = AS.newAssembly(); m.units = 'in';
      var a = AS.insert(m, { script: RFLP_PLATE }, { fixed: true }), b = AS.insert(m, { script: RFLP_PLATE }, { position: [dx, 0.25, 0], fixed: true });
      var bd = AS.rebuild(m);
      return { model: m, build: bd, a: a, b: b };
    }

    test('rfLP: Costing a 16 ga blank 10 x 4 with a 1/2 hole: material on the bounding sheet, laser cut 28 + pi/2, 2 pierces, setup / lot, 25 % markup, all by hand', function () {
      var r = build(RFLP_BLANK);
      noErrors(r);
      var inp = C.inputs(r.model, r.build, r.mesh), rho = r.model.density * LB;
      assert(inp.kind === 'sheet' && inp.material === 'Plain Carbon Steel', JSON.stringify(inp));
      near(inp.thickness, 0.0598, 1e-9, 'T');
      near(inp.sheetArea, 40, 1e-6, 'sheet area');
      near(inp.blankArea, 40 - Math.PI / 16, 1e-6, 'blank area');
      near(inp.cutLength, 28 + Math.PI / 2, 1e-6, 'cut length');
      assert(inp.pierces === 2 && inp.bends === 0, 'pierces ' + inp.pierces + ' bends ' + inp.bends);
      var q = C.estimate(r.model, r.build, r.mesh);
      var mat = 40 * 0.0598 * rho * 0.55, cut = (28 + Math.PI / 2) * 0.015, pierce = 2 * 0.10, setup = 45 / 25;
      var sub = mat + cut + pierce + setup;
      near(q.lines[0].cost, mat, 1e-9, 'material');
      near(q.lines[1].cost, cut, 1e-9, 'cut');
      near(q.lines[2].cost, pierce, 1e-12, 'pierce');
      near(q.lines[3].cost, 0, 1e-12, 'bends');
      near(q.subtotal, sub, 1e-9, 'subtotal');
      near(q.perPart, sub * 1.25, 1e-9, 'per part');
      near(q.lot, sub * 1.25 * 25, 1e-7, 'lot');
      near(q.inputs.blankWeightLb, (40 - Math.PI / 16) * 0.0598 * rho, 1e-9, 'blank weight');
      // the true-blank basis and edited rates
      var q2 = C.estimate(r.model, r.build, r.mesh, { basis: 'blank', materialPerLb: { 'Plain Carbon Steel': 0.70 }, lotSize: 10, markupPct: 0, piercePer: 0.25 });
      var sub2 = (40 - Math.PI / 16) * 0.0598 * rho * 0.70 + cut + 2 * 0.25 + 45 / 10;
      near(q2.perPart, sub2, 1e-9, 'per part, blank basis');
      near(q2.lot, sub2 * 10, 1e-8, 'lot of 10');
    });

    test('rfLP: Costing a bent part: one bend at $1.25, the cut list and the quote agree; a machined block: stock + allowance, removed volume, setups', function () {
      var r = build(RFLP_BLANK + 'p.flange(1.5, [[0, 0.0598, 2]]);\n');
      noErrors(r);
      var cl = K.sheetCutList(r.model, r.build, r.mesh).values, q = C.estimate(r.model, r.build, r.mesh), rho = r.model.density * LB;
      assert(cl.Bends === 1 && q.inputs.bends === 1, 'bends ' + cl.Bends);
      near(q.lines[3].cost, 1.25, 1e-12, 'bend cost');
      near(q.inputs.sheetArea, cl['Bounding Box Length'] * cl['Bounding Box Width'], 1e-9, 'sheet area');
      near(q.inputs.cutLength, cl['Cutting Length-Outer'] + cl['Cutting Length-Inner'], 1e-9, 'cut length');
      near(q.lines[0].qty, q.inputs.sheetArea * 0.0598 * rho, 1e-9, 'sheet weight');
      // machined: a 4 x 2 x 1 aluminium block
      var m = build('p.units("in");\np.material("6061-T6 (SS)");\np.sketch("Front").rect(0, 0, 4, 2).extrude(1);\n');
      noErrors(m);
      var qm = C.estimate(m.model, m.build, m.mesh), rm = m.model.density * LB, sv = 4.25 * 2.25 * 1.25;
      assert(qm.kind === 'machined', qm.kind);
      near(qm.inputs.stockVolume, sv, 1e-9, 'stock volume');
      near(qm.inputs.removed, sv - 8, 1e-6, 'removed');
      var subm = sv * rm * 2.80 + (sv - 8) * 2.5 + 2 * 40 / 25 + 45 / 25;
      near(qm.subtotal, subm, 1e-6, 'machined subtotal');
      near(qm.perPart, subm * 1.25, 1e-6, 'machined per part');
      // a millimetre part is costed in inches
      var mm = build('p.units("mm");\np.sketch("Front").rect(0, 0, 101.6, 50.8).extrude(25.4);\n'), qmm = C.estimate(mm.model, mm.build, mm.mesh);
      nearVec(qmm.inputs.size, [4, 2, 1], 1e-9, 'mm part size in inches');
    });

    test('rfLP: Undercut Analysis, pull +Y, on a 40 x 30 x 20 block with a 10 x 10 x 10 side pocket: top Direction 1, bottom Direction 2, 4 sides no draft, the pocket\'s 5 faces occluded', function () {
      var r = build(RFLP_BLOCK + 'p.sketch("Right", 40).rect(-15, 10, 10, 10).cut(10, { reverse: true });\n');
      noErrors(r);
      nearRel(r.mp.volume, 40 * 30 * 20 - 1000, 1e-9, 'volume');
      var u = E.undercut(r.mesh, [0, 1, 0]);
      assert(JSON.stringify(u.counts) === JSON.stringify({ dir1: 1, dir2: 1, occluded: 5, straddle: 0, nodraft: 4 }), JSON.stringify(u.counts));
      // pulled along X the pocket opens toward +X: no occluded faces
      var ux = E.undercut(r.mesh, [1, 0, 0]);
      assert(ux.counts.occluded === 0, 'along X: ' + JSON.stringify(ux.counts));
      // a cylinder lying across the pull straddles
      var c = build('p.units("mm");\np.sketch("Front").circle(0, 0, 10).extrude(30);\n'), uc = E.undercut(c.mesh, [0, 1, 0]);
      assert(uc.counts.straddle === 1 && uc.counts.occluded === 0, 'cylinder: ' + JSON.stringify(uc.counts));
    });

    test('rfLP: Sensors: limits (greater, less, between, not between), mass / dimension / measure values, the alert, and p.sensor through generateScript', function () {
      assert(E.sensorLimit({ op: 'gt', a: 2 }, 2.5) && !E.sensorLimit({ op: 'gt', a: 2 }, 2), 'gt');
      assert(E.sensorLimit({ op: 'lt', a: 2 }, 1.5) && !E.sensorLimit({ op: 'lt', a: 2 }, 2.5), 'lt');
      assert(E.sensorLimit({ op: 'between', a: 3, b: 1 }, 2) && !E.sensorLimit({ op: 'between', a: 1, b: 3 }, 4), 'between');
      assert(E.sensorLimit({ op: 'outside', a: 1, b: 3 }, 4) && !E.sensorLimit({ op: 'outside', a: 1, b: 3 }, 2), 'outside');
      assert(!E.sensorLimit({ op: 'none' }, 5) && !E.sensorLimit(null, 5) && !E.sensorLimit({ op: 'gt', a: 1 }, null), 'none');
      var r = build('p.units("in");\np.material("Plain Carbon Steel");\np.sketch("Front").rect(0, 0, 4, 2).extrude(1);\n');
      noErrors(r);
      var fid = r.model.features[1].id;
      E.addSensor(r.model, { type: 'mass', limit: { op: 'gt', a: 2 } });
      E.addSensor(r.model, { type: 'dimension', feature: fid, key: 'depth', limit: { op: 'between', a: 0.5, b: 1.5 } });
      E.addSensor(r.model, { type: 'measure', a: { point: [2, 1, 1], normal: [0, 0, 1] }, b: { point: [2, 1, 0], normal: [0, 0, -1] }, limit: { op: 'lt', a: 0.75 } });
      assert(r.model.sensors.map(function (s) { return s.name; }).join() === 'Mass1,Dimension1,Measurement1', r.model.sensors.map(function (s) { return s.name; }).join());
      var lb = 8 * r.model.density * LB, v = E.evaluateSensors(r.model, { mesh: r.mesh });
      near(v[0].value, lb, 1e-9, 'mass lb');
      assert(v[0].alert === (lb > 2), 'mass alert');
      assert(v[1].value === 1 && v[1].alert, 'dimension ' + JSON.stringify(v[1]));
      near(v[2].value, 1, 1e-9, 'measured thickness');
      assert(!v[2].alert, 'measure alert');
      // round trip
      var code = K.generateScript(r.model);
      assert(/p\.sensor\(\{ "feature": f\d+, "type":"dimension"/.test(code.replace(/"type": "/g, '"type":"')), code);
      var r2 = build(code), v2 = E.evaluateSensors(r2.model, { mesh: r2.mesh });
      assert(JSON.stringify(r2.model.sensors.map(function (s) { return [s.name, s.type, s.limit]; })) === JSON.stringify(r.model.sensors.map(function (s) { return [s.name, s.type, s.limit]; })), 'sensors differ after the round trip');
      assert(r2.model.sensors[1].feature === r2.model.features[1].id && v2[1].value === 1, 'dimension sensor feature after the round trip');
      // a depth change moves the dimension sensor out of its band
      r2.model.features[1].depth = 2;
      assert(!E.evaluateSensors(r2.model, { mesh: r2.mesh })[1].alert, 'depth 2 is not between 0.5 and 1.5');
    });

    test('rfLP: Compare Documents: the changed depth, the added hole, the volumes and the faces only in one of two built parts', function () {
      var a = build(RFLP_BLOCK), mb = JSON.parse(JSON.stringify(a.model));
      mb.features[1].depth = 25;
      K.runScript(mb, 'p.hole("Front", 20, 15, 10, { offset: 25 });');
      var bb = K.rebuild(mb), b = { model: mb, mesh: K.meshFromBody(bb.body) };
      var d = E.compare({ model: a.model, mesh: a.mesh }, b);
      assert(d.features.added.length === 2 && d.features.removed.length === 0, JSON.stringify(d.features.added));
      assert(d.features.changed.length === 1 && d.features.changed[0].changes.some(function (c) { return c.key === 'depth' && c.a === 20 && c.b === 25; }), JSON.stringify(d.features.changed));
      nearRel(d.geometry.a.volume, 24000, 1e-9, 'volume a');
      nearRel(d.geometry.b.volume, 30000 - Math.PI * 25 * 25, 1e-6, 'volume b');
      near(d.geometry.b.bbox.max[2], 25, 1e-9, 'bbox b');
      // every face of A changed: the front (z 20 -> 25), the 4 sides (taller) and the back (the hole runs through it)
      assert(d.geometry.onlyA.length === 6, 'only in A: ' + d.geometry.onlyA.length);
      assert(d.geometry.onlyB.length > 6, 'only in B: ' + d.geometry.onlyB.length);
      var same = E.compare({ model: a.model, mesh: a.mesh }, { model: a.model, mesh: a.mesh });
      assert(!same.features.changed.length && !same.geometry.onlyA.length && !same.geometry.onlyB.length, 'a part against itself');
    });

    test('rfLP: Performance Evaluation rebuilds feature by feature: one row per feature, percentages add to 100, slowest first, the triangle count of the part', function () {
      var r = build(RFLP_BLOCK + 'p.hole("Front", 20, 15, 10, { offset: 20 });\np.fillet(2, [[0, 0, 10]]);\n');
      noErrors(r);
      var pe = E.performance(r.model);
      assert(pe.order.length === r.model.features.length, pe.order.length + ' rows');
      near(pe.order.reduce(function (s, x) { return s + x.pct; }, 0), 100, 1e-9, 'percent');
      for (var i = 1; i < pe.features.length; i++) assert(pe.features[i - 1].ms >= pe.features[i].ms, 'sorted');
      assert(pe.triangles === r.mesh.triCount && pe.faces === r.mesh.faces.length, pe.triangles + ' / ' + r.mesh.triCount);
      assert(pe.order.every(function (x) { return !x.error; }), 'errors');
    });

    test('rfLP: Hole Alignment: two stacked plates with a 0.281 hole each, the top one 0.02 in over: one pair 0.02 off; aligned or 0.1 off (over the 0.04 deviation): none', function () {
      var p = rfLPPlates(0.02), h = E.holeAlignment(AS.explodedBodies(p.model, p.build, null, 0), ['Plate<1>', 'Plate<2>'], { units: 'in' });
      assert(h.holes === 2 && h.pairs.length === 1, JSON.stringify(h));
      near(h.pairs[0].offset, 0.02, 1e-9, 'offset');
      near(h.pairs[0].ra, 0.1405, 1e-9, 'radius');
      assert(!E.holeAlignment(AS.explodedBodies(rfLPPlates(0).model, rfLPPlates(0).build, null, 0), null, { units: 'in' }).pairs.length, 'aligned');
      var far = rfLPPlates(0.1);
      assert(!E.holeAlignment(AS.explodedBodies(far.model, far.build, null, 0), null, { units: 'in' }).pairs.length, '0.1 off');
      assert(E.holeAlignment(AS.explodedBodies(far.model, far.build, null, 0), null, { deviation: 0.2 }).pairs.length === 1, 'a wider deviation finds it');
    });

    test('rfLP: Smart Fasteners on the aligned stack: a 1/4-20 x 1 hex bolt, USS washers and a nut, placed on the axis without interference; a second run adds nothing', function () {
      var p = rfLPPlates(0), sf = AS.smartFasteners(p.model, p.build);
      assert(sf.length === 1 && !sf[0].error, JSON.stringify(sf.map(function (x) { return x.error; })));
      var row = sf[0];
      assert(row.bolt.size === '1/4-20' && row.bolt.len === '1', row.bolt.name);
      near(row.grip, 0.5, 1e-9, 'grip');
      near(row.need, 0.5 + 2 * 0.065 + 7 / 32 + 2 / 20, 1e-9, 'length needed');
      var res = AS.addSmartFasteners(p.model, p.build), b2 = AS.rebuild(p.model);
      assert(res.added.length === 4 && p.model.components.length === 6, res.added.length + ' added');
      assert(!Object.keys(b2.errors).length, JSON.stringify(b2.errors));
      var byName = function (re) { return p.model.components.filter(function (c) { return re.test(c.name); })[0]; };
      var bolt = byName(/Hex Bolt/), nut = byName(/Hex Nut/);
      nearVec(bolt.transform.position, [1, 0.565, 1], 1e-9, 'bolt');
      nearVec(nut.transform.position, [1, -0.065, 1], 1e-9, 'nut');
      near(AS.transformDir(nut.transform, [0, 1, 0])[1], -1, 1e-12, 'nut faces down');
      var it = AS.interference(p.model, b2);
      assert(!it.pairs.length, 'interference: ' + it.pairs.map(function (x) { return x.aName + '/' + x.bName; }).join(', '));
      assert(!AS.smartFasteners(p.model, b2).length, 'a fastened stack is skipped');
      // a millimetre assembly is refused in plain words
      var mm = AS.newAssembly(); mm.units = 'mm';
      var msg = ''; try { AS.smartFasteners(mm, AS.rebuild(mm)); } catch (e) { msg = e.message; }
      assert(/inch hardware/.test(msg), msg);
    });

    test('rfLP: explode positions: two steps on one plate add up (direction x distance), collapsed bodies stay put, the script keeps the steps', function () {
      var p = rfLPPlates(0);
      AS.addExplodeStep(p.model, null, [p.b.id], 'y', 2);
      AS.addExplodeStep(p.model, null, [p.b.id], [1, 0, 0], 0.5);
      var v = p.model.explodedViews[0], off = AS.explodeOffsets(p.model, v, 1).offsets;
      nearVec(off[p.b.id], [0.5, 2, 0], 1e-12, 'offset');
      assert(!off[p.a.id] || Math.hypot(off[p.a.id][0], off[p.a.id][1], off[p.a.id][2]) === 0, 'the fixed plate stays');
      var half = AS.explodeOffsets(p.model, v, 0.5).offsets[p.b.id];
      assert(Math.hypot(half[0], half[1], half[2]) < Math.hypot(0.5, 2) - 1e-9, 'half way');
      var m2 = AS.newAssembly(); AS.runScript(m2, AS.generateScript(p.model));
      assert(m2.explodedViews && m2.explodedViews[0].steps.length === 2, 'steps after the round trip');
    });
  })();
