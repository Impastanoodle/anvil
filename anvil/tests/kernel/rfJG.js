  // --- rfJG (2026-11-06, lane drawgaps, test-reports/2026-11-06-drawing-gaps.md): drawing gaps a sheet-metal shop
  // meets. Punch Table (Insert > Tables > Punch Table: the forming tools of a flat pattern view, tags A1, A2 … by punch
  // ID, X / Y LOC from a vertex of the blank) and the Bend Table's Fixed Face note at the view centre (SolidWorks 2024
  // adds it with the table, test-reports/2026-11-02-unchecked-items.md 3b) ---
  (function () {
    group('rfJG: Punch Table on a flat pattern view, the Bend Table\'s Fixed Face note');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, T = 0.0598;
    // 16 ga U channel 8 × 3, flanges 1.5 inside on both long edges; two dimples 4 apart and a louver between them on
    // the base, all on its centre line
    var CH = 'p.name("Vent channel").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 8, 3).end().baseFlange();\n' +
      'p.flange(1.5, [[4, ' + T + ', 0], [4, ' + T + ', 3]], { position: "inside" });\n' +
      'p.formingTool("dimple", [2, ' + T + ', 1.5]);\np.formingTool("dimple", [6, ' + T + ', 1.5]);\np.formingTool("louver", [4, ' + T + ', 1.5]);\n';
    var part = null;
    function rfJGPart() {
      if (!part) { part = build(CH); noErrors(part); }
      return part;
    }
    function rfJGSheet(viewOpts, std) {
      var r = rfJGPart(), doc = DW.newDrawing(r.model, { date: '2026-11-06' });
      if (std) DW.standard3View(doc, r.mesh, 'in');
      var v = DW.addFlatView(doc, r.mesh, Object.assign({ model: r.model, build: r.build, scale: '1:2', x: 6, y: 7 }, viewOpts || {}));
      var q = { doc: doc, view: v, r: r };
      q.compute = function () {
        q.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build });
        q.w = q.sheet.views.filter(function (x) { return x.view.id === v.id; })[0];
        return q;
      };
      return q.compute();
    }
    // the blank's lower-left corner (flat coordinates): a vertex of its outline
    function rfJGCorner(w) {
      var b = w.flat.bbox;
      return [b.umin, b.vmin];
    }

    test('rfJG: Punch Table lists every forming tool, tags by punch ID, X / Y LOC from the blank corner', function () {
      var q = rfJGSheet(), w = q.w, b = w.flat.bbox;
      var P = DW.viewPunches(w);
      assert(P.length === 3, 'three forming tools in the flat: ' + JSON.stringify(P));
      var t = DW.addHoleTable(q.doc, q.view.id, { punch: true, origin: { p: rfJGCorner(w) } }, w);
      assert(t.punch === true && t.all === true && !t.holes, 'record ' + JSON.stringify(t));
      q.compute();
      var ht = q.sheet.holeTables[0];
      assert(ht && ht.punch === true, 'sheet table ' + JSON.stringify(ht));
      assert(ht.rows.length === 3, '3 rows: ' + JSON.stringify(ht.rows));
      assert(ht.rows.map(function (x) { return x.tag; }).join(',') === 'A1,A2,B1', 'tags ' + ht.rows.map(function (x) { return x.tag; }));
      assert(/^DIMPLE /.test(ht.rows[0].size) && ht.rows[0].size === ht.rows[1].size && /^LOUVER /.test(ht.rows[2].size), 'punch ids ' + ht.rows.map(function (x) { return x.size; }));
      assert(/ UP$/.test(ht.rows[0].size), 'direction in the punch id: ' + ht.rows[0].size);
      // the dimples are 4 apart on the base centre line, the louver half way; the centre line is the blank's middle
      var A1 = ht.rows[0], A2 = ht.rows[1], B1 = ht.rows[2];
      near(Math.hypot(A2.x - A1.x, A2.y - A1.y), 4, 1e-6);
      near(Math.hypot(B1.x - A1.x, B1.y - A1.y), 2, 1e-6);
      near(Math.hypot(B1.x - A2.x, B1.y - A2.y), 2, 1e-6);
      var W = b.umax - b.umin, H = b.vmax - b.vmin, along8 = Math.abs(W - 8) < 1e-6;
      assert(along8 || Math.abs(H - 8) < 1e-6, 'the blank is 8 long one way: ' + W + ' x ' + H);
      [A1, A2, B1].forEach(function (row) { near(along8 ? row.y : row.x, (along8 ? H : W) / 2, 1e-6); });
      near(Math.min(A1.x, A2.x) + Math.min(A1.y, A2.y), along8 ? 2 + H / 2 : 2 + W / 2, 1e-6);
      assert(A1.xText === DW.numText(A1.x, 'in', null) && A1.yText === DW.numText(A1.y, 'in', null), 'LOC texts ' + A1.xText + ' ' + A1.yText);
      // the table's header says PUNCH ID, on TABLES; the tags sit by the punches on ANNOTATIONS
      var texts = q.sheet.prims.filter(function (p) { return p.k === 'text' && p.holeTable === t.id; });
      assert(texts.some(function (p) { return p.text === 'PUNCH ID' && p.layer === 'TABLES'; }), 'PUNCH ID header');
      assert(!texts.some(function (p) { return p.text === 'SIZE'; }), 'no SIZE header on a punch table');
      assert(texts.filter(function (p) { return p.holeTag && p.layer === 'ANNOTATIONS'; }).length === 3, 'three tags by the punches');
      assert(ht.text === 'Punch Table (3 punches)', ht.text);
      // the table goes to the DXF like a hole table
      var dxf = DW.toDXF(q.sheet);
      assert(dxf.indexOf('PUNCH ID') > 0 && dxf.indexOf(B1.size) > 0, 'DXF carries the table');
    });

    test('rfJG: Punch Table options and refusals: numeric tags, combine tags, not on a formed view, survives save', function () {
      var q = rfJGSheet(null, true), w = q.w;
      var t = DW.addHoleTable(q.doc, q.view.id, { punch: true, origin: { p: rfJGCorner(w) }, tagStyle: 'numeric' }, w);
      q.compute();
      assert(q.sheet.holeTables[0].rows.map(function (x) { return x.tag; }).join(',') === '1,2,3', 'numeric ' + q.sheet.holeTables[0].rows.map(function (x) { return x.tag; }));
      DW.editHoleTable(q.doc, t.id, { tagStyle: 'alpha', combineTags: true });
      q.compute();
      assert(q.sheet.holeTables[0].rows.map(function (x) { return x.tag; }).join(',') === 'A,A,B', 'combined ' + q.sheet.holeTables[0].rows.map(function (x) { return x.tag; }));
      assert(q.doc.holeTables[0].punch === true, 'edit keeps punch');
      var front = q.doc.views.filter(function (v) { return v.kind !== 'flat'; })[0];
      var threw = null;
      try { DW.addHoleTable(q.doc, front.id, { punch: true, origin: { p: [0, 0] } }); } catch (e) { threw = e.message; }
      assert(threw && /not a flat pattern view/.test(threw), 'refused on a model view: ' + threw);
      // a corner off the blank is refused as for a hole table
      threw = null;
      try { DW.addHoleTable(q.doc, q.view.id, { punch: true, origin: { p: [123, 456] } }, q.w); } catch (e2) { threw = e2.message; }
      assert(threw && /not a vertex/.test(threw), 'origin must be a vertex: ' + threw);
      // saved and read back, the record is the same
      var back = JSON.parse(JSON.stringify(q.doc));
      assert(back.holeTables[0].punch === true && back.holeTables[0].combineTags === true, 'round trip');
      // a flat with no forming tools: an empty table, no rows, no error
      var plain = build('p.units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[2, ' + T + ', 0]], { position: "inside" });\n');
      noErrors(plain);
      var d2 = DW.newDrawing(plain.model, {}), v2 = DW.addFlatView(d2, plain.mesh, { model: plain.model, build: plain.build, x: 5, y: 5 });
      var s2 = DW.compute(d2, plain.mesh, plain.model, { build: plain.build }), w2 = s2.views[0];
      DW.addHoleTable(d2, v2.id, { punch: true, origin: { p: [w2.flat.bbox.umin, w2.flat.bbox.vmin] } }, w2);
      s2 = DW.compute(d2, plain.mesh, plain.model, { build: plain.build });
      assert(s2.holeTables[0].rows.length === 0, 'no punches: ' + JSON.stringify(s2.holeTables[0].rows));
    });

    test('rfJG: Bend Table adds a Fixed Face note at the view centre, clear of the blank\'s lines; hidden / off', function () {
      var q = rfJGSheet({ bendNotes: 'table' }), w = q.w;
      var ff = q.sheet.annotations.filter(function (a) { return a.type === 'fixedFace' && a.view === q.view.id; });
      assert(ff.length === 1 && ff[0].text === 'Fixed Face', 'one Fixed Face note: ' + JSON.stringify(ff.map(function (a) { return a.text; })));
      function ffText(sh) { return sh.prims.filter(function (p) { return p.k === 'text' && p.text === 'Fixed Face'; })[0]; }
      var tp = ffText(q.sheet), bx = ff[0].box, c = w.toSheet([(w.flat.bbox.umin + w.flat.bbox.umax) / 2, (w.flat.bbox.vmin + w.flat.bbox.vmax) / 2]);
      assert(tp.anchor === 'middle' && Math.abs(tp.p[0] - c[0]) < 1e-9, 'centred across: ' + tp.p + ' vs ' + c);
      assert(bx.x0 > w.box.x0 && bx.x1 < w.box.x1 && bx.y0 > w.box.y0 && bx.y1 < w.box.y1, 'inside the view');
      assert(Math.abs((bx.y0 + bx.y1) / 2 - c[1]) < 0.5, 'near the centre: ' + JSON.stringify(bx) + ' c ' + c);
      // (the louver sits at the centre: the note moved off its marks and off every line of the view)
      var lines = q.sheet.prims.filter(function (p) { return p.k === 'line' && p.view === q.view.id; });
      assert(lines.length > 4, 'view lines');
      assert(!lines.some(function (l) { return DW._.segHitsRect(l.a, l.b, bx); }), 'no line through the note');
      assert(Math.abs(tp.h - 0.125 / 1) < 1e-9, 'note height .125 in: ' + tp.h);
      // the bend tags are still there; bend notes mode has no Fixed Face note
      assert(q.sheet.annotations.filter(function (a) { return a.type === 'bendTag' && a.view === q.view.id; }).length === 2, 'two bend tags');
      var n = rfJGSheet({ bendNotes: 'notes' });
      assert(!n.sheet.annotations.some(function (a) { return a.type === 'fixedFace'; }), 'no note with bend notes');
      // hidden like a bend note (saved under flatAnn.fixedFace), and dragged
      DW.flatAnnotation(q.doc, q.view.id, 'fixedFace', { hidden: true });
      q.compute();
      var h = q.sheet.annotations.filter(function (a) { return a.type === 'fixedFace'; })[0];
      assert(h && h.hidden, 'hidden');
      DW.flatAnnotation(q.doc, q.view.id, 'fixedFace', { hidden: false, off: [0.5, 0.25] });
      q.compute();
      var m = q.sheet.annotations.filter(function (a) { return a.type === 'fixedFace'; })[0];
      var mp = ffText(q.sheet);
      assert(m && !m.hidden && mp, 'shown again');
      near(mp.p[0], tp.p[0] + 0.5, 1e-9); near(mp.p[1], tp.p[1] + 0.25, 1e-9);
      // the view option turns it off
      var off = rfJGSheet({ bendNotes: 'table' });
      off.view.fixedFaceNote = false;
      off.compute();
      assert(!off.sheet.annotations.some(function (a) { return a.type === 'fixedFace'; }), 'fixedFaceNote false');
      // SVG and DXF carry it on BEND_NOTES
      assert(DW.toDXF(q.sheet).indexOf('Fixed Face') > 0, 'DXF');
    });
  })();
