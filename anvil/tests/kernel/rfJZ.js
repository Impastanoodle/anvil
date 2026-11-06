  // --- rfJZ (2026-11-06, lane stepout) --- STEP output a shop can trust: inch parts written in inches (as SolidWorks
  // AP214), the product and file named after the part, bends and holes as true CYLINDRICAL_SURFACE faces, ASCII only,
  // a local time stamp, and every file read back by Anvil at the same volume and size (test-reports/2026-11-06-step-audit.md).
  (function () {
    group('rfJZ: STEP output (inch units, part name, true bends and holes, round trip volume / box / faces)');
    var T = 0.0598, HEAD = 'p.name("Bracket").units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\n';
    var LBR = HEAD + 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1.5, [[2, 0.0598, 0]], { position: "inside" });\n' +
      'p.sketch("Top").circle(1, -1.5, 0.125).circle(3, -1.5, 0.125).end().extrude(1, { cut: true, through: true });\n';
    function rfJZcount(text, re) { return (text.match(re) || []).length; }
    // the part exported, read back as a new part in its own units: { src, step, back }
    function rfJZtrip(code, name) {
      var src = build(code); noErrors(src);
      var step = Exchange.exportSTEP(src.model, src.build, { faceted: true });
      var m = Exchange.newPartFromImport(Exchange.importFile((name || 'part') + '.step', step, { units: src.model.units }));
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      return { src: src, step: step, back: { model: m, build: b, mesh: mesh, mp: K.massProps(mesh) } };
    }
    function rfJZsame(r, rel) {
      nearRel(r.back.mp.volume, r.src.mp.volume, rel || 1e-6, 'round trip volume');
      for (var k = 0; k < 3; k++) {
        near(r.back.mp.bbox.min[k], r.src.mp.bbox.min[k], 1e-9, 'box min ' + k);
        near(r.back.mp.bbox.max[k], r.src.mp.bbox.max[k], 1e-9, 'box max ' + k);
      }
      var q = K.meshQuality(r.back.mesh);
      assert(q.closed && !q.openEdges && !q.nonManifoldEdges, 'read back closed ' + JSON.stringify(q));
    }

    test('rfJZ: 16 ga L-bracket with two holes: inch units (CONVERSION_BASED_UNIT INCH = 25.4 mm), product and file named after the part, 4 CYLINDRICAL_SURFACE (two bend faces, two holes), 12 faces, ASCII only, round trip exact', function () {
      var r = rfJZtrip(LBR, 'Bracket'), s = r.step;
      assert(/CONVERSION_BASED_UNIT\('INCH',#\d+\)LENGTH_UNIT\(\)NAMED_UNIT\(#\d+\)/.test(s), 'inch length unit');
      assert(/LENGTH_MEASURE_WITH_UNIT\(LENGTH_MEASURE\(25\.4\),#\d+\)/.test(s), 'inch = 25.4 mm');
      assert(/GLOBAL_UNIT_ASSIGNED_CONTEXT\(\(#\d+,/.test(s), 'unit assigned to the context');
      assert(/FILE_NAME\('Bracket\.step',/.test(s), 'FILE_NAME is the part');
      assert(/PRODUCT\('Bracket','Bracket',/.test(s), 'PRODUCT is the part');
      assert(/FILE_SCHEMA\(\('AUTOMOTIVE_DESIGN \{ 1 0 10303 214 1 1 1 1 \}'\)\)/.test(s), 'AP214 schema');
      assert(!/[^\x00-\x7f]/.test(s), 'ASCII only (Part 21)');
      assert(rfJZcount(s, /CYLINDRICAL_SURFACE\(/g) === 4, 'bends and holes are cylinders: ' + rfJZcount(s, /CYLINDRICAL_SURFACE\(/g));
      assert(rfJZcount(s, /ADVANCED_FACE\(/g) === 12, 'no facets: ' + rfJZcount(s, /ADVANCED_FACE\(/g) + ' faces');
      // the coordinates are inches: the flange's top at 1.5 + 2T
      assert(s.indexOf('1.6196') >= 0, 'coordinates in inches');
      rfJZsame(r);
    });

    test('rfJZ: open hem on the flange, holes in the base: the bend, the hem and the holes are cylinders (6), no facets, round trip exact', function () {
      var r = rfJZtrip(HEAD + 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1.5, [[2, 0.0598, 0]], { position: "inside" });\n' +
        'p.hem(0.375, [[2, 1.6196, 0]], { gap: 0.0299 });\n' +
        'p.sketch("Top").circle(1, -1.5, 0.125).circle(3, -1.5, 0.125).end().extrude(1, { cut: true, through: true });\n');
      var nc = rfJZcount(r.step, /CYLINDRICAL_SURFACE\(/g), nf = rfJZcount(r.step, /ADVANCED_FACE\(/g);
      assert(nc === 6, 'bend / hem / hole cylinders: ' + nc);
      assert(nf < 30, 'no facets: ' + nf + ' faces');
      rfJZsame(r);
    });

    test('rfJZ: Swept Flange (L profile along a line): its bend is a cylinder, 10 faces, round trip exact', function () {
      var r = rfJZtrip('p.name("Swept").units("in");\np.sheet(0.06, 0.06, 0.5);\nvar path = p.sketch("Top").line(0, 0, 0, -10).id();\n' +
        'var prof = p.sketch("Front").polyline([[0, 0], [2, 0], [2, 1]], false).id();\np.sweptFlange(prof, path);\n');
      assert(rfJZcount(r.step, /CYLINDRICAL_SURFACE\(/g) === 2, 'inside and outside of the bend');
      assert(rfJZcount(r.step, /ADVANCED_FACE\(/g) === 10, 'faces ' + rfJZcount(r.step, /ADVANCED_FACE\(/g));
      rfJZsame(r);
    });

    test('rfJZ: Lofted-Bend (Bent, square to round): flat facets written as planes, round trip to 1e-8', function () {
      var r = rfJZtrip(HEAD + 'var a = p.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).id();\n' +
        'var b = p.sketch("Top", 3).arc(0, 0, 1, 270.03, 360).arc(0, 0, 1, 0, 90).arc(0, 0, 1, 90, 180).arc(0, 0, 1, 180, 270).id();\np.loftedBend([a, b]);\n');
      assert(rfJZcount(r.step, /ADVANCED_FACE\(/g) === r.src.mesh.faces.length, 'one face per facet');
      rfJZsame(r, 1e-8);
    });

    test('rfJZ: a fillet whose side ruling is split where a chamfer ends (Chamfered block example) reads back (was refused: "trimmed by curves other than circles and rulings"), volume exact', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Chamfered block'; })[0];
      var r = rfJZtrip(ex.code, 'Block');
      assert(rfJZcount(r.step, /CYLINDRICAL_SURFACE\(/g) === 6, 'four fillets and the counterbore');
      rfJZsame(r);
    });

    test('rfJZ: FILE_NAME time stamp is local time without a zone (Part 21, as SolidWorks); was UTC', function () {
      var src = build(LBR), t = new Date(2026, 10, 6, 7, 5, 9);
      var s = Exchange.exportSTEP(src.model, src.build, { time: t, faceted: true });
      assert(s.indexOf("FILE_NAME('Bracket.step','2026-11-06T07:05:09',") >= 0, 'local stamp: ' + (/FILE_NAME\([^\n]*/.exec(s) || [''])[0]);
    });

    test('rfJZ: OpenCascade STEP header (when occt-kernel.js is loaded): FILE_NAME / FILE_DESCRIPTION / PRODUCT carry the part name, originating system Anvil, non-ASCII encoded', function () {
      if (typeof OcctKernel === 'undefined' || !OcctKernel.stepHeader) return;
      var occ = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Open CASCADE Model'),'2;1');\nFILE_NAME('Open CASCADE Shape Model','2026-11-05T23:17:27',('Author'),(\n    'Open CASCADE'),'Open CASCADE STEP processor 7.6','Open CASCADE 7.6'\n  ,'Unknown');\n" +
        "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n#7 = PRODUCT('Open CASCADE STEP translator 7.6 1',\n  'Open CASCADE STEP translator 7.6 1','',(#8));\nENDSEC;\nEND-ISO-10303-21;\n";
      var s = OcctKernel.stepHeader(occ, "Pan Ø4 O'Neil");
      assert(s.indexOf("FILE_NAME('Pan_4_O_Neil.step','2026-11-05T23:17:27',(''),(''),'Open CASCADE STEP processor 7.6','Anvil','');") >= 0, 'FILE_NAME ' + s);
      assert(s.indexOf("PRODUCT('Pan \\X2\\00D8\\X0\\4 O''Neil','Pan \\X2\\00D8\\X0\\4 O''Neil'") >= 0, 'PRODUCT ' + s);
      assert(s.indexOf('Open CASCADE Model') < 0 && !/[^\x00-\x7f]/.test(s), 'description replaced, ASCII');
    });

    test('rfJZ: box with four flanges and Closed Corners: reads back closed at the same box (the mitred bend ends are still facets: report row 1)', function () {
      var r = rfJZtrip(HEAD + 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        '[[2, 0.0598, 0], [4, 0.0598, 1.5], [2, 0.0598, 3], [0, 0.0598, 1.5]].forEach(function (e) { p.flange(1, [e], { position: "inside", lengthRef: "outer" }); });\n' +
        'p.closedCorner([[0.0299, 0.6, 0.1196], [3.8804, 0.6, 2.9701], [0.0299, 0.6, 2.8804]], { cornerType: "butt", gap: 0.01 });\n');
      assert(rfJZcount(r.step, /CYLINDRICAL_SURFACE\(/g) >= 2, 'square-ended bends are cylinders');
      rfJZsame(r, 1e-3);
    });
  })();
  // --- end rfJZ ---
