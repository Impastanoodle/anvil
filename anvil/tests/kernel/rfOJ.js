  // --- rfOJ (2026-11-18, lane drawflow5): shop drawings from the part to the paper. A press-brake print (model items
  // kept on the paper and off the next view's values, the FLAT SIZE note off the title block), a laser print (a
  // Hole Table split in columns and its warning, Scale output 1:1 for DXF / DWG), an assembly print (BOM sorted by a
  // column, its item numbers and balloons following), BOM cells typed on another sheet's BOM re-keyed, a detail of a
  // flat by a sketched profile ---
  (function () {
    group('rfOJ: shop drawings driven from the part to the paper (press-brake, laser, assembly prints)');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, T = 0.0747;
    // a 14 ga bracket with five bends: UP 90 (x = 6), DOWN 90 (x = 0), UP 45 (z = 0), UP 90 (z = 3) and a hem on it
    var RFOJ_BRKT = 'p.name("PB-BRKT").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').circle(1.5, -1.5, 0.1405).circle(4.5, -1.5, 0.1405).circle(3, -1.5, 0.25).cut("through", { reverse: true });\n' +
      'p.flange(1.5, [[6, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(1, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n' +
      'p.flange(1, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer", angle: 45 });\n' +
      'p.flange(1.25, [[3, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });\n' +
      'p.hem(0.375, [[3, 1.25, ' + (3 - T / 2) + ']], { gap: 0.0299 });\n';
    // a 20 x 12 laser blank, 11 ga: 40 holes of four sizes (10 each) and six .25 x .75 slots
    function rfOJPlate() {
      var c = 'p.name("LASER-PLT").units("in");\np.sheet(0.1196, 0.06, 0.44);\np.sketch("Top").rect(0, -12, 20, 12).end().baseFlange();\nvar s = p.sketch("Top", 0.1196);\n', sz = [0.1405, 0.1695, 0.2015, 0.2655];
      for (var i = 0; i < 4; i++) for (var j = 0; j < 10; j++) c += 's.circle(' + (1 + j * 1.5) + ', ' + (-1 - i * 1.25) + ', ' + (sz[i] / 2) + ');\n';
      for (var q = 0; q < 6; q++) c += 's.slot(' + (3 + (q % 3)) + ', ' + (-8 - Math.floor(q / 3)) + ', ' + (3 + (q % 3)) + ', ' + (-8.5 - Math.floor(q / 3)) + ', 0.25);\n';
      return c + 's.cut("through", { reverse: true });\n';
    }
    function rfOJMeet(a, b) { return a.x0 < b.x1 - 1e-3 && b.x0 < a.x1 - 1e-3 && a.y0 < b.y1 - 1e-3 && b.y0 < a.y1 - 1e-3; }
    function rfOJClash(sh) {
      var b = 10 / 25.4, S = sh.size, T2 = sh.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null; }).map(function (p) { return { t: p.text, d: p.dimIx, v: p.view, r: DW.textRect(p) }; });
      var over = [], out = [];
      T2.forEach(function (x, i) {
        if (x.r.x0 < b || x.r.y0 < b || x.r.x1 > S[0] - b || x.r.y1 > S[1] - b) out.push(x.v + ':' + x.t);
        for (var j = i + 1; j < T2.length; j++) if (T2[j].d !== x.d && rfOJMeet(x.r, T2[j].r)) over.push(x.v + ':' + x.t + ' x ' + T2[j].v + ':' + T2[j].t);
      });
      sh.prims.forEach(function (p) { if (p.k === 'line' && p.dimIx != null && [p.a, p.b].some(function (q) { return q[0] < b - 1e-6 || q[1] < b - 1e-6 || q[0] > S[0] - b + 1e-6 || q[1] > S[1] - b + 1e-6; })) out.push(p.view + ':line ' + p.dimIx); });
      return { over: over, out: out };
    }
    test('rfOJ: press-brake print: Model Items on the 14 ga bracket (ANSI B 1 : 1): no value on another (the Front view\'s 1.500 sat on the Right view\'s 1.340) and nothing past the border (the third row of hole locations over the Top view did)', function () {
      var r = build(RFOJ_BRKT); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-18' });
      DW.standard3View(doc, r.mesh, 'in');
      // Insert Model Items, Entire model, all views (what anvil.drawing.modelItems({}) stores)
      doc.modelItems = { source: 'entire', marked: true, holeLocations: true, holeCallouts: true, annotations: true, dedupe: true }; doc.autoDims = true;
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), c = rfOJClash(sh), n = sh.dims.length;
      assert(n >= 10, 'model items: ' + n);
      assert(!c.over.length, 'values on each other: ' + c.over.join(' | '));
      assert(!c.out.length, 'past the border: ' + c.out.join(' | '));
      return n + ' model items, none overlapping, all inside the border';
    });
    test('rfOJ: the bracket\'s flat at 1 : 1 with overall dimensions, FLAT SIZE and a Bend Table: the FLAT SIZE note keeps off the title block and the blocks beside it (it was printed across COMPANY), over the view instead', function () {
      var r = build(RFOJ_BRKT); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-18' });
      doc.options = { flatDims: true };
      var v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 8.5, y: 5.5, scale: [1, 1] });
      v.flatSize = true; v.bendNotes = 'table';
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var fs = sh.prims.filter(function (p) { return p.k === 'text' && /^FLAT SIZE/.test(p.text); })[0];
      assert(fs, 'a FLAT SIZE note');
      var fr = DW.textRect(fs), blocks = DW.tbRects(sh.size, 'in');
      blocks.forEach(function (b, i) { assert(!rfOJMeet(fr, b), 'on title block rect ' + i + ': ' + JSON.stringify(fr)); });
      var w = sh.views.filter(function (x) { return x.view.id === v.id; })[0];
      assert(fr.y0 > w.box.y1 - 1e-9, 'over the view: ' + fr.y0.toFixed(3) + ' vs ' + w.box.y1.toFixed(3));
      assert(/^FLAT SIZE 8\.253 × 5\.449$/.test(fs.text), fs.text);
      return fs.text;
    });
    test('rfOJ: laser print: the 40-hole Hole Table with nowhere clear says so; Split at row 20 puts rows 21-40 in a second column of the same width beside the first, each with its header; Split [] joins it', function () {
      var r = build(rfOJPlate()); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-18' });
      DW.standard3View(doc, r.mesh, 'in');
      doc.autoDims = true;
      var top = doc.views.filter(function (x) { return x.orient === 'Top'; })[0];
      var t = DW.addHoleTable(doc, top.id, { origin: { x: { a: [0, -12], b: [20, -12] }, y: { a: [0, -12], b: [0, 0] } }, all: true });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), ht = sh.holeTables[0];
      assert(ht.rows.length === 40 && ht.pieces.length === 1, 'one piece of 40 rows: ' + ht.rows.length);
      assert(ht.noRoom && sh.warnings.some(function (x) { return /Hole Table of .*no clear paper for its 40 rows/.test(x); }), 'warned: ' + JSON.stringify(sh.warnings));
      DW.editHoleTable(doc, t.id, { split: [20] });
      var sh2 = DW.compute(doc, r.mesh, r.model, { build: r.build }), h2 = sh2.holeTables[0], P = h2.pieces;
      assert(P.length === 2 && P[0].i0 === 0 && P[0].i1 === 20 && P[1].i0 === 20 && P[1].i1 === 40, 'pieces: ' + JSON.stringify(P.map(function (p) { return [p.i0, p.i1]; })));
      near(P[1].box.x1 - P[1].box.x0, P[0].box.x1 - P[0].box.x0, 1e-9, 'same width');
      near(P[1].box.y1, P[0].box.y1, 1e-9, 'tops level');
      near(P[1].box.x0 - P[0].box.x1, 4 / 25.4, 1e-9, '4 mm apart');
      var heads = sh2.prims.filter(function (p) { return p.k === 'text' && p.holeTable === t.id && p.text === 'TAG'; });
      assert(heads.length === 2, 'two headers: ' + heads.length);
      var tagC21 = sh2.prims.filter(function (p) { return p.k === 'text' && p.holeTable === t.id && p.layer === 'TABLES' && p.text === h2.rows[20].tag; })[0];
      assert(tagC21 && tagC21.p[0] > P[1].box.x0 && tagC21.p[1] < P[1].rowY[1], 'row 21 (' + h2.rows[20].tag + ') heads the second piece');
      near(P[0].box.y1 - P[0].box.y0, (20 + 1) * 6 / 25.4, 1e-9, 'piece 1: header + 20 rows');
      DW.editHoleTable(doc, t.id, { split: [] });
      assert(!DW.findHoleTable(doc, t.id).split, 'joined');
      assert(DW.compute(doc, r.mesh, r.model, { build: r.build }).holeTables[0].pieces.length === 1, 'one piece again');
      return 'split 20 / 20, joined';
    });
    test('rfOJ: Scale output 1:1: the laser blank\'s drawing at 1 : 4 written with scale11 is four times the paper: the Top view\'s 20 in edge is 20 in in the DXF, $EXTMAX 68 x 44, the DIMENSION still says 20; without it 5 in', function () {
      var r = build(rfOJPlate()); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-18' });
      DW.standard3View(doc, r.mesh, 'in');
      doc.autoDims = true;
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      assert(DW.scaleText(doc.sheet.scale) === '1:4', 'sheet 1:4: ' + DW.scaleText(doc.sheet.scale));
      function longest(t, layer) {
        var L = t.split(/\r?\n/), best = 0;
        for (var i = 0; i < L.length - 1; i++) if (L[i].trim() === '0' && L[i + 1].trim() === 'LINE') {
          var g = {}; for (var j = i + 2; j + 1 < L.length && L[j].trim() !== '0'; j += 2) g[L[j].trim()] = L[j + 1].trim();
          if (g['8'] === layer) best = Math.max(best, Math.hypot(+g['11'] - +g['10'], +g['21'] - +g['20']));
        }
        return best;
      }
      function ext(t) { var m = /\$EXTMAX\r?\n\s*10\r?\n([^\r\n]+)\r?\n\s*20\r?\n([^\r\n]+)/.exec(t); return m ? [+m[1], +m[2]] : null; }
      var a = DW.toDXF(sh, { version: 'R2000' }), b = DW.toDXF(sh, { version: 'R2000', scale11: true });
      near(longest(a, 'TOP'), 5, 1e-6, 'paper: 5 in');
      near(longest(b, 'TOP'), 20, 1e-6, '1:1: 20 in');
      var ea = ext(a), eb = ext(b);
      near(eb[0], ea[0] * 4, 1e-6, 'EXTMAX x'); near(eb[1], ea[1] * 4, 1e-6, 'EXTMAX y');
      assert(/\n\s*42\r?\n20(\.0+)?\r?\n/.test(b), 'a DIMENSION measuring 20');
      var r12 = DW.toDXF(sh, { version: 'R12', scale11: true });
      near(longest(r12, 'TOP'), 20, 1e-6, 'R12 too');
      return '5 in -> 20 in';
    });
    test('rfOJ: BOM Sort by PART NUMBER: A-Z puts ANGLE before BASE before GUSSET and numbers them 1 2 3 (balloons follow), Z-A reverses, keepItems keeps the assembly numbers, a typed ITEM NO. stays; null is the assembly order', function () {
      if (typeof Assembly === 'undefined') return 'no assembly.js';
      var AS = Assembly, m = AS.newAssembly('WELD-ASM');
      AS.insert(m, { script: 'p.name("BASE-300"); p.box(200, 100, 2);' }, { fixed: true });
      AS.insert(m, { script: 'p.name("GUSSET-200"); p.box(50, 50, 2);' }, { position: [20, 2, 20] });
      AS.insert(m, { script: 'p.name("ANGLE-100"); p.box(100, 25, 2);' }, { position: [50, 2, 50] });
      AS.insert(m, { script: 'p.name("ANGLE-100"); p.box(100, 25, 2);' }, { position: [50, 2, 80] });
      var b = AS.rebuild(m), mesh = K.meshFromBody(b.body), doc = DW.newDrawing(m, { date: '2026-11-18' });
      DW.standard3View(doc, mesh, 'mm');
      doc.bom = { show: true };
      DW.autoBalloon(doc, m, doc.views[0].id);
      function rows() { return DW.bomRows(m, mesh, doc.bom, { build: b }).map(function (r) { return r.item + ' ' + r.partNumber; }).join(', '); }
      function balloonOf(pn) { var sh = DW.compute(doc, mesh, m, { build: b }), row = sh.bom.rows.filter(function (r) { return r.partNumber === pn; })[0]; return sh.balloons.filter(function (x) { return x.key === row.key; }).map(function (x) { return String(x.item); })[0]; }
      assert(rows() === '1 BASE-300, 2 GUSSET-200, 3 ANGLE-100', 'assembly order: ' + rows());
      doc.bom.sort = { col: 'partNumber', dir: 'asc' };
      assert(rows() === '1 ANGLE-100, 2 BASE-300, 3 GUSSET-200', 'A-Z: ' + rows());
      var bA = balloonOf('ANGLE-100');
      assert(bA === '1', 'the ANGLE balloon reads 1: ' + bA);
      doc.bom.sort = { col: 'partNumber', dir: 'desc' };
      assert(rows() === '1 GUSSET-200, 2 BASE-300, 3 ANGLE-100', 'Z-A: ' + rows());
      doc.bom.sort = { col: 'qty', dir: 'desc' };
      assert(/^1 ANGLE-100/.test(rows()), 'by QTY. (2 first): ' + rows());
      doc.bom.sort = { col: 'partNumber', dir: 'asc', keepItems: true };
      assert(rows() === '3 ANGLE-100, 1 BASE-300, 2 GUSSET-200', 'keep item numbers: ' + rows());
      delete doc.bom.sort.keepItems;
      var r0 = DW.bomRows(m, mesh, doc.bom, { build: b })[2];
      DW.setBomCell(doc, m, r0.key, 'item', '7', { mesh: mesh, build: b });
      assert(rows() === '1 ANGLE-100, 2 BASE-300, 7 GUSSET-200', 'a typed ITEM NO. kept: ' + rows());
      doc.bom.sort = null;
      assert(rows() === '1 BASE-300, 7 GUSSET-200, 3 ANGLE-100', 'assembly order again: ' + rows());
      return 'sorted, renumbered, balloons follow';
    });
    test('rfOJ: a QTY. typed into the BOM on Sheet2 follows its row when a DESCRIPTION typed on Sheet1 changes the embedded part\'s key (it fell off before)', function () {
      if (typeof Assembly === 'undefined' || typeof Materials === 'undefined' || typeof K.newModel !== 'function') return 'no assembly.js';
      var AS = Assembly, m = AS.newAssembly('Two'), pm = K.newModel();
      K.runScript(pm, 'p.name("Bracket"); p.box(10, 10, 2);');
      pm = JSON.parse(JSON.stringify(pm));
      AS.insert(m, { model: pm }, { fixed: true });
      AS.insert(m, { example: 'Hex nut' }, { position: [40, 0, 0] });
      var b = AS.rebuild(m), mesh = K.meshFromBody(b.body), doc = DW.newDrawing(m, { date: '2026-11-18' });
      DW.standard3View(doc, mesh, 'mm');
      doc.bom = { show: true };
      DW.addSheet(doc, {});
      DW.addView(doc, 'Front', { x: 150, y: 150 });
      doc.bom = { show: true };
      var key0 = DW.bomRows(m, mesh, doc.bom, { build: b })[0].key;
      DW.setBomCell(doc, m, 1, 'qty', '5', { mesh: mesh, build: b });   // Sheet2 (active)
      assert(doc.bom.overrides[key0 + '|qty'] === '5', 'typed on Sheet2');
      DW.activateSheet(doc, 0);
      var res = DW.setBomCell(doc, m, 1, 'description', 'BRACKET, 10 GA', { mesh: mesh, build: b });
      assert(res.key !== key0, 'the embedded part\'s key changed');
      var s2 = doc.sheets[1];
      assert(s2 && s2.bom && s2.bom.overrides && s2.bom.overrides[res.key + '|qty'] === '5' && !s2.bom.overrides[key0 + '|qty'], 'Sheet2\'s QTY. follows: ' + JSON.stringify(s2 && s2.bom && s2.bom.overrides));
      DW.activateSheet(doc, 1);
      var row = DW.bomRows(m, mesh, doc.bom, { build: b }).filter(function (r) { return r.key === res.key; })[0];
      assert(row && String(row.qty) === '5' && row.description === 'BRACKET, 10 GA', 'Sheet2 shows QTY. 5: ' + JSON.stringify(row && { q: row.qty, d: row.description }));
      return 'QTY. 5 kept on Sheet2';
    });
    test('rfOJ: a Detail View of a flat by a sketched profile (a triangle round the DOWN bend\'s end): built (was refused), the bend line and the blank clipped to the triangle', function () {
      var r = build(RFOJ_BRKT); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-18' }), v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 6, y: 6, scale: [1, 1] });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views.filter(function (x) { return x.view.id === v.id; })[0];
      var db = w.flat.bends.filter(function (q) { return !q.up && q.angle === 90; })[0];
      var u = db.a[0], v0 = Math.min(db.a[1], db.b[1]), pts = [[u - 0.6, v0 - 0.4], [u + 0.6, v0 - 0.4], [u, v0 + 0.8]];
      var dv = DW.addDetailView(doc, r.mesh, v.id, { pts: pts, scale: [2, 1] });
      var sh2 = DW.compute(doc, r.mesh, r.model, { build: r.build }), dw = sh2.views.filter(function (x) { return x.view.id === dv.id; })[0];
      var bl = sh2.prims.filter(function (p) { return p.view === dv.id && p.layer === 'BEND_DOWN'; });
      assert(bl.length === 1, 'the DOWN bend line in the detail: ' + bl.length);
      // the bend line inside the triangle: it runs from the base (v0 - .4) up to where the triangle's sides meet x = u
      var len = Math.hypot(bl[0].a[0] - bl[0].b[0], bl[0].a[1] - bl[0].b[1]) / dw.scale;
      assert(len > 0.3 && len < 1.21, 'clipped to the triangle: ' + len.toFixed(4));
      var vis = sh2.prims.filter(function (p) { return p.layer === dw.layer && p.k === 'line' && p.style === 'visible'; });
      assert(vis.length > 0, 'blank edges in the detail');
      return 'bend line ' + len.toFixed(3) + ' in inside the profile';
    });
  })();
