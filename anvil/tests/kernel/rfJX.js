  // --- rfJX (2026-11-06, lane drawfix2-2): a flat-pattern view keeps the sheet scale (SolidWorks: Use sheet scale) and
  // goes to Sheet2 only when this sheet has no room at that scale (shop flow finding 3); the inch shop sizes A, B, C, D
  // each with the full title block, zones and (A) the general tolerances; Sheet Properties' size change keeps the
  // hand-placed views where they were relative to the border ---
  (function () {
    group('rfJX: flat view at the sheet scale, ANSI A-D title blocks and zones, sheet size change keeps the views');
    var DW = Drawing, T16 = 0.0598, T14 = 0.0747;
    var JOB_A = 'p.name("L-Bracket").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T16 + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      'p.flange(2, [[2, ' + T16 + ', 3]], { position: "inside", lengthRef: "outer" });\n' +
      'p.sketch("Top", ' + T16 + ').circle(1, -1, 0.1405).circle(3, -1, 0.1405).end().cut("through", { reverse: true });\np.sketch("Front").slot(1.5, 1.2, 2.5, 1.2, 0.281).end().cut("through");\n';
    var PLATE = 'p.name("Tab").units("in");\np.sheet(' + T16 + ', 0.06, 0.44);\np.sketch("Top").rect(0, -1.5, 2, 1.5).end().baseFlange();\n' +
      'p.flange(0.75, [[1, ' + T16 + ', 1.5]], { position: "inside", lengthRef: "outer" });\n';
    var JOB_B = 'p.name("Open-Box").units("in");\np.sheet(' + T14 + ', 0.075, 0.44, { relief: "rect" });\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
      'p.flange(2, [[5, ' + T14 + ', 0], [5, ' + T14 + ', 6], [0, ' + T14 + ', 3], [10, ' + T14 + ', 3]], { position: "inside", lengthRef: "outer" });\n';
    function rfJXmeet(a, b, m) { m = m || 0; return a.x0 - m < b.x1 && b.x0 - m < a.x1 && a.y0 - m < b.y1 && b.y0 - m < a.y1; }
    function rfJXshop(code, fmt, opts, docOpts) {
      var r = build(code); noErrors(r);
      var doc = DW.newDrawing(r.model, Object.assign({ projection: 'third', format: fmt || 'ANSI B', options: { flatDims: true, flatSizeNote: true } }, docOpts || {}));
      DW.standard3View(doc, r.mesh, 'in');
      doc.autoDims = true;
      var fv = DW.addFlatView(doc, r.mesh, Object.assign({ model: r.model, build: r.build, fit: true, bendNotes: 'table' }, opts || {}));
      return { r: r, doc: doc, fv: fv, sheet: DW.compute(doc, r.mesh, r.model, { build: r.build }) };
    }
    test('rfJX: shop flow 3 — the L-bracket\'s flat (4 x 4.896) on its full 1 : 1 ANSI B sheet: no room at 1 : 1, so it goes to Sheet2 at 1 : 1 (no longer 1 : 2 squeezed beside the views); newSheet: false keeps the old half-scale spot', function () {
      var s = rfJXshop(JOB_A);
      assert(DW.scaleText(s.doc.sheet.scale) === '1:1', 'sheet scale ' + DW.scaleText(s.doc.sheet.scale));
      assert((s.doc.activeSheet | 0) === 1 && DW.sheetCount(s.doc) === 2, 'on Sheet2: ' + s.doc.activeSheet);
      assert(!s.fv.scale || DW.scaleText(s.fv.scale) === '1:1', 'flat at the sheet scale: ' + JSON.stringify(s.fv.scale));
      var w = s.sheet.views.filter(function (x) { return x.view.id === s.fv.id; })[0], b1 = 10 / 25.4;
      assert(Math.abs((w.box.x1 - w.box.x0) - 4) < 0.01, 'drawn 4 in wide: ' + (w.box.x1 - w.box.x0));
      assert(w.box.x0 > b1 && w.box.y0 > b1 && w.box.x1 < 17 - b1 && w.box.y1 < 11 - b1, 'on the sheet');
      assert(!s.sheet.annotations.some(function (a) { return a.type === 'flatScale'; }), 'no SCALE note under it');
      var old = rfJXshop(JOB_A, 'ANSI B', { newSheet: false });
      assert((old.doc.activeSheet | 0) === 0 && DW.scaleText(old.fv.scale) === '1:2', 'newSheet false: ' + JSON.stringify(old.fv.scale));
      return 'Sheet2, 1 : 1';
    });
    test('rfJX: a small flat that has room (the tab on a 1 : 1 sheet) stays on Sheet1 at the sheet scale; the open box (sheet 1 : 2) goes to Sheet2 at 1 : 2', function () {
      var s = rfJXshop(PLATE, 'ANSI B', null, { scale: [1, 1] });
      assert((s.doc.activeSheet | 0) === 0 && DW.sheetCount(s.doc) === 1, 'Sheet1: ' + s.doc.activeSheet + ' of ' + DW.sheetCount(s.doc));
      assert(!s.fv.scale, 'sheet scale ' + JSON.stringify(s.fv.scale));
      var w = s.sheet.views.filter(function (x) { return x.view.id === s.fv.id; })[0];
      s.sheet.views.forEach(function (x) { if (x !== w) assert(!rfJXmeet(x.box, w.box), 'covers ' + x.view.name); });
      var b = rfJXshop(JOB_B);
      assert(DW.scaleText(b.doc.sheet.scale) === '1:2' && (b.doc.activeSheet | 0) === 1 && !b.fv.scale, 'box: ' + DW.scaleText(b.doc.sheet.scale) + ' sheet ' + b.doc.activeSheet + ' ' + JSON.stringify(b.fv.scale));
      return DW.scaleText(s.doc.sheet.scale) + ' / box 1:2 Sheet2';
    });
    test('rfJX: ANSI A, B, C, D landscape — each has the title block with MATERIAL, THICKNESS, SCALE, SIZE (its letter), FINISH, SHEET, its zones, the general tolerances (on A against the title block, COMPANY / DRAWN left off), and Standard 3 View of the L-bracket clear of the blocks', function () {
      var r = build(JOB_A); noErrors(r);
      var want = { 'ANSI A': [2, 2], 'ANSI B': [4, 2], 'ANSI C': [4, 4], 'ANSI D': [8, 4] }, out = [];
      Object.keys(want).forEach(function (f) {
        var doc = DW.newDrawing(r.model, { projection: 'third', format: f });
        DW.standard3View(doc, r.mesh, 'in');
        var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), S = sh.size;
        var caps = sh.prims.filter(function (p) { return p.layer === 'SHEET' && p.k === 'text'; }).map(function (p) { return p.text; });
        ['MATERIAL', 'THICKNESS', 'SCALE', 'SIZE', 'FINISH', 'SHEET', 'UNLESS OTHERWISE SPECIFIED'].forEach(function (c) { assert(caps.indexOf(c) >= 0, f + ': no ' + c + ' cell'); });
        assert(caps.indexOf(f.slice(5)) >= 0, f + ': SIZE ' + f.slice(5));
        assert(caps.indexOf('.0598') >= 0 || caps.some(function (t) { return /\.0598/.test(t); }), f + ': THICKNESS .0598');
        assert(sh.zones && sh.zones.cols === want[f][0] && sh.zones.rows === want[f][1], f + ' zones');
        var tbs = DW.tbRects(S, 'in'), b1 = 10 / 25.4;
        assert(tbs.length === 2 && tbs[1].x0 >= b1 - 1e-9, f + ': left block inside the border ' + JSON.stringify(tbs));
        // the tolerance texts sit inside the left block
        var tol = sh.prims.filter(function (p) { return p.layer === 'SHEET' && p.k === 'text' && /^\.XXX/.test(p.text); })[0];
        assert(tol && tol.p[0] >= tbs[1].x0 && tol.p[0] <= tbs[1].x1, f + ': tolerances in their block');
        assert((caps.indexOf('DRAWN') >= 0) === (f !== 'ANSI A'), f + ': DRAWN ' + (caps.indexOf('DRAWN') >= 0));
        sh.views.forEach(function (w) {
          tbs.forEach(function (t) { assert(!rfJXmeet(w.box, t), f + ': ' + w.view.name + ' on the title block'); });
          assert(w.box.x0 > b1 && w.box.y0 > b1 && w.box.x1 < S[0] - b1 && w.box.y1 < S[1] - b1, f + ': ' + w.view.name + ' past the border');
        });
        out.push(f.slice(5) + ' ' + DW.scaleText(doc.sheet.scale));
      });
      return out.join(', ');
    });
    test('rfJX: Sheet Properties size change (B -> C -> D -> A -> B) with Standard 3 View and a hand-placed flat: the standard views are laid out again, the flat keeps its place relative to the border, nothing covers another view, the title block or runs past the border', function () {
      var r = build(PLATE); noErrors(r);
      // (the shop's usual: a fixed 1 : 1 sheet scale from Sheet Properties)
      var doc = DW.newDrawing(r.model, { projection: 'third', format: 'ANSI B', scale: [1, 1] });
      DW.standard3View(doc, r.mesh, 'in');
      var fv = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 3, y: 8.5 });
      var note = DW.addNote(doc, { p: [1, 10], text: 'NOTES:' });
      var out = [];
      ['ANSI C', 'ANSI D', 'ANSI A', 'ANSI B'].forEach(function (f) {
        var S0 = DW.sheetSize(doc, 'in'), fx = (fv.x - 10 / 25.4) / (S0[0] - 20 / 25.4), fy = (fv.y - 10 / 25.4) / (S0[1] - 20 / 25.4);
        doc.sheet.format = f;
        DW.layout(doc, r.mesh, 'in');
        DW.refitSheet(doc, r.mesh, S0, 'in');
        var S = DW.sheetSize(doc, 'in'), sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), b1 = 10 / 25.4, tbs = DW.tbRects(S, 'in');
        var w = sh.views.filter(function (x) { return x.view.id === fv.id; })[0];
        sh.views.forEach(function (x) {
          assert(x.box.x0 > b1 && x.box.y0 > b1 && x.box.x1 < S[0] - b1 && x.box.y1 < S[1] - b1, f + ': ' + x.view.name + ' past the border ' + JSON.stringify(x.box));
          tbs.forEach(function (t) { assert(!rfJXmeet(x.box, t), f + ': ' + x.view.name + ' on the title block'); });
          sh.views.forEach(function (y) { if (y !== x) assert(!rfJXmeet(x.box, y.box), f + ': ' + x.view.name + ' on ' + y.view.name); });
        });
        var gx = (fv.x - b1) / (S[0] - 2 * b1), gy = (fv.y - b1) / (S[1] - 2 * b1);
        out.push(f.slice(5) + ' ' + DW.scaleText(doc.sheet.scale) + ' flat ' + gx.toFixed(2) + ',' + gy.toFixed(2) + ' (was ' + fx.toFixed(2) + ',' + fy.toFixed(2) + ')');
        assert(note.p[0] > b1 && note.p[0] < S[0] - b1 && note.p[1] > b1 && note.p[1] < S[1] - b1, f + ': the sheet note stays on the sheet');
        assert(DW.scaleText(doc.sheet.scale) === '1:1' && !w.view.scale, f + ': the flat keeps the sheet scale');
        if (f !== 'ANSI A') assert(Math.abs(gx - fx) < 0.12 && Math.abs(gy - fy) < 0.12, f + ': the flat moved from ' + fx.toFixed(2) + ',' + fy.toFixed(2) + ' to ' + gx.toFixed(2) + ',' + gy.toFixed(2));
      });
      return out.join('; ');
    });
  })();
