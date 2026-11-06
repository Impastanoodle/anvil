  // --- rfJR (2026-11-06, lane drawfix2): a Bend Table / Hole Table placed on free paper keeps clear of the dimensions
  // the sheet places (render's dry run of the dimension placement before the tables) ---
  (function () {
    group('rfJR: Bend Table and Hole Table free-paper search keep clear of placed dimensions');
    var DW = Drawing, Ti = 0.0598;
    var BOX = 'p.name("Box").units("in");\np.sheet(' + Ti + ', 0.06, 0.44);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(1.5, [[3, ' + Ti + ', 0], [3, ' + Ti + ', 4], [0, ' + Ti + ', 2], [6, ' + Ti + ', 2]], { position: "inside", relief: "rect" });\n' +
      'p.hem(0.375, [[3, 1.6196, 0]], { gap: 0.0299 });\n';
    var CHANNEL = 'p.name("U-Channel").units("in");\np.sheet(' + Ti + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 8, 3).end().baseFlange();\n' +
      'p.flange(1.5, [[4, ' + Ti + ', 0], [4, ' + Ti + ', 3]], { position: "inside" });\n';
    var HOLES = 'p.sketch("Top", ' + Ti + ').circle(1, -1.5, 0.1405).circle(7, -1.5, 0.1405).circle(4, -1.5, 0.25).circle(2.5, -1.5, 0.1405).circle(5.5, -1.5, 0.1405).cut("through", { reverse: true });\n';
    function rfJRmeet(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
    function rfJRprimBox(p) {
      if (p.k === 'text') return DW.textRect(p);
      if (p.k === 'line') return { x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), y0: Math.min(p.a[1], p.b[1]), y1: Math.max(p.a[1], p.b[1]) };
      if (p.k === 'fill') { var xs = p.pts.map(function (q) { return q[0]; }), ys = p.pts.map(function (q) { return q[1]; }); return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) }; }
      return null;
    }
    // the dimensions with a piece (line, arrow, text) on box B: ['text (view)']
    function rfJRdimsOn(sh, B) {
      var bad = [];
      sh.prims.forEach(function (p) {
        if (p.dimIx == null) return;
        var b = rfJRprimBox(p);
        if (b && rfJRmeet(b, B) && (p.k !== 'line' || DW._.segHitsRect(p.a, p.b, B))) { var d = sh.dims[p.dimIx]; bad.push(d.text + ' (view ' + d.view + ')'); }
      });
      return bad.filter(function (x, i, a) { return a.indexOf(x) === i; });
    }
    // Standard 3 View with model items on ANSI B, and a flat view at (x, y) / scale with its Bend Table, or (holes) a
    // Hole Table on the flat with no place given
    function rfJRsheet(r, x, y, sc, holes) {
      var doc = DW.newDrawing(r.model, { projection: 'third', format: 'ANSI B' });
      DW.standard3View(doc, r.mesh, 'in');
      doc.autoDims = true;
      var fv = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: x, y: y, scale: sc, bendNotes: holes ? 'notes' : 'table' });
      if (holes) { var fd = DW.flatData(r.mesh, r.model, r.build); DW.addHoleTable(doc, fv.id, { origin: [fd.bbox.umin, fd.bbox.vmin], all: true }); }
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      return { doc: doc, fv: fv, sheet: sh, flat: sh.views.filter(function (w) { return w.view.id === fv.id; })[0] };
    }
    test('rfJR: the box\'s flat at 1 : 4 left of its Front view on ANSI B (the sheet where the Front view\'s 6.000 sat on the Bend Table): the table keeps clear of every dimension, inside the border, off every view', function () {
      var r = build(BOX); noErrors(r);
      var s = rfJRsheet(r, 17 / 12, 11 * 3 / 8, [1, 4]), sh = s.sheet;
      var bt = sh.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(bt && bt.box, 'a Bend Table');
      var F = sh.views.filter(function (w) { return w.view.orient === 'Front'; })[0];
      assert(sh.dims.some(function (d) { return d.view === F.view.id && d.text === '6.000'; }), 'the Front view\'s 6.000 is there');
      var on = rfJRdimsOn(sh, bt.box);
      assert(!on.length, 'dimensions on the table: ' + on.join(', '));
      var b1 = 10 / 25.4;
      assert(bt.box.x0 >= b1 && bt.box.y0 >= b1 && bt.box.x1 <= 17 - b1 && bt.box.y1 <= 11 - b1, 'inside the border ' + JSON.stringify(bt.box));
      sh.views.forEach(function (w) { assert(!rfJRmeet(w.box, bt.box), 'on ' + w.view.name); });
      return (bt.info && bt.info.noRoom ? 'least-cover spot' : 'free paper') + ' at ' + bt.box.x0.toFixed(2) + ', ' + bt.box.y1.toFixed(2);
    });
    test('rfJR: the box and the U channel, their flats at 1 : 4, 1 : 2 and 1 : 1 all over an ANSI B Standard 3 View sheet (where the flat misses the views): no Bend Table under a dimension', function () {
      var out = [], n = 0;
      [['box', BOX], ['channel', CHANNEL]].forEach(function (pc) {
        var r = build(pc[1]); noErrors(r);
        for (var xi = 1; xi < 12; xi++) for (var yi = 1; yi < 8; yi++) [[1, 4], [1, 2], [1, 1]].forEach(function (sc) {
          var s = rfJRsheet(r, 17 * xi / 12, 11 * yi / 8, sc), sh = s.sheet;
          if (sh.views.some(function (w) { return w !== s.flat && rfJRmeet(w.box, s.flat.box); })) return;
          n++;
          var bt = sh.annotations.filter(function (a) { return a.type === 'bendTable'; })[0], on = rfJRdimsOn(sh, bt.box);
          if (on.length) out.push(pc[0] + ' flat at ' + xi + '/12, ' + yi + '/8, 1 : ' + sc[1] + ': ' + on.join(', '));
        });
      });
      assert(n >= 40, 'sheets ' + n);
      assert(!out.length, out.length + ' tables under dimensions: ' + out.slice(0, 4).join(' | '));
      return n + ' sheets';
    });
    test('rfJR: Hole Table with no place given on the channel\'s flat, the flat all over an ANSI B Standard 3 View sheet: the table keeps clear of every dimension', function () {
      var r = build(CHANNEL + HOLES); noErrors(r);
      var out = [], n = 0;
      for (var xi = 1; xi < 12; xi++) for (var yi = 1; yi < 8; yi++) [[1, 4], [1, 2]].forEach(function (sc) {
        var s = rfJRsheet(r, 17 * xi / 12, 11 * yi / 8, sc, true), sh = s.sheet;
        if (sh.views.some(function (w) { return w !== s.flat && rfJRmeet(w.box, s.flat.box); })) return;
        var ht = sh.holeTables[0];
        if (!ht || !ht.box) return;
        n++;
        var on = rfJRdimsOn(sh, ht.box);
        if (on.length) out.push('flat at ' + xi + '/12, ' + yi + '/8, 1 : ' + sc[1] + ': ' + on.join(', '));
      });
      assert(n > 30, 'sheets ' + n);
      assert(!out.length, out.length + ' tables under dimensions: ' + out.slice(0, 4).join(' | '));
      return n + ' sheets';
    });
    test('rfJR: the dry run leaves the dimensions as they were — a sheet with a Bend Table computed twice places the same dimensions, and a dimension turned to its other side by the real pass keeps that side only on the sheet', function () {
      var r = build(BOX); noErrors(r);
      var s = rfJRsheet(r, 17 / 12, 11 * 3 / 8, [1, 4]);
      var a = s.sheet.dims.map(function (d) { return d.text + '@' + d.box.x0.toFixed(4) + ',' + d.box.y0.toFixed(4); }).join(' ');
      var sh2 = DW.compute(s.doc, r.mesh, r.model, { build: r.build });
      var b = sh2.dims.map(function (d) { return d.text + '@' + d.box.x0.toFixed(4) + ',' + d.box.y0.toFixed(4); }).join(' ');
      assert(a === b, 'second compute differs:\n' + a + '\n' + b);
      return s.sheet.dims.length + ' dimensions';
    });
    // --- sheet zones (ASME Y14.1) and the Revision Table's ZONE from the revision symbols
    function rfJRzoneTexts(sh) { return sh.prims.filter(function (p) { return p.fmt === 'zones' && p.k === 'text'; }); }
    test('rfJR: sheet zones — ANSI A 2 x 2, B 4 x 2, C 4 x 4, D 8 x 4, numbered right to left from the lower right and lettered bottom to top in the margin on all four sides; none on A3 unless asked (then about 50 mm fields), none with zones off', function () {
      var r = build('p.units("in");\np.box(4, 0.25, 2);\n'); noErrors(r);
      var want = { 'ANSI A': [2, 2], 'ANSI B': [4, 2], 'ANSI C': [4, 4], 'ANSI D': [8, 4] }, out = [];
      Object.keys(want).forEach(function (f) {
        var doc = DW.newDrawing(r.model, { format: f });
        var sh = DW.compute(doc, r.mesh, r.model, {}), z = sh.zones, S = sh.size, b1 = 10 / 25.4;
        assert(z && z.cols === want[f][0] && z.rows === want[f][1], f + ' zones ' + JSON.stringify(z));
        var tx = rfJRzoneTexts(sh);
        assert(tx.length === 2 * (z.cols + z.rows), f + ' labels ' + tx.length);
        tx.forEach(function (t) { assert(t.layer === 'SHEET' && (t.p[0] < b1 || t.p[0] > S[0] - b1 || t.p[1] < b1 || t.p[1] > S[1] - b1), f + ' label ' + t.text + ' in the margin'); });
        var bottom = tx.filter(function (t) { return t.p[1] < b1; }).sort(function (a, b) { return a.p[0] - b.p[0]; }).map(function (t) { return t.text; });
        var left = tx.filter(function (t) { return t.p[0] < b1; }).sort(function (a, b) { return a.p[1] - b.p[1]; }).map(function (t) { return t.text; });
        assert(bottom.join('') === '87654321'.slice(8 - z.cols), f + ' numbers ' + bottom.join(' '));
        assert(left.join('') === 'ABCD'.slice(0, z.rows), f + ' letters ' + left.join(' '));
        var ticks = sh.prims.filter(function (p) { return p.fmt === 'zones' && p.k === 'line'; });
        assert(ticks.length === 2 * (z.cols - 1 + z.rows - 1), f + ' ticks ' + ticks.length);
        assert(DW.zoneAt(doc, [S[0] - 1, 1], 'in') === 'A1' && DW.zoneAt(doc, [1, S[1] - 1], 'in') === String.fromCharCode(64 + z.rows) + z.cols, f + ' corners ' + DW.zoneAt(doc, [1, S[1] - 1], 'in'));
        out.push(f.slice(5) + ' ' + z.cols + 'x' + z.rows);
      });
      var a3 = DW.newDrawing(r.model, { format: 'A3' });
      assert(!DW.compute(a3, r.mesh, r.model, {}).zones, 'A3 has none by default');
      a3.sheet.zones = true;
      var z3 = DW.compute(a3, r.mesh, r.model, {}).zones;
      assert(z3 && z3.cols === 8 && z3.rows === 6, 'A3 asked: ' + JSON.stringify(z3 && [z3.cols, z3.rows]));
      var off = DW.newDrawing(r.model, { format: 'ANSI B' });
      off.sheet.zones = false;
      var sOff = DW.compute(off, r.mesh, r.model, {});
      assert(!sOff.zones && !rfJRzoneTexts(sOff).length, 'zones off');
      DW.addSheet(off, {});
      assert(off.sheet.zones === false && !DW.compute(off, r.mesh, r.model, {}).zones, 'Sheet2 of the same format keeps zones off');
      DW.addSheet(off, { format: 'ANSI D' });
      assert(DW.compute(off, r.mesh, r.model, {}).zones.cols === 8, 'a D sheet added: its own zones');
      // Edit Sheet Format: the zones are one item of the format; deleting it hides them, Reset brings them back
      var del = DW.newDrawing(r.model, { format: 'ANSI B' });
      DW.deleteFormatItem(del, 'zones');
      assert(!rfJRzoneTexts(DW.compute(del, r.mesh, r.model, {})).length, 'deleted with Edit Sheet Format');
      DW.resetFormat(del);
      assert(rfJRzoneTexts(DW.compute(del, r.mesh, r.model, {})).length === 12, 'reset');
      // the outputs: SVG and DXF carry the labels
      var shB = DW.compute(DW.newDrawing(r.model, { format: 'ANSI B' }), r.mesh, r.model, {});
      var dxf = DW.toDXF(shB);
      var ln = dxf.split(/\r?\n/), ents = [], cur = null;
      for (var li = 0; li + 1 < ln.length; li += 2) {
        var code = ln[li].trim(), val = ln[li + 1];
        if (code === '0') { cur = { type: val }; ents.push(cur); } else if (cur && (code === '8' || code === '1')) cur[code] = val;
      }
      assert(ents.some(function (e) { return e.type === 'TEXT' && e['8'] === 'SHEET' && e['1'] === '4'; }), 'DXF has the zone number 4 on SHEET');
      assert(DW.toSVG(shB).indexOf('>4<') > 0, 'SVG has it');
      return out.join(', ');
    });
    test('rfJR: the Revision Table\'s ZONE fills from its Revision Symbols (B3 on ANSI B), follows a moved symbol, lists two zones, and a typed ZONE wins; no zones, no fill', function () {
      var r = build('p.units("in");\np.box(4, 0.25, 2);\n'); noErrors(r);
      var doc = DW.newDrawing(r.model, { format: 'ANSI B' });
      DW.addRevision(doc, { description: 'HOLE MOVED', date: '2026-11-06', approved: 'LT' });
      // zone B3: columns 4.25 in wide from the right border, rows 5.5 in from the bottom one
      var b1 = 10 / 25.4, zx = 17 - b1 - 2.5 * (17 - 2 * b1) / 4, zy = b1 + 1.5 * (11 - 2 * b1) / 2;
      var sy = DW.addSymbol(doc, { type: 'revision', p: [zx, zy] });
      assert(sy.rev === 'A', 'names A');
      function zoneCell(sh) {
        var rb = sh.revisions.box, row = rb.y1 - 2.5 * rb.rowH;
        var t = sh.prims.filter(function (p) { return p.layer === 'REVISIONS' && p.k === 'text' && p.p[0] < rb.cols[1] && Math.abs(p.p[1] - row) < rb.rowH / 2; });
        return t.map(function (p) { return p.text; }).join('|');
      }
      var sh = DW.compute(doc, r.mesh, r.model, {});
      assert(zoneCell(sh) === 'B3' && sh.revisions.rows[0].zoneAuto === 'B3', 'zone ' + zoneCell(sh));
      DW.editSymbol(doc, sy.id, { p: [17 - b1 - 0.5, b1 + 0.5] });
      sh = DW.compute(doc, r.mesh, r.model, {});
      assert(zoneCell(sh) === 'A1', 'moved: ' + zoneCell(sh));
      DW.addSymbol(doc, { type: 'revision', p: [b1 + 1, 11 - b1 - 1] });
      sh = DW.compute(doc, r.mesh, r.model, {});
      assert(zoneCell(sh) === 'A1, B4', 'two symbols: ' + zoneCell(sh));
      DW.editRevision(doc, 0, { zone: 'C2' });
      sh = DW.compute(doc, r.mesh, r.model, {});
      assert(zoneCell(sh) === 'C2' && !sh.revisions.rows[0].zoneAuto, 'typed: ' + zoneCell(sh));
      DW.editRevision(doc, 0, { zone: '' });
      doc.sheet.zones = false;
      sh = DW.compute(doc, r.mesh, r.model, {});
      assert(zoneCell(sh) === '', 'no zones: ' + zoneCell(sh));
      return 'B3, A1, A1, B4, typed C2';
    });
  })();
