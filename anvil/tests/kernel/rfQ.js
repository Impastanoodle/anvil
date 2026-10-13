  // --- rfQ: several sheets in a drawing, notes and symbols that follow their view ---
  (function () {
    group('rfQ: drawing sheets (Add / Delete / Rename / activate, SHEET n OF m, PDF pages), notes and symbols attached to a view');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    var PLATE = 'p.name("Plate").units("in");\np.sketch("Front").rect(0, 0, 6, 3).extrude(0.25);\np.hole("Front", 1, 1, 0.281, { offset: 0.25 });';
    function rfQThrows(fn) { try { fn(); } catch (e) { return true; } return false; }
    function rfQDoc() {
      var r = build(PLATE);
      noErrors(r);
      r.doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function (d) { r.sheet = DW.compute(d || r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      r.recompute();
      return r;
    }
    test('rfQ: Add Sheet makes Sheet2 active with the first sheet\'s format, the title block reads SHEET 2 OF 2; each sheet keeps its own views, scale and projection; activate, rename, delete; a one-sheet document saved before stays one sheet', function () {
      var r = rfQDoc(), d = r.doc, n1 = d.views.length;
      assert(!d.sheets && DW.sheetCount(d) === 1 && DW.sheets(d).length === 1, 'one sheet, no list');
      assert(DW.titleBlock(d, r.model).sheet === '1 OF 1', 'SHEET 1 OF 1: ' + DW.titleBlock(d, r.model).sheet);
      var i = DW.addSheet(d);
      assert(i === 1 && d.activeSheet === 1 && d.sheet.name === 'Sheet2' && d.views.length === 0, 'Sheet2 active and empty');
      assert(d.sheet.format === 'ANSI B' && d.sheet.projection === 'third', 'format copied');
      assert(DW.titleBlock(d, r.model).sheet === '2 OF 2', 'SHEET 2 OF 2');
      r.recompute();
      assert(r.sheet.views.length === 0 && r.sheet.prims.some(function (p) { return p.k === 'text' && p.text === '2 OF 2'; }), 'empty sheet drawn with 2 OF 2');
      d.sheet.format = 'ANSI A'; d.sheet.projection = 'first';
      var v = DW.addView(d, 'Front', { x: 5, y: 5 });
      r.recompute();
      assert(r.sheet.views.length === 1 && v.id === n1 + 1, 'view ids go on across the sheets: ' + v.id);
      DW.activateSheet(d, 'Sheet1');
      assert(d.activeSheet === 0 && d.views.length === n1 && d.sheet.format === 'ANSI B' && d.sheet.projection === 'third', 'Sheet1 back with its views');
      assert(DW.titleBlock(d, r.model).sheet === '1 OF 2', 'SHEET 1 OF 2');
      var l = DW.sheets(d);
      assert(l.length === 2 && l[0].active && !l[1].active && l[1].views === 1 && l[1].format === 'ANSI A' && l[1].projection === 'first', JSON.stringify(l));
      // saved and loaded: both sheets come back
      var d2 = JSON.parse(JSON.stringify(d));
      assert(DW.sheets(d2).map(function (s) { return s.name + ':' + s.views; }).join(',') === 'Sheet1:' + n1 + ',Sheet2:1', 'JSON round trip');
      // sheetDoc works out a sheet that is not the active one, without switching
      var s2 = DW.compute(DW.sheetDoc(d, 1), r.mesh, r.model, { build: r.build });
      assert(s2.views.length === 1 && d.activeSheet === 0 && d.views.length === n1, 'sheetDoc(1)');
      assert(DW.renameSheet(d, 1, 'Flat') === 'Flat' && DW.sheets(d)[1].name === 'Flat', 'rename');
      assert(rfQThrows(function () { DW.renameSheet(d, 0, 'flat'); }) && rfQThrows(function () { DW.addSheet(d, { name: 'Sheet1' }); }), 'names unique');
      var i3 = DW.addSheet(d, { activate: false, format: 'ANSI C', scale: '1:2' });
      assert(i3 === 2 && d.activeSheet === 0 && DW.sheets(d)[2].scale === '1:2' && DW.sheets(d)[2].name === 'Sheet3', 'added without activating');
      DW.deleteSheet(d, 0);
      assert(d.activeSheet === 0 && d.sheet.name === 'Flat' && d.views.length === 1 && DW.sheetCount(d) === 2, 'deleting the active first sheet activates its neighbour');
      DW.deleteSheet(d, 'Sheet3');
      assert(!d.sheets && DW.sheetCount(d) === 1 && DW.titleBlock(d, r.model).sheet === '1 OF 1', 'one sheet left: a plain document again');
      assert(rfQThrows(function () { DW.deleteSheet(d, 0); }), 'the last sheet stays');
      return n1 + ' + 1 views';
    });
    test('rfQ: a multi-sheet PDF has one page per sheet at each sheet\'s size; one sheet is still a one-page PDF', function () {
      var r = rfQDoc(), d = r.doc;
      var one = DW.toPDF(r.sheet);
      assert(/\/Count 1 /.test(one) && (one.match(/\/Type \/Page /g) || []).length === 1, 'one page');
      DW.addSheet(d, { format: 'ANSI A' });
      var sheets = [0, 1].map(function (i) { return DW.compute(DW.sheetDoc(d, i), r.mesh, r.model, { build: r.build }); });
      var pdf = DW.toPDF(sheets);
      assert(/\/Count 2 /.test(pdf) && (pdf.match(/\/Type \/Page /g) || []).length === 2, 'two pages');
      assert(/MediaBox \[0 0 1224 792\]/.test(pdf) && /MediaBox \[0 0 792 612\]/.test(pdf), 'B and A page sizes');
      assert(/\(2 OF 2\) Tj/.test(pdf) && /\(1 OF 2\) Tj/.test(pdf), 'sheet numbers on the pages');
      var xr = +/startxref\n(\d+)/.exec(pdf)[1];
      assert(pdf.slice(xr, xr + 4) === 'xref', 'xref offset');
      return pdf.length + ' bytes';
    });
    test('rfQ: a note with its leader on a view, a datum on a view and a geometric tolerance on a view move with the view; a free note stays; deleting the view leaves its notes on the sheet', function () {
      var r = rfQDoc(), d = r.doc, front = d.views.filter(function (v) { return v.orient === 'Front'; })[0];
      var w = r.sheet.views.filter(function (x) { return x.view.id === front.id; })[0], b = w.box, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      var nOn = DW.addNote(d, { p: [b.x1 + 0.5, b.y1 + 0.5], text: 'BREAK EDGES', leader: [b.x1, cy] });
      var nFree = DW.addNote(d, { p: [1, 1.2], text: 'FREE NOTE' });
      var nForced = DW.addNote(d, { p: [cx, cy], text: 'ON THE SHEET', view: 0 });
      var dat = DW.addSymbol(d, { type: 'datum', p: [cx, b.y0 - 0.6], leader: [cx, b.y0] });
      var gt = DW.addSymbol(d, { type: 'gtol', p: [cx - 0.3, cy], char: 'flatness', tol: '.010' });
      r.recompute();
      assert(nOn.view === front.id && dat.view === front.id && gt.view === front.id, 'attached to the front view');
      assert(nFree.view === 0 && nForced.view === 0, 'free notes on the sheet');
      var p0 = nOn.p.slice(), l0 = nOn.leader.slice(), f0 = nFree.p.slice(), q0 = nForced.p.slice(), dl0 = dat.leader.slice(), g0 = gt.p.slice();
      var x0 = front.x, y0 = front.y;
      DW.moveView(d, front.id, x0 + 0.75, y0 - 0.5);
      var dx = front.x - x0, dy = front.y - y0;
      assert(Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1, 'the view moved');
      r.recompute();
      near(nOn.p[0], p0[0] + dx, 1e-9, 'note x'); near(nOn.p[1], p0[1] + dy, 1e-9, 'note y');
      near(nOn.leader[0], l0[0] + dx, 1e-9, 'leader x'); near(nOn.leader[1], l0[1] + dy, 1e-9, 'leader y');
      near(dat.leader[0], dl0[0] + dx, 1e-9, 'datum'); near(gt.p[1], g0[1] + dy, 1e-9, 'gtol');
      assert(nFree.p[0] === f0[0] && nFree.p[1] === f0[1] && nForced.p[0] === q0[0], 'free notes stay');
      var nb = r.sheet.notes.filter(function (n) { return n.id === nOn.id; })[0];
      assert(nb && Math.abs(nb.p[0] - nOn.p[0]) < 1e-9, 'drawn where it moved');
      // a note dragged on its own keeps its new offset from the view
      DW.editNote(d, nOn.id, { p: [nOn.p[0] + 0.2, nOn.p[1]] });
      var p1 = nOn.p.slice();
      DW.moveView(d, front.id, front.x + 0.25, front.y);
      var dx2 = front.x - (nOn.vxy ? nOn.vxy[0] : front.x);
      r.recompute();
      near(nOn.p[0], p1[0] + dx2, 1e-9, 'offset kept after a note drag');
      // saved and loaded, then moved: still follows
      var d2 = JSON.parse(JSON.stringify(d)), fr2 = DW.findView(d2, front.id), n2 = DW.findNote(d2, nOn.id), pp = n2.p.slice(), fx = fr2.x;
      DW.moveView(d2, front.id, fr2.x - 0.4, fr2.y);
      DW.compute(d2, r.mesh, r.model, { build: r.build });
      near(n2.p[0], pp[0] + (fr2.x - fx), 1e-9, 'follows after a JSON round trip');
      DW.deleteView(d, front.id);
      var pk = nOn.p.slice();
      r.recompute();
      assert(nOn.view === 0 && nOn.p[0] === pk[0] && DW.findNote(d, nOn.id), 'view deleted: the note stays on the sheet');
      return 'dx ' + dx.toFixed(3) + ' dy ' + dy.toFixed(3);
    });
  })();
  // --- end rfQ ---
