  // --- rfIW (2026-11-05, lane drawaudit, the shop audit's follow-ups): a flat pattern with no room on the sheet goes
  // to Sheet2 with its own title block; a view at a scale other than the sheet's says SCALE n : m; the title block has
  // THICKNESS (gauge + thickness), FINISH and SIZE cells ---
  (function () {
    group('rfIW: flat pattern on Sheet2 when the sheet is full, SCALE labels on views at their own scale, THICKNESS / FINISH / SIZE in the title block');
    var DW = Drawing, Ti = 0.0598;
    var CHANNEL = 'p.name("U-Channel").units("in");\np.sheet(' + Ti + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 8, 3).end().baseFlange();\n' +
      'p.flange(1.5, [[4, ' + Ti + ', 0], [4, ' + Ti + ', 3]], { position: "inside" });\n' +
      'p.sketch("Top", ' + Ti + ').circle(1, -1.5, 0.1405).circle(7, -1.5, 0.1405).circle(4, -1.5, 0.25).cut("through", { reverse: true });\n';
    var PLATE = 'p.name("Tab").units("in");\np.sheet(null, null, null, { gauge: "16" });\np.sketch("Top").rect(0, -2, 3, 2).end().baseFlange();\np.flange(0.75, [[1.5, 0.0598, 0]]);\n';
    function texts(sh, layer) { return sh.prims.filter(function (p) { return p.k === 'text' && (!layer || p.layer === layer); }).map(function (p) { return p.text; }); }
    test('rfIW: U channel, Standard 3 View at 1 : 1 on ANSI B: the flat (fit) finds no room at half scale or more, so it goes to a new Sheet2 at the sheet scale, which becomes active; Sheet1 keeps its four views; SHEET 1 OF 2 / 2 OF 2', function () {
      var r = build(CHANNEL); noErrors(r);
      var doc = DW.newDrawing(r.model, { projection: 'third', options: { flatDims: true, flatSizeNote: true } });
      DW.standard3View(doc, r.mesh, 'in');
      var before = doc.views.length;
      var fv = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, fit: true });
      assert(DW.sheets(doc).length === 2 && doc.activeSheet === 1, 'sheets ' + JSON.stringify(DW.sheets(doc)));
      assert(doc.views.length === 1 && doc.views[0] === fv && !fv.offSheet, 'Sheet2 holds the flat only');
      assert(!fv.scale || DW.scaleValue(fv.scale) === DW.scaleValue(doc.sheet.scale), 'the sheet scale ' + JSON.stringify(fv.scale));
      var s1 = DW.sheetDoc(doc, 0);
      assert(s1.views.length === before && s1.views.every(function (v) { return v.kind !== 'flat'; }), 'Sheet1 views ' + s1.views.length);
      var sh2 = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh2.views[0], S = sh2.size;
      assert(w.box.x0 > 0 && w.box.y0 > 0 && w.box.x1 < S[0] && w.box.y1 < S[1], 'on Sheet2');
      DW.tbRects(S, 'in').forEach(function (tb) { assert(w.box.x1 <= tb.x0 || w.box.x0 >= tb.x1 || w.box.y1 <= tb.y0 || w.box.y0 >= tb.y1, 'clear of the title block'); });
      assert(DW.titleBlock(doc, r.model).sheet === '2 OF 2' && DW.titleBlock(s1, r.model).sheet === '1 OF 2', 'SHEET cells');
      // newSheet: false keeps the old way (beside the sheet)
      var doc2 = DW.newDrawing(r.model, { projection: 'third' });
      DW.standard3View(doc2, r.mesh, 'in');
      DW.addFlatView(doc2, r.mesh, { model: r.model, build: r.build, fit: true, newSheet: false });
      assert(DW.sheets(doc2).length === 1, 'newSheet: false stays on Sheet1');
      return 'flat on Sheet2 at ' + DW.scaleText(fv.scale || doc.sheet.scale);
    });
    test('rfIW: a flat at half the sheet scale says SCALE 1 : 2 under its FLAT SIZE note; at the sheet scale nothing; Display label off hides it; on, the label (FLAT PATTERN / SCALE 1 : 2) replaces it; model views at their own scale keep SolidWorks\' no-label default (rfCQ)', function () {
      var r = build(CHANNEL); noErrors(r);
      var doc = DW.newDrawing(r.model, { projection: 'third', scale: [1, 1], options: { flatDims: true, flatSizeNote: true } });
      DW.standard3View(doc, r.mesh, 'in');
      var iso = doc.views.filter(function (v) { return v.orient === 'Isometric'; })[0];
      iso.scale = [1, 2];
      var fv = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 3, y: 3, scale: [1, 2] });
      function scaleTexts(sh) { return sh.prims.filter(function (p) { return p.k === 'text' && /^SCALE /.test(p.text); }); }
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views.filter(function (x) { return x.view.id === fv.id; })[0];
      var sc = scaleTexts(sh), fs = sh.prims.filter(function (p) { return p.k === 'text' && /^FLAT SIZE/.test(p.text); })[0];
      assert(sc.length === 1 && sc[0].text === 'SCALE 1 : 2' && fs && sc[0].p[1] < fs.p[1] && sc[0].p[1] < w.box.y0, 'one SCALE, under FLAT SIZE: ' + JSON.stringify([sc.map(function (p) { return [p.text, p.p]; }), fs && fs.p]));
      assert(sh.annotations.some(function (a) { return a.type === 'flatScale' && a.view === fv.id; }), 'a flat annotation (moves, hides with the others)');
      DW.setViewLabel(doc, fv.id, false);
      assert(!scaleTexts(DW.compute(doc, r.mesh, r.model, { build: r.build })).length, 'Display label off');
      DW.setViewLabel(doc, fv.id, true);
      var t = texts(DW.compute(doc, r.mesh, r.model, { build: r.build }), w.layer);
      assert(t.indexOf('FLAT PATTERN') >= 0 && t.filter(function (x) { return x === 'SCALE 1 : 2'; }).length === 1, 'label on: ' + JSON.stringify(t));
      fv.scale = null; DW.setViewLabel(doc, fv.id, null);
      assert(!scaleTexts(DW.compute(doc, r.mesh, r.model, { build: r.build })).length, 'at the sheet scale: nothing');
    });
    test('rfIW: title block THICKNESS / FINISH / SIZE: .0598 for a sheet part, 16 GA (.0598) with a gauge pick, the part\'s Finish property, B on ANSI B and A3 on A3; empty THICKNESS on a part that is not sheet metal; every caption inside its cell', function () {
      var r = build(CHANNEL); noErrors(r);
      var doc = DW.newDrawing(r.model, { projection: 'third' }), tb = DW.titleBlock(doc, r.model);
      assert(tb.thickness === '.0598' && tb.size === 'B' && tb.finish === '', JSON.stringify(tb));
      var g = build(PLATE + 'p.property("Finish", "POWDER COAT BLACK");\n'); noErrors(g);
      var gd = DW.newDrawing(g.model, { projection: 'third' }), gt = DW.titleBlock(gd, g.model);
      assert(gt.thickness === '16 GA (.0598)' && gt.finish === 'POWDER COAT BLACK', JSON.stringify([gt.thickness, gt.finish]));
      assert(Materials.sheetProperty(g.model, 'Sheet Metal Thickness') === '.0598' && Materials.sheetProperty(g.model, 'Gauge') === '16 GA', 'cut-list names');
      var mm = build('p.units("mm");\np.box(50, 10, 30);'); noErrors(mm);
      var md = DW.newDrawing(mm.model, {}), mt = DW.titleBlock(md, mm.model);
      assert(mt.thickness === '' && mt.size === md.sheet.format, JSON.stringify([mt.thickness, mt.size, md.sheet.format]));
      // the cells on the sheet: captions fit their cells, values drawn
      var sh = DW.compute(gd, g.mesh, g.model, { build: g.build }), S = sh.size;
      DW.TB_FIELDS.forEach(function (f) {
        if (f.block) return;
        var R = DW.fieldRect(f, S, 'in'), cap = sh.prims.filter(function (p) { return p.k === 'text' && p.layer === 'SHEET' && p.text === f.label && p.p[0] >= R.x0 - 1e-9 && p.p[0] <= R.x1 && p.p[1] >= R.y0 && p.p[1] <= R.y1; })[0];
        assert(cap, 'caption ' + f.label);
        var tr = DW.textRect(cap);
        assert(tr.x1 <= R.x1 + 1e-9, f.label + ' caption runs out of its cell: ' + tr.x1 + ' > ' + R.x1);
      });
      ['16 GA (.0598)', 'POWDER COAT BLACK', 'B'].forEach(function (v) { assert(texts(sh, 'SHEET').indexOf(v) >= 0, 'value ' + v); });
    });
  })();
