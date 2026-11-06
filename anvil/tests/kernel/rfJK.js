  // --- rfJK (2026-11-06, lane flatopts-2) --- sheet-metal Cut-List Properties as SolidWorks 2024 lists them
  // (Kernel.sheetCutList): bounding box, cutting lengths (true circles), cut outs, bends, area, gauge, material, mass.
  // 16 ga steel, T = R = 0.0598, K = 0.5; a 6 × 4 in blank with two Ø.5 holes and the same with a 1 in Edge Flange.
  (function () {
    group('rfJK: sheet-metal Cut-List Properties (Kernel.sheetCutList)');
    var T = 0.0598, R = 0.0598, BA = Math.PI / 2 * (R + 0.5 * T), BD = 2 * (R + T) - BA, r = 0.25;
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\n';
    var PLATE = HEAD + 'p.sketch("Top").rect(0, -4, 6, 4).circle(1.5, -2, ' + r + ').circle(4.5, -2, ' + r + ').end().baseFlange();\n';
    var FLANGED = PLATE + 'p.flange(1, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
    function rfJKbuild(code, mutate) {
      var model = K.newModel('Test');
      K.runScript(model, code);
      if (mutate) mutate(model);
      var b = K.rebuild(model), mesh = K.meshFromBody(b.body);
      return { model: model, build: b, mesh: mesh };
    }
    function rfJKcl(x) { return K.sheetCutList(x.model, x.build, x.mesh); }
    function rfJKrow(cl, name) { var h = cl.rows.filter(function (q) { return q.name === name; })[0]; assert(h, 'row "' + name + '" (rows: ' + cl.rows.map(function (q) { return q.name; }).join(', ') + ')'); return h; }

    test('rfJK: 6 × 4 blank, two Ø.5 holes: Length 6, Width 4, Cutting Length-Outer 20, -Inner 2·2π·.25, Cut Outs 2, Bends 0, Bounding Box Area 24, Area-Blank 24 − 2π·.25², T, R, K-Factor .5, Mass = blank × T × density, Description Sheet; SolidWorks\' order', function () {
      var x = rfJKbuild(PLATE), cl = rfJKcl(x), v = cl.values;
      assert(!cl.error, 'no error: ' + cl.error);
      near(v['Bounding Box Length'], 6, 1e-12, 'length'); near(v['Bounding Box Width'], 4, 1e-12, 'width');
      near(v['Cutting Length-Outer'], 20, 1e-9, 'outer');
      near(v['Cutting Length-Inner'], 2 * 2 * Math.PI * r, 1e-9, 'inner: two true circles');
      assert(v['Cut Outs'] === 2 && v.Bends === 0, 'cut outs / bends: ' + v['Cut Outs'] + ' / ' + v.Bends);
      near(v['Bounding Box Area'], 24, 1e-12, 'bounding box area');
      near(v['Bounding Box Area-Blank'], 24 - 2 * Math.PI * r * r, 1e-9, 'blank area');
      near(v['Sheet Metal Thickness'], T, 1e-15, 'T'); near(v['Bend Radius'], R, 1e-15, 'R'); near(v['K-Factor'], 0.5, 1e-15, 'K');
      assert(v.Description === 'Sheet', 'Description');
      var kg = (24 - 2 * Math.PI * r * r) * T * 1.6387064e-5 * x.model.density;
      nearRel(v.Mass, kg, 1e-6, 'mass (kg)');
      assert(rfJKrow(cl, 'Mass').text === (kg / 0.45359237).toFixed(3) && rfJKrow(cl, 'Mass').unit === 'lb', 'mass text in lb: ' + rfJKrow(cl, 'Mass').text);
      assert(rfJKrow(cl, 'Cutting Length-Outer').text === '20.0000' && rfJKrow(cl, 'Cutting Length-Outer').unit === 'in', 'text: 4 decimals, in');
      var names = cl.rows.map(function (q) { return q.name; });
      ['Bounding Box Length', 'Bounding Box Width', 'Sheet Metal Thickness', 'Bend Radius', 'K-Factor', 'Bends', 'Cutting Length-Outer', 'Cutting Length-Inner', 'Cut Outs', 'Bounding Box Area', 'Bounding Box Area-Blank', 'Sheet Metal Gauge', 'Material', 'Mass', 'Description']
        .forEach(function (n, i) { assert(names[i] === n, 'row ' + i + ': ' + names[i] + ', expected ' + n); });
      return 'ok';
    });

    test('rfJK: with a 1 in Edge Flange: Bends 1, Width 4 + 1 − BD, outer 2 (6 + Width), the bounding box longer side first whichever way Grain direction turns the flat', function () {
      var x = rfJKbuild(FLANGED), v = rfJKcl(x).values, w = 4 + 1 - BD;
      assert(v.Bends === 1, 'bends ' + v.Bends);
      near(v['Bounding Box Length'], 6, 1e-9, 'length'); near(v['Bounding Box Width'], w, 1e-9, 'width');
      near(v['Cutting Length-Outer'], 2 * (6 + w), 1e-9, 'outer');
      near(v['Bounding Box Area'], 6 * w, 1e-9, 'area');
      x.model.flatGrain = { at: [0, T, 2], dir: [0, 0, 1] };
      var g = rfJKcl(x).values;
      near(g['Bounding Box Length'], 6, 1e-9, 'grain: length still the longer side'); near(g['Bounding Box Width'], w, 1e-9, 'grain: width');
      return 'ok';
    });

    test('rfJK: the bend rule as the Sheet-Metal feature sets it (Bend Deduction value), the gauge pick, the material name; a mm part writes 2 decimals and grams; a part with no sheet is refused', function () {
      var d = rfJKbuild(PLATE, function (m) { m.sheet.bendAllowanceType = 'deduction'; m.sheet.bendDeduction = 0.1; m.sheet.gauge = '16'; m.sheet.gaugeTable = 'Steel'; });
      var cl = rfJKcl(d);
      near(rfJKrow(cl, 'Bend Deduction').value, 0.1, 1e-15, 'Bend Deduction row');
      assert(!cl.rows.some(function (q) { return q.name === 'K-Factor'; }), 'no K-Factor row then');
      assert(cl.values['Sheet Metal Gauge'] === '16', 'gauge: ' + cl.values['Sheet Metal Gauge']);
      if (typeof Materials !== 'undefined' && Materials.apply) {
        var lib = Materials.list ? Materials.list() : null, steel = lib && lib.filter(function (q) { return /steel/i.test(q.name); })[0];
        if (steel) { Materials.apply(d.model, steel.name); assert(rfJKcl(d).values.Material === steel.name, 'material: ' + rfJKcl(d).values.Material); }
      }
      var mm = rfJKbuild('p.units("mm");\np.sheet(1.5, 1.5, 0.5);\np.sketch("Top").rect(0, -100, 150, 100).end().baseFlange();\n'), mc = rfJKcl(mm);
      assert(rfJKrow(mc, 'Bounding Box Length').text === '150.00' && rfJKrow(mc, 'Bounding Box Length').unit === 'mm', 'mm text: ' + rfJKrow(mc, 'Bounding Box Length').text);
      assert(rfJKrow(mc, 'Mass').unit === 'g', 'mass in g');
      near(mc.values['Cutting Length-Outer'], 500, 1e-9, 'mm outer');
      var solid = rfJKbuild('p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\n'), sc = rfJKcl(solid);
      assert(sc.error && !sc.rows.length, 'no sheet: ' + sc.error);
      return 'ok';
    });
  })();
