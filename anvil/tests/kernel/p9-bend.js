  // ------------------------------------------------------------------ p9-bend: bend allowance methods (SolidWorks' Bend Allowance group)
  // An L bracket in inches, T = R = 0.060: base 4 × 3 on Top, a 90° Edge-Flange of wall 1.5 on the x = 0 edge (Bend
  // Outside). Outside dimensions A = 4 + R + T (base) and B = 1.5 + R + T (flange), so the flat length must be A + B − BD
  // for whatever method gives the bend its BD.
  (function () {
    group('p9-bend: bend allowance, bend deduction, bend tables, gauges, custom bend allowance');
    var T = 0.06, R = 0.06, W = 4, D = 3, L = 1.5, A90 = Math.PI / 2;
    var OA = W + R + T, OB = L + R + T;
    function lbracket(sheetLine, flangeOpts, angle) {
      var o = flangeOpts ? flangeOpts : '';
      if (angle != null) o = o ? o.replace(/^\{ /, '{ angle: ' + angle + ', ') : '{ angle: ' + angle + ' }';
      return 'p.units("in");\n' + sheetLine + '\np.sketch("Top").rect(0, -' + D + ', ' + W + ', ' + D + ').end().baseFlange();\np.flange(' + L + ', [[0, ' + T + ', 1.5]]' + (o ? ', ' + o : '') + ');';
    }
    function flatOf(code) {
      var r = build(code);
      noErrors(r);
      return { r: r, flat: K.flatPattern(r.model, r.build, r.mesh) };
    }
    var BD_K = K.bendDeduction(A90, R, T, K.bendAllowance(A90, R, T, 0.5));
    test('p9-bend: the relations BA = θ(R + K·T), OSSB = (R+T)·tan(θ/2) up to 90° and R + T beyond, BD = 2·OSSB − BA', function () {
      near(K.bendAllowance(A90, R, T, 0.5), A90 * (R + 0.5 * T), 1e-15, 'BA');
      near(K.outsideSetback(A90, R, T), R + T, 1e-15, 'OSSB 90°');
      near(K.outsideSetback(Math.PI / 4, R, T), (R + T) * Math.tan(Math.PI / 8), 1e-15, 'OSSB 45°');
      near(K.outsideSetback(3 * Math.PI / 4, R, T), R + T, 1e-15, 'OSSB 135° (outside tangent)');
      near(BD_K, 2 * (R + T) - A90 * (R + 0.5 * T), 1e-15, 'BD 90°');
      var c = K.bendCalc({ thickness: T, bendRadius: R, kFactor: 0.5, bendAllowanceType: 'deduction', bendDeduction: 0.1 }, A90, R, T, null);
      near(c.BA, 2 * (R + T) - 0.1, 1e-15, 'BA from BD'); near(c.BD, 0.1, 1e-15, 'BD back'); assert(c.type === 'deduction' && c.source === 'sheet', JSON.stringify(c));
      var o = K.bendCalc({ thickness: T, bendRadius: R, kFactor: 0.5 }, A90, R, T, { type: 'allowance', value: 0.13 });
      assert(o.source === 'custom' && o.BA === 0.13, 'custom BA wins: ' + JSON.stringify(o));
      var bad = false; try { K.bendCalc({ thickness: T, bendRadius: R, bendAllowanceType: 'deduction', bendDeduction: 1 }, A90, R, T); } catch (e) { bad = /negative/.test(e.message); }
      assert(bad, 'a BD larger than 2·OSSB is refused');
    });
    test('p9-bend: L bracket T = R = 0.060 in, K-factor 0.5 (stated and the new default): flat = A + B − BD', function () {
      var a = flatOf(lbracket('p.sheet(0.06, 0.06, 0.5);'));
      near(a.flat.size[0], OA + OB - BD_K, 1e-9, 'flat length');
      near(a.flat.size[1], D, 1e-9, 'flat width');
      near(a.flat.bends[0].ba, K.bendAllowance(A90, R, T, 0.5), 1e-12, 'bend record BA'); near(a.flat.bends[0].bd, BD_K, 1e-12, 'bend record BD');
      assert(a.flat.bends[0].method === 'kfactor' && a.flat.note === 'T=0.06 R=0.06 K=0.5' && !a.flat.warnings.length, a.flat.note + ' ' + a.flat.warnings.join(' | '));
      var d = flatOf(lbracket('p.sheet(0.06);'));
      assert(d.r.model.sheet.kFactor === 0.5, 'default K: ' + JSON.stringify(d.r.model.sheet));
      near(d.flat.size[0], a.flat.size[0], 1e-12, 'default K = 0.5');
      return 'flat ' + fmt(a.flat.size[0]) + ' × ' + fmt(a.flat.size[1]) + ' in, BD ' + BD_K.toFixed(5);
    });
    test('p9-bend: L bracket with a bend deduction entered (0.100) and with a bend allowance entered (0.120)', function () {
      var d = flatOf(lbracket('p.sheet(0.06, 0.06, 0.5, { bendAllowanceType: "deduction", bendDeduction: 0.1 });'));
      near(d.flat.size[0], OA + OB - 0.1, 1e-9, 'BD flat');
      assert(d.flat.note === 'T=0.06 R=0.06 BD=0.1', d.flat.note);
      var a = flatOf(lbracket('p.sheet(0.06, 0.06, 0.5, { bendAllowanceType: "allowance", bendAllowance: 0.12 });'));
      near(a.flat.size[0], OA + OB - (2 * (R + T) - 0.12), 1e-9, 'BA flat = A + B − (2·OSSB − BA)');
      near(a.flat.size[0], W + L + 0.12, 1e-9, 'BA flat = flats + BA');
      assert(a.flat.note === 'T=0.06 R=0.06 BA=0.12', a.flat.note);
    });
    var TABLE = { kind: 'BD', name: 'Brake 1', rows: [{ thickness: 0.06, radius: 0.06, angle: 60, value: 0.05 }, { thickness: 0.06, radius: 0.06, angle: 120, value: 0.15 },
      { thickness: 0.06, radius: 0.06, angle: 180, value: 0.2 }, { thickness: 0.0747, radius: 0.0747, angle: 90, value: 0.13 }] };
    test('p9-bend: bend table lookup: exact match on T and R, linear interpolation in angle, fallback to K with a warning', function () {
      var s = 'p.sheet(0.06, 0.06, 0.5, { bendAllowanceType: "table", bendTable: ' + JSON.stringify(TABLE) + ' });';
      var t = flatOf(lbracket(s));
      near(t.flat.size[0], OA + OB - 0.1, 1e-9, '90° interpolated between 60° (0.05) and 120° (0.15)');
      assert(t.flat.bends[0].method === 'table' && !t.flat.warnings.length, JSON.stringify(t.flat.bends[0]) + ' ' + t.flat.warnings.join(' | '));
      assert(/BEND TABLE Brake 1 \(BD/.test(t.flat.note), t.flat.note);
      var lk = K.bendTableLookup(TABLE, 0.0598, 0.0598, 90);
      assert(!lk.error && Math.abs(lk.value - 0.1) < 1e-12, 'a 16 ga (0.0598) sheet finds the 0.060 rows (within 0.5 %): ' + JSON.stringify(lk));
      lk = K.bendTableLookup(TABLE, 0.0748, 0.0747, 90);
      assert(!lk.error && lk.value === 0.13, 'within 0.5 %: ' + JSON.stringify(lk));
      assert(K.bendTableLookup(TABLE, 0.06, 0.06, 45).error, 'below the rows');
      assert(K.bendTableLookup(TABLE, 0.048, 0.048, 90).error, 'no thickness');
      near(K.bendTableLookup(TABLE, 0.06, 0.06, 150).value, 0.175, 1e-12, 'interpolated 150°');
      var off = flatOf(lbracket(s, null, 45));
      assert(off.flat.warnings.length === 1 && /Bend table: no row for 45° .*K-factor 0\.5/.test(off.flat.warnings[0]), off.flat.warnings.join(' | '));
      near(off.flat.size[0], W + L + K.bendAllowance(Math.PI / 4, R, T, 0.5), 1e-9, 'fallback K-factor');
      var ba = JSON.parse(JSON.stringify(TABLE)); ba.kind = 'BA';
      var b = flatOf(lbracket('p.sheet(0.06, 0.06, 0.5, { bendAllowanceType: "table", bendTable: ' + JSON.stringify(ba) + ' });'));
      near(b.flat.size[0], W + L + 0.1, 1e-9, 'a BA table adds the value');
    });
    test('p9-bend: Custom Bend Allowance on the flange wins over the sheet default (deduction, K-factor, allowance, table)', function () {
      var sheet = 'p.sheet(0.06, 0.06, 0.5, { bendAllowanceType: "deduction", bendDeduction: 0.1, bendTable: ' + JSON.stringify(TABLE) + ' });';
      var d = flatOf(lbracket(sheet, '{ bendAllowance: { type: "deduction", value: 0.09 } }'));
      near(d.flat.size[0], OA + OB - 0.09, 1e-9, 'custom BD');
      assert(d.flat.bends[0].source === 'custom', JSON.stringify(d.flat.bends[0]));
      var k = flatOf(lbracket(sheet, '{ bendAllowance: { type: "kfactor", value: 0.33 } }'));
      near(k.flat.size[0], W + L + K.bendAllowance(A90, R, T, 0.33), 1e-9, 'custom K');
      var a = flatOf(lbracket(sheet, '{ bendAllowance: { type: "allowance", value: 0.11 } }'));
      near(a.flat.size[0], W + L + 0.11, 1e-9, 'custom BA');
      var t = flatOf(lbracket(sheet, '{ bendAllowance: { type: "table" } }'));
      near(t.flat.size[0], OA + OB - 0.1, 1e-9, 'custom table');
      var plain = flatOf(lbracket(sheet));
      near(plain.flat.size[0], OA + OB - 0.1, 1e-9, 'sheet default without the override');
      var rad = flatOf(lbracket(sheet, '{ radius: 0.12, bendAllowance: { type: "deduction", value: 0.2 } }'));
      near(rad.flat.size[0], (W + 0.12 + T) + (L + 0.12 + T) - 0.2, 1e-9, 'custom radius with custom BD');
      expectErrorAny(lbracket(sheet, '{ bendAllowance: { type: "guess", value: 1 } }'), /bendAllowance\.type/);
    });
    test('p9-bend: a 135° bend: BD runs to the outside tangent (OSSB = R + T); K-factor and an entered BD (with a warning)', function () {
      var A = 3 * Math.PI / 4;
      var k = flatOf(lbracket('p.sheet(0.06, 0.06, 0.5);', null, 135));
      var BAk = K.bendAllowance(A, R, T, 0.5);
      near(k.flat.size[0], W + L + BAk, 1e-9, 'K flat');
      near(k.flat.bends[0].bd, 2 * (R + T) - BAk, 1e-12, 'BD at 135°');
      // the outside dimensions beyond 90°: each flat plus R + T (to the tangent of the outside of the bend)
      near(k.flat.size[0], (W + R + T) + (L + R + T) - k.flat.bends[0].bd, 1e-9, 'flat = A + B − BD at 135°');
      var d = flatOf(lbracket('p.sheet(0.06, 0.06, 0.5, { bendAllowanceType: "deduction", bendDeduction: 0.1 });', null, 135));
      near(d.flat.size[0], (W + R + T) + (L + R + T) - 0.1, 1e-9, 'entered BD applied unchanged at 135°');
      assert(d.flat.warnings.length === 1 && /applied unchanged to the 135° bend/.test(d.flat.warnings[0]), d.flat.warnings.join(' | '));
    });
    test('p9-bend: hem and jog take the sheet\'s bend deduction and their own custom bend allowance', function () {
      var sheet = 'p.units("in");\np.sheet(0.06, 0.06, 0.5, { bendAllowanceType: "deduction", bendDeduction: 0.1 });\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();';
      var h = flatOf(sheet + '\np.hem(0.5, [[0, 0.06, 1.5]], { gap: 0.04 });');
      var Rh = 0.02;
      near(h.flat.size[0], W + 0.5 + (2 * (Rh + T) - 0.1), 1e-9, 'hem: BA = 2(R + T) − BD at 180°');
      var hc = flatOf(sheet + '\np.hem(0.5, [[0, 0.06, 1.5]], { gap: 0.04, bendAllowance: { type: "allowance", value: 0.1 } });');
      near(hc.flat.size[0], W + 0.5 + 0.1, 1e-9, 'hem with custom BA');
      var H = 0.5, L2 = 1;
      var j = flatOf(sheet + '\np.jog(' + H + ', ' + L2 + ', [[0, 0.06, 1.5]]);');
      var wall = H - 2 * R;   // 90° jog: wall = H − 2R(1 − cos A) + T cos A
      near(j.flat.size[0], W + 2 * (2 * (R + T) - 0.1) + wall + L2, 1e-9, 'jog: two bends at BD each');
      assert(j.flat.bends.length === 2 && j.flat.bends.every(function (b) { return Math.abs(b.bd - 0.1) < 1e-12; }), JSON.stringify(j.flat.bends.map(function (b) { return b.bd; })));
      var jc = flatOf(sheet + '\np.jog(' + H + ', ' + L2 + ', [[0, 0.06, 1.5]], { bendAllowance: { type: "deduction", value: 0.08 } });');
      near(jc.flat.size[0], W + 2 * (2 * (R + T) - 0.08) + wall + L2, 1e-9, 'jog with custom BD on both bends');
    });
    test('p9-bend: gauge table: 16 ga steel is 0.0598 in (standard), radius and K are examples; mm parts convert', function () {
      var r = build('p.units("in");\np.sheet(null, null, null, { gauge: "16" });\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();');
      noErrors(r);
      var s = r.model.sheet;
      assert(s.thickness === 0.0598 && s.bendRadius === 0.0598 && s.kFactor === 0.5 && s.gauge === '16' && s.gaugeTable === K.DEFAULT_GAUGE_TABLE, JSON.stringify(s));
      near(r.mp.volume, 4 * 3 * 0.0598, 1e-12, 'base volume');
      var mm = K.gaugeRow(K.DEFAULT_GAUGE_TABLE, '16 ga', 'mm');
      near(mm.thickness, 0.0598 * 25.4, 1e-12, '16 ga in mm');
      assert(K.gaugeRow('Aluminum (Brown & Sharpe)', '16', 'in').thickness === 0.0508 && K.gaugeRow('Stainless (U.S. Standard Gauge)', '16', 'in').thickness === 0.0625, 'aluminium / stainless 16 ga');
      Object.keys(K.gaugeTables).forEach(function (n) { assert(K.gaugeTables[n].example === true, n + ' is flagged as example data'); });
      var own = { name: 'Shop', units: 'in', rows: [{ gauge: '14', thickness: 0.0747, radius: 0.09, bendDeduction: 0.13 }] };
      var o = build('p.units("in");\np.sheet(null, null, null, { gaugeTable: ' + JSON.stringify(own) + ', gauge: "14" });\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();');
      assert(o.model.sheet.bendAllowanceType === 'deduction' && o.model.sheet.bendDeduction === 0.13 && o.model.sheet.bendRadius === 0.09, 'a shop row with a BD: ' + JSON.stringify(o.model.sheet));
      var bad = false; try { build('p.sheet(null, null, null, { gauge: "99" });'); } catch (e) { bad = /Gauge "99" is not in the gauge table/.test(e.message); }
      assert(bad, 'unknown gauge refused');
    });
    test('p9-bend: script round trip of every new field (sheet method, value, table, gauge; flange / hem / jog custom bend allowance)', function () {
      var code = 'p.units("in");\np.sheet(0.0598, 0.0598, 0.45, { bendAllowanceType: "table", bendTable: ' + JSON.stringify(TABLE) + ', gaugeTable: "Steel (Manufacturers\' Standard Gauge)", gauge: "16" });\n' +
        'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        'p.flange(1, [[0, 0.0598, 1.5]], { bendAllowance: { type: "deduction", value: 0.1 } });\n' +
        'p.hem(0.5, [[2, 0.0598, 0]], { bendAllowance: { type: "kfactor", value: 0.4 } });\n' +
        'p.jog(0.5, 1, [[4, 0.0598, 1.5]], { bendAllowance: { type: "table" } });';
      var a = build(code);
      noErrors(a);
      var script = K.generateScript(a.model);
      assert(/p\.sheet\(0\.0598, 0\.0598, 0\.45, \{ bendAllowanceType: "table", bendTable: /.test(script) && /gauge: "16"/.test(script), script.split('\n').filter(function (l) { return /sheet/.test(l); })[0]);
      var b = build(script);
      noErrors(b);
      assert(JSON.stringify(b.model.sheet) === JSON.stringify(a.model.sheet), 'sheet: ' + JSON.stringify(b.model.sheet));
      ['flange', 'jog'].forEach(function (t) {
        var fa = a.model.features.filter(function (f) { return f.type === t; }), fb = b.model.features.filter(function (f) { return f.type === t; });
        assert(fa.length === fb.length && fa.every(function (f, i) { return JSON.stringify(f.bendAllowance) === JSON.stringify(fb[i].bendAllowance) && f.bendAllowance; }), t + ' overrides: ' + JSON.stringify(fb.map(function (f) { return f.bendAllowance; })));
      });
      assert(K.generateScript(b.model) === script, 'round-trip fixed point');
      var fa2 = K.flatPattern(a.model, a.build, a.mesh), fb2 = K.flatPattern(b.model, b.build, b.mesh);
      near(fb2.size[0], fa2.size[0], 1e-12, 'same flat'); near(fb2.size[1], fa2.size[1], 1e-12, 'same flat');
      // a deduction or allowance sheet, too
      var c = build('p.sheet(2, 3, 0.4, { bendAllowanceType: "allowance", bendAllowance: 4.2 });\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange();');
      var cs = K.generateScript(c.model);
      assert(/p\.sheet\(2, 3, 0\.4, \{ bendAllowanceType: "allowance", bendAllowance: 4\.2 \}\);/.test(cs), cs);
      assert(JSON.stringify(build(cs).model.sheet) === JSON.stringify(c.model.sheet), 'allowance sheet');
    });
    test('p9-bend: a saved part without a stored K keeps the legacy 0.71 (flat and script); a stored K is kept', function () {
      var r = build('p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);\np.flange(20, [[0, 2, 30]]);');
      noErrors(r);
      var flatStored = K.flatPattern(r.model, r.build, r.mesh);
      near(flatStored.size[0], 100 + 20 + K.bendAllowance(A90, 2, 2, 0.71), 1e-9, 'stored 0.71 kept');
      assert(flatStored.warnings.length === 1 && /0\.71 \/ 1\.5708 = 0\.452/.test(flatStored.warnings[0]), 'K above 0.5 is flagged: ' + flatStored.warnings.join(' | '));
      var legacy = JSON.parse(JSON.stringify(r.model));
      delete legacy.sheet.kFactor;
      var flatLegacy = K.flatPattern(legacy, r.build, r.mesh);
      near(flatLegacy.size[0], flatStored.size[0], 1e-12, 'no stored K: legacy 0.71');
      assert(flatLegacy.sheet.kFactor === 0.71 && / K=0\.71$/.test(flatLegacy.note), 'flat.sheet carries the K used: ' + flatLegacy.note);
      assert(/p\.sheet\(2, 2, 0\.71\);/.test(K.generateScript(legacy)), 'script writes the legacy K');
    });
    test('p9-bend: the flat-pattern DXF note still carries the parameters; the flat result has size, note and warnings', function () {
      var d = flatOf(lbracket('p.sheet(0.06, 0.06, 0.5, { bendAllowanceType: "deduction", bendDeduction: 0.1 });'));
      var dxf = K.exportDXFFlat(d.flat, 'in');
      assert(/T=0\.06/.test(dxf) && /R=0\.06/.test(dxf), 'DXF NOTES carry T and R');
      assert(/\nNOTES\n/.test(dxf) && /\nBEND\n/.test(dxf), 'NOTES and BEND layers');
      assert(Array.isArray(d.flat.size) && d.flat.size.length === 2 && Array.isArray(d.flat.warnings) && typeof d.flat.note === 'string', 'flat fields');
      near(d.flat.size[0], d.flat.bbox.max[0] - d.flat.bbox.min[0], 1e-12, 'size = bbox');
    });
    test('p9-bend: makeSheet keeps one key order and refuses an empty table or an unknown type', function () {
      var s = K.makeSheet({ gauge: '16', gaugeTable: 'x', bendDeduction: 0.1, bendAllowanceType: 'deduction', kFactor: 0.4, bendRadius: 0.06, thickness: 0.06 });
      assert(JSON.stringify(Object.keys(s)) === JSON.stringify(['thickness', 'bendRadius', 'kFactor', 'bendAllowanceType', 'bendDeduction', 'gaugeTable', 'gauge']), JSON.stringify(s));
      var e1 = false, e2 = false;
      try { K.makeSheet({ thickness: 1, bendAllowanceType: 'table' }); } catch (e) { e1 = /no rows/.test(e.message); }
      try { K.makeSheet({ thickness: 1, bendAllowanceType: 'mib' }); } catch (e) { e2 = /Unknown bend allowance type/.test(e.message); }
      assert(e1 && e2, 'refusals');
      assert(K.makeSheet({ thickness: 1 }).kFactor === 0.5 && !('bendAllowanceType' in K.makeSheet({ thickness: 1 })), 'K-factor sheets keep the old shape');
    });
  })();
  // --- end p9-bend ---
