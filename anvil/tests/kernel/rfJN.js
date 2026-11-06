  // --- rfJN (2026-11-06, lane flatopts-3) --- the sheet-metal Cut-List Properties as drawing links: $PRPSHEET:"Bounding
  // Box Length" etc. resolve through Materials.system / SHEET_FALLBACK (Kernel.sheetCutList), in a note as in a title
  // block field. 16 ga steel, a 6 × 4 in blank with two Ø.5 holes.
  (function () {
    group('rfJN: Cut-List Properties as drawing links ($PRPSHEET:"Bounding Box Length" …)');
    var T = 0.0598, R = 0.0598;
    var PLATE = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).circle(1.5, -2, 0.25).circle(4.5, -2, 0.25).end().baseFlange();\n';
    function rfJNbuild(code) {
      var model = K.newModel('Test');
      K.runScript(model, code);
      var b = K.rebuild(model), mesh = K.meshFromBody(b.body);
      return { model: model, build: b, mesh: mesh };
    }
    function rfJNprop(x, name) { return Materials.sheetProperty(x.model, name, Materials.context(x.model, { build: x.build, mesh: x.mesh })); }

    test('rfJN: a drawing note on the 6 × 4 blank linked to Bounding Box Length / Width, Cutting Length-Outer / -Inner, Cut Outs and Bends reads 6 × 4, 20, 3.1416, 2, 0', function () {
      var x = rfJNbuild(PLATE), D = Drawing;
      var doc = D.newDrawing(x.model, { date: '2026-11-06' });
      D.standard3View(doc, x.mesh, x.model.units);
      var nt = D.addNote(doc, { p: [1, 2], text: 'BLANK $PRPSHEET:"Bounding Box Length" X $PRPSHEET:"Bounding Box Width"\nCUT $PRPSHEET:"Cutting Length-Outer" + $PRPSHEET:"Cutting Length-Inner"\n$PRPSHEET:"Cut Outs" HOLES, $PRPSHEET:"Bends" BENDS' });
      var sheet = D.compute(doc, x.mesh, x.model, { build: x.build });
      var sn = sheet.notes.filter(function (n) { return n.raw === nt.text; })[0];
      assert(sn, 'the note');
      assert(sn.text === 'BLANK 6 X 4\nCUT 20 + 3.1416\n2 HOLES, 0 BENDS', 'note: ' + JSON.stringify(sn.text));
      // a title block field linked the same way (the FINISH box here)
      doc.titleBlock = { finish: '$PRPSHEET:"Bounding Box Length" X $PRPSHEET:"Bounding Box Width"' };
      var tb = D.titleBlock(doc, x.model, { build: x.build, mesh: x.mesh });
      assert(tb.finish === '6 X 4', 'title block field: ' + JSON.stringify(tb.finish));
      return 'ok';
    });

    test('rfJN: Materials.sheetProperty: the K-Factor, gauge, areas; a File Property of the same name wins; Description / Material / Mass / Sheet Metal Thickness keep their old values; a part with no sheet gives empty', function () {
      var x = rfJNbuild(PLATE);
      assert(rfJNprop(x, 'K-Factor') === '0.5' && rfJNprop(x, 'bounding box area') === '24', 'K-Factor / area (any case): ' + rfJNprop(x, 'K-Factor') + ' / ' + rfJNprop(x, 'bounding box area'));
      assert(rfJNprop(x, 'Bounding Box Area-Blank') === (24 - 2 * Math.PI * 0.0625).toFixed(4), 'blank area: ' + rfJNprop(x, 'Bounding Box Area-Blank'));
      assert(rfJNprop(x, 'Bend Deduction') === '', 'a K-factor sheet has no Bend Deduction');
      assert(rfJNprop(x, 'Sheet Metal Thickness') === '.0598', 'Sheet Metal Thickness as before: ' + rfJNprop(x, 'Sheet Metal Thickness'));
      assert(rfJNprop(x, 'Description') !== 'Sheet', 'Description is not hijacked: ' + rfJNprop(x, 'Description'));
      Materials.setProperty(x.model, 'Bounding Box Length', 'SEE FLAT');
      assert(rfJNprop(x, 'Bounding Box Length') === 'SEE FLAT', 'the File Property wins');
      var mm = rfJNbuild('p.units("mm");\np.sheet(1.5, 1.5, 0.5);\np.sketch("Top").rect(0, -100, 152.4, 100).end().baseFlange();\n');
      assert(rfJNprop(mm, 'Bounding Box Length') === '152.4' && rfJNprop(mm, 'Cutting Length-Outer') === '504.8', 'mm: ' + rfJNprop(mm, 'Bounding Box Length') + ' / ' + rfJNprop(mm, 'Cutting Length-Outer'));
      var solid = rfJNbuild('p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\n');
      assert(rfJNprop(solid, 'Bounding Box Length') === '', 'no sheet: empty');
      return 'ok';
    });
  })();
