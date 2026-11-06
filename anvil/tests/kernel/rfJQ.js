  // --- rfJQ (2026-11-06, lane shopflow, test-reports/2026-11-06-shop-flow.md) --- the three shop jobs' outputs: blank
  // sizes against the hand bend deduction (BD = 2 (R + T) − π/2 (R + K T) at 90°), the laser DXF read back (R12 and
  // R2000, closed loops, inch header, holes / slot / louver slits / relief holes on their layers), and the drawing
  // (Standard 3 View + a flat view with Bend Table, Hole Table / Punch Table) with nothing in the title or tolerance
  // block, across another view or past the border; drawing DXF reads back, PDF is one page.
  (function () {
    group('rfJQ: shop jobs end to end (L-bracket, open box with hem and corner reliefs, louvered panel): blanks, laser DXF, drawings');
    var DW = Drawing, T16 = 0.0598, T14 = 0.0747, T18 = 0.0478;
    function bd(R, T, Kf) { return 2 * (R + T) - Math.PI / 2 * (R + Kf * T); }
    var JOB_A = 'p.name("L-Bracket").units("in");\np.material("Plain Carbon Steel");\np.sheet(' + T16 + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
      'p.flange(2, [[2, ' + T16 + ', 3]], { position: "inside", lengthRef: "outer" });\n' +
      'p.sketch("Top", ' + T16 + ').circle(1, -1, 0.1405).circle(3, -1, 0.1405).end().cut("through", { reverse: true });\np.sketch("Front").slot(1.5, 1.2, 2.5, 1.2, 0.281).end().cut("through");\n';
    var JOB_B = 'p.name("Open-Box").units("in");\np.sheet(' + T14 + ', 0.075, 0.44, { relief: "rect" });\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
      'p.flange(2, [[5, ' + T14 + ', 0], [5, ' + T14 + ', 6], [0, ' + T14 + ', 3], [10, ' + T14 + ', 3]], { position: "inside", lengthRef: "outer" });\n' +
      'p.cornerRelief([[9.8503, 0.0747, 0.1497], [0.1497, 0.0747, 5.8503]], null, { reliefType: "circular" });\np.hem(0.375, [[5, 2, 0]], { gap: 0.0299 });\n';
    var JOB_C = 'p.name("Panel").units("in");\np.sheet(' + T18 + ', 0.05, 0.44);\np.sketch("Top").rect(0, -8, 12, 8).end().baseFlange();\n' +
      [3, 5, 7, 9].map(function (x) { return 'p.formingTool("louver", [' + x + ', ' + T18 + ', 4], { angle: 90 });\n'; }).join('');
    function primBox(p) {
      if (p.k === 'text') return DW.textRect(p);
      if (p.k === 'line') return { x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), y0: Math.min(p.a[1], p.b[1]), y1: Math.max(p.a[1], p.b[1]) };
      return null;
    }
    function meet(a, b) { return a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9; }
    function clashes(sh) {
      var S = sh.size, tbs = DW.tbRects(S, 'in'), b1 = 10 / 25.4, items = [], bad = [];
      (sh.annotations || []).forEach(function (a) { if (a.box && !a.hidden) items.push({ n: a.type, b: a.box, view: a.view }); });
      (sh.holeTables || []).forEach(function (t) { items.push({ n: t.punch ? 'Punch Table' : 'Hole Table', b: t.box }); });
      sh.dims.forEach(function (d, i) { sh.prims.forEach(function (p) { if (p.dimIx === i) { var b = primBox(p); if (b) items.push({ n: 'dim ' + d.text, b: b, view: d.view }); } }); });
      items.forEach(function (it, i) {
        tbs.forEach(function (t) { if (meet(it.b, t)) bad.push(it.n + ' in a block'); });
        sh.views.forEach(function (w) { if (w.view.id !== it.view && meet(it.b, w.box)) bad.push(it.n + ' across ' + w.view.name); });
        if (it.b.x0 < b1 || it.b.y0 < b1 || it.b.x1 > S[0] - b1 || it.b.y1 > S[1] - b1) bad.push(it.n + ' off the sheet');
        items.slice(i + 1).forEach(function (o) { if (!/^dim/.test(it.n) && !/^dim/.test(o.n) && meet(it.b, o.b)) bad.push(it.n + ' over ' + o.n); });
      });
      sh.views.forEach(function (w, i) { sh.views.slice(i + 1).forEach(function (o) { if (meet(w.box, o.box)) bad.push(w.view.name + ' over ' + o.view.name); }); });
      return bad.filter(function (x, i, a) { return a.indexOf(x) === i; });
    }
    function laser(r, label, layers) {
      var flat = K.flatPattern(r.model, r.build, r.mesh), out = {};
      ['R12', 'R2000'].forEach(function (v) {
        var t = K.exportDXFFlat(flat, 'in', { version: v }), c = DxfCheck.check(t, { units: 'in' });
        assert(c.ok, label + ' ' + v + ': ' + c.errors.slice(0, 3).join('; '));
        assert(Math.abs(c.extents.min[0]) < 1e-9 && Math.abs(c.extents.min[1]) < 1e-9, label + ' ' + v + ': at 0,0');
        out[v] = c;
      });
      Object.keys(layers).forEach(function (k) { assert((out.R2000.counts[k] || 0) === layers[k], label + ': ' + k + ' ' + (out.R2000.counts[k] || 0) + ', expected ' + layers[k] + ' ' + JSON.stringify(out.R2000.counts)); });
      return flat;
    }
    // Standard 3 View with model items, a flat view (fit, as the app adds it) with a Bend Table, then `extra`
    function drawing(r, extra) {
      var doc = DW.newDrawing(r.model, { projection: 'third' });
      DW.standard3View(doc, r.mesh, 'in');
      doc.autoDims = true;
      var fv = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, bendNotes: 'table', fit: true });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var w = sh.views.filter(function (x) { return x.view.id === fv.id; })[0];
      if (extra) { extra(doc, fv, w); sh = DW.compute(doc, r.mesh, r.model, { build: r.build }); }
      var bad = clashes(sh);
      assert(!bad.length, bad.join('; '));
      var dxf = DW.toDXF(sh, { version: 'R2000', hatch: true }), c = DxfCheck.check(dxf, { units: 'in', layers: [] });
      assert(c.ok, 'drawing DXF: ' + c.errors.slice(0, 3).join('; '));
      var pdf = DW.toPDF(sh);
      assert(/^%PDF-1\.4/.test(pdf) && (pdf.match(/\/Type\s*\/Page\b/g) || []).length === 1, 'one PDF page');
      return { doc: doc, sheet: sh, flat: w, dxf: dxf };
    }
    test('rfJQ: job a, 16 ga CRS L-bracket 4 x 3 + 2 (Material Inside, Outer Virtual Sharp): blank 4 x (5 − BD .1040), laser DXF 2 holes + a slot, drawing with Bend Table (BD .104) and Hole Table (2 x Ø.281) clear of the blocks', function () {
      var r = build(JOB_A); noErrors(r);
      var flat = laser(r, 'L-bracket', { 'CIRCLE@HOLES': 2, 'LWPOLYLINE@HOLES': 1, 'LWPOLYLINE@OUTLINE': 1, 'LINE@BEND': 1 });
      var BD = bd(0.06, T16, 0.44);
      near(flat.size[0], 4, 1e-9, 'width'); near(flat.size[1], 5 - BD, 1e-9, 'length 3 + 2 − BD');
      var d = drawing(r, function (doc, fv, w) { DW.addHoleTable(doc, fv.id, { all: true, origin: { p: [w.flat.bbox.umin, w.flat.bbox.vmin] } }, w); });
      var bt = d.sheet.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(bt && bt.info.rows.length === 1 && bt.info.rows[0][4] === '.104', 'Bend Table row ' + JSON.stringify(bt && bt.info.rows));
      var ht = d.sheet.holeTables[0];
      assert(ht && ht.rows.length === 2 && ht.rows.every(function (x) { return /^Ø\.281/.test(x.size); }), 'Hole Table ' + JSON.stringify(ht && ht.rows.map(function (x) { return x.size; })));
      var tb = DW.titleBlock(d.doc, r.model, { build: r.build });
      assert(tb.title === 'L-BRACKET' && tb.thickness === '.0598' && tb.material === 'Plain Carbon Steel', 'title block ' + JSON.stringify(tb));
      return 'blank 4 x ' + flat.size[1].toFixed(4);
    });
    test('rfJQ: job b, 14 ga open box 10 x 6 x 2, hem .375 and two circular Corner Reliefs: blank (10 + 2 (2 − BD)) wide, one outline with the two reliefs in the DXF, four bend lines; drawing clear of the blocks', function () {
      var r = build(JOB_B); noErrors(r);
      var flat = laser(r, 'box', { 'LWPOLYLINE@OUTLINE': 1, 'LINE@BEND': 5 });
      var BD = bd(0.075, T14, 0.44);
      near(flat.size[0], 10 + 2 * (2 - BD), 1e-9, 'width');
      // (rfJU) the box's corners are mitred (gap .01), so each relief opens the corner notch of the one blank outline
      var plain = build(JOB_B.replace(/p\.cornerRelief\([^\n]*\n/, '')), pf = K.flatPattern(plain.model, plain.build, plain.mesh);
      function area(f) { return f.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
      assert(flat.loops.length === 1 && area(pf) - area(flat) > 1e-3, 'the reliefs cut the blank: ' + flat.loops.length + ' loops, ' + (area(pf) - area(flat)).toFixed(5) + ' in² less');
      var d = drawing(r);
      var bt = d.sheet.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(bt && bt.info.rows.length === 5, 'five bends (4 + the hem): ' + JSON.stringify(bt && bt.info.rows));
      return 'blank ' + flat.size.map(function (x) { return x.toFixed(4); }).join(' x ');
    });
    test('rfJQ: job c, 18 ga 12 x 8 panel with four louvers: blank 12 x 8, four slits on HOLES and four outlines on FORM, Punch Table A1..A4 at X 3 / 5 / 7 / 9, Y 4 from the lower-left corner, clear of the blocks', function () {
      var r = build(JOB_C); noErrors(r);
      var flat = laser(r, 'panel', { 'LWPOLYLINE@OUTLINE': 1, 'LWPOLYLINE@HOLES': 4, 'LWPOLYLINE@FORM': 4 });
      near(flat.size[0], 12, 1e-9, 'width'); near(flat.size[1], 8, 1e-9, 'height');
      var d = drawing(r, function (doc, fv, w) { DW.addHoleTable(doc, fv.id, { punch: true, origin: { p: [w.flat.bbox.umin, w.flat.bbox.vmin] } }, w); });
      var pt = d.sheet.holeTables[0];
      assert(pt && pt.punch && pt.rows.map(function (x) { return x.tag + ' ' + x.xText + ' ' + x.yText; }).join(', ') === 'A1 3.000 4.000, A2 5.000 4.000, A3 7.000 4.000, A4 9.000 4.000', 'Punch Table ' + JSON.stringify(pt && pt.rows.map(function (x) { return [x.tag, x.xText, x.yText, x.size]; })));
      assert(d.dxf.indexOf('PUNCH ID') >= 0, 'in the DXF');
    });
  })();
