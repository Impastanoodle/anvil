  // --- rfKT (2026-11-11, lane drawflow, test-reports/2026-11-11-drawing-flow.md) --- the engine side of three shop
  // drawings made with the mouse: a Hole Callout added after a clicked dimension keeps its text off that dimension;
  // an ordinate set keeps its values off a Hole Table's datum Y; a view moved to another sheet (Move to Sheet) takes the
  // views made from it, its dimensions and the notes on it. Self-contained.
  (function () {
    group('rfKT: drawing flow (callout clear of a clicked dimension, ordinates off a datum, Move to Sheet)');
    var DW = Drawing;
    var RFKT_PLATE = 'p.name("KTPlate").units("in");\np.sketch("Top").rect(0, -4, 6, 4).end().extrude(0.125, { reverse: true });\n' +
      'p.hole("Top", 1.5, -1, 0.281);\np.hole("Top", 4.5, -1, 0.281);\np.hole("Top", 3, -2.5, 0.5);';
    function rfKTDoc(extra) {
      var r = build(RFKT_PLATE + (extra || ''));
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-11', autoDims: false });
      DW.standard3View(doc, r.mesh, r.model.units);
      r.doc = doc;
      r.sheet = function () { return DW.compute(doc, r.mesh, r.model); };
      return r;
    }
    function rfKTMeet(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
    function rfKTThrows(fn, re) { var m = null; try { fn(); } catch (e) { m = e.message; } assert(m != null && re.test(m), 'expected an error ' + re + ', got ' + m); }
    function rfKTTop(doc) { return doc.views.filter(function (v) { return v.orient === 'Top'; })[0]; }

    test('rfKT: a Hole Callout added after a dimension clicked onto its default spot turns its leader so its text clears the dimension\'s text and lines (the default is kept when it is clear)', function () {
      var r = rfKTDoc(), T = rfKTTop(r.doc);
      DW.addHoleCallout(r.doc, T.id, { c: [1.5, -1], r: 0.1405 });
      var sh = r.sheet(), w = sh.views.filter(function (x) { return x.view.id === T.id; })[0];
      var ct = sh.prims.filter(function (p) { return p.k === 'text' && /Ø\.281/.test(p.text) && p.dimIx == null; })[0];
      assert(ct, 'the callout text: ' + sh.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; }).join(' | '));
      var cr = DW.textRect(ct), lead0 = T.annotations[0].leadNow.slice();
      // a dimension clicked so its text sits on the callout's text: two points either side of the text's middle
      var mid = w.fromSheet([(cr.x0 + cr.x1) / 2, (cr.y0 + cr.y1) / 2]), half = 0.4;
      T.dims = []; DW.addSmartDim(r.doc, T.id, { point: [mid[0] - half, -1] }, { point: [mid[0] + half, -1] }, [mid[0], mid[1]], { lock: 'h' });
      sh = r.sheet();
      var dt = sh.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null; })[0];
      assert(dt && rfKTMeet(DW.textRect(dt), cr), 'the dimension text is on the callout\'s default spot: ' + JSON.stringify([dt && DW.textRect(dt), cr]));
      var ct2 = sh.prims.filter(function (p) { return p.k === 'text' && /Ø\.281/.test(p.text) && p.dimIx == null; })[0];
      var r2 = DW.textRect(ct2), dr = DW.textRect(dt);
      assert(!rfKTMeet(r2, dr), 'the callout moved clear: ' + JSON.stringify([r2, dr]));
      var segs = sh.prims.filter(function (p) { return p.k === 'line' && p.dimIx != null; });
      segs.forEach(function (s) { assert(!DW._.segHitsRect(s.a, s.b, r2), 'a dimension line crosses the callout text'); });
      var lead1 = T.annotations[0].leadNow;
      assert(Math.hypot(lead1[0] - lead0[0], lead1[1] - lead0[1]) > 1e-6 && !T.annotations[0].lead, 'leader turned, nothing stored: ' + JSON.stringify([lead0, lead1, T.annotations[0].lead]));
      // in the DXF too (the sheet is what is written)
      var dxf = DW.toDXF(sh);
      assert(dxf.indexOf('%%c.281') >= 0, 'callout in the DXF');
      // clear by default: unchanged
      T.dims = [];
      sh = r.sheet();
      var lead2 = T.annotations[0].leadNow;
      near(lead2[0], lead0[0], 1e-12, 'default lead x'); near(lead2[1], lead0[1], 1e-12, 'default lead y');
      return 'lead ' + lead0.map(fmt) + ' -> ' + lead1.map(fmt);
    });

    test('rfKT: an ordinate set above the Top view keeps its values off a Hole Table\'s datum Y at a top-left origin (the set\'s line goes out; without the table it stays at 10 mm)', function () {
      var r = rfKTDoc(), T = rfKTTop(r.doc);
      var sh = r.sheet(), w = sh.views.filter(function (x) { return x.view.id === T.id; })[0];
      var left = w.proj.lines.visible.filter(function (l) { return Math.abs(l[0]) < 1e-9 && Math.abs(l[2]) < 1e-9; })[0];
      assert(left, 'the left edge');
      DW.addOrdinate(r.doc, T.id, { dir: 'h', base: { a: [left[0], left[1]], b: [left[2], left[3]] }, refs: [{ kind: 'dia', c: [1.5, -1], r: 0.1405 }, { kind: 'dia', c: [3, -2.5], r: 0.25 }, { kind: 'dia', c: [4.5, -1], r: 0.1405 }] });
      sh = r.sheet();
      function ordTexts(s) { return s.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null && s.dims[p.dimIx].kind === 'ordinate'; }); }
      var o0 = ordTexts(sh), y0 = Math.min.apply(null, o0.map(function (p) { return DW.textRect(p).y0; }));
      assert(o0.length === 4 && o0.map(function (p) { return p.text; }).join(',') === '0,1.500,3.000,4.500', 'ordinates: ' + o0.map(function (p) { return p.text; }).join(','));
      DW.addHoleTable(r.doc, T.id, { origin: { p: [0, 0] }, all: true }, w);
      sh = r.sheet();
      var Y = sh.prims.filter(function (p) { return p.k === 'text' && p.text === 'Y' && p.layer === 'ANNOTATIONS'; })[0];
      assert(Y, 'the datum Y');
      var yr = DW.textRect(Y), o1 = ordTexts(sh);
      o1.forEach(function (p) { assert(!rfKTMeet(DW.textRect(p), yr), p.text + ' on the datum Y: ' + JSON.stringify([DW.textRect(p), yr])); });
      var y1 = Math.min.apply(null, o1.map(function (p) { return DW.textRect(p).y0; }));
      assert(y1 > y0 + 1e-6, 'the set went out: ' + y0 + ' -> ' + y1);
      return 'values from ' + fmt(y0) + ' to ' + fmt(y1) + ' in';
    });

    test('rfKT: Move to Sheet: the Front view goes to Sheet2 with the Top and Right views made from it, their dimensions and the note on it, at the same paper place; the Isometric stays; a projected view alone is refused', function () {
      var r = rfKTDoc(), doc = r.doc;
      var F = doc.views.filter(function (v) { return v.orient === 'Front'; })[0], T = rfKTTop(doc), I = doc.views.filter(function (v) { return v.orient === 'Isometric'; })[0];
      DW.addSmartDim(doc, T.id, { center: { c: [1.5, -1], r: 0.1405 } }, { center: { c: [4.5, -1], r: 0.1405 } }, [3, 0.5], {});
      r.sheet();
      DW.addNote(doc, { p: [T.x + 0.2, T.y], text: 'ON TOP' });
      DW.addNote(doc, { p: [0.8, 1.2], text: 'PAPER NOTE' });
      r.sheet();   // (followViews attaches the first note to the Top view)
      assert(doc.notes[0].view === T.id && !doc.notes[1].view, 'notes attached: ' + JSON.stringify(doc.notes.map(function (n) { return n.view; })));
      DW.addSheet(doc, { activate: false });
      var tx = T.x, ty = T.y;
      rfKTThrows(function () { DW.moveViewToSheet(doc, T.id, 1); }, /made from/);
      var ids = DW.moveViewToSheet(doc, F.id, 'Sheet2');
      assert(ids.length === 3 && ids.indexOf(T.id) >= 0, 'the family: ' + JSON.stringify(ids));
      assert(doc.views.length === 1 && doc.views[0].id === I.id, 'Sheet1 keeps the isometric: ' + doc.views.map(function (v) { return v.orient; }).join(','));
      assert(doc.notes.length === 1 && doc.notes[0].text === 'PAPER NOTE', 'the paper note stays');
      var sh1 = r.sheet();
      assert(sh1.views.length === 1, 'Sheet1 draws one view');
      DW.activateSheet(doc, 1);
      var T2 = rfKTTop(doc);
      assert(doc.views.length === 3 && T2 && T2.x === tx && T2.y === ty, 'Sheet2 has the three at their place: ' + JSON.stringify(doc.views.map(function (v) { return [v.orient, v.x, v.y]; })));
      assert(doc.notes.length === 1 && doc.notes[0].text === 'ON TOP', 'the note went along');
      var sh2 = r.sheet();
      assert(sh2.dims.some(function (d) { return d.text === '3.000' && d.view === T2.id; }), 'the dimension on Sheet2: ' + sh2.dims.map(function (d) { return d.text; }).join(' | '));
      assert(DW.toDXF(sh2).indexOf('ON TOP') >= 0, 'the note in Sheet2\'s DXF');
      rfKTThrows(function () { DW.moveViewToSheet(doc, T2.id + 99, 0); }, /No drawing view/);
      rfKTThrows(function () { DW.moveViewToSheet(doc, rfKTTop(doc).parent, 1); }, /already/);
      return 'moved ' + ids.length + ' views';
    });

    test('rfKT: Move to Sheet onto a smaller sheet pulls the views in together (aligned views stay aligned)', function () {
      var r = rfKTDoc(), doc = r.doc;
      doc.sheet.format = 'ANSI C';
      var F = doc.views.filter(function (v) { return v.orient === 'Front'; })[0], T = rfKTTop(doc);
      F.x = 18; T.x = 18; T.y = 14; F.y = 9;
      DW.addSheet(doc, { format: 'ANSI A', activate: false });
      DW.moveViewToSheet(doc, F.id, 1);
      DW.activateSheet(doc, 1);
      var S = DW.sheetSize(doc, 'in');
      doc.views.forEach(function (v) { assert(v.x < S[0] && v.y < S[1], v.orient + ' on the sheet: ' + v.x + ', ' + v.y + ' in ' + S); });
      var F2 = doc.views.filter(function (v) { return v.orient === 'Front'; })[0], T2 = rfKTTop(doc);
      near(F2.x, T2.x, 1e-12, 'Top still above Front');
      return S.map(fmt).join(' x ');
    });

  })();
  // --- end rfKT ---
