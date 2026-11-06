  // --- rfJB (2026-11-05, lane drawroom, test-reports/2026-11-05-shop-drawing-audit.md): Standard 3 View leaves room
  // for its model dimensions (a row under the bottom views, above the title / tolerance blocks, and one left of them);
  // the audit's open items inside the drawing files: Bend Table with no free paper (6), Hole Table tags (7), a Hole
  // Table origin that is not a vertex (8) ---
  (function () {
    group('rfJB: Standard 3 View room for model dimensions, Bend Table with no free paper, Hole Table tags off their neighbours, Hole Table origin must be a vertex');
    var DW = Drawing, Ti = 0.0598;
    var CHANNEL = 'p.name("U-Channel").units("in");\np.sheet(' + Ti + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 8, 3).end().baseFlange();\n' +
      'p.flange(1.5, [[4, ' + Ti + ', 0], [4, ' + Ti + ', 3]], { position: "inside" });\n' +
      'p.sketch("Top", ' + Ti + ').circle(1, -1.5, 0.1405).circle(7, -1.5, 0.1405).circle(4, -1.5, 0.25).circle(2.5, -1.5, 0.1405).circle(5.5, -1.5, 0.1405).cut("through", { reverse: true });\n';
    var BOX = 'p.name("Box").units("in");\np.sheet(' + Ti + ', 0.06, 0.44);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(1.5, [[3, ' + Ti + ', 0], [3, ' + Ti + ', 4], [0, ' + Ti + ', 2], [6, ' + Ti + ', 2]], { position: "inside", relief: "rect" });\n' +
      'p.hem(0.375, [[3, 1.6196, 0]], { gap: 0.0299 });\n';
    var LA = 'p.name("Bracket").units("in");\np.sketch("Front").line(0, 1.5, 0, 0.12).arc(0.12, 0.12, 0.12, 180, 270).line(0.12, 0, 2, 0).line(2, 0, 2, 0.06).line(2, 0.06, 0.12, 0.06).arc(0.12, 0.12, 0.06, 270, 180).line(0.06, 0.12, 0.06, 1.5).line(0.06, 1.5, 0, 1.5).end().extrude(2);\n' +
      'p.sketch("Top").circle(1.4, -0.5, 0.2).end().cut("through");\np.sketch("Top").circle(1.4, -1.5, 0.2).end().cut("through");\n';
    function bracket() {
      var src = build(LA); noErrors(src);
      var m = Exchange.newPartFromImport(Exchange.importFile('Bracket.step', Exchange.exportSTEP(src.model, src.build), { units: 'in' }));
      new K.Builder(m).insertBends([1, 0, 1], { kFactor: 0.44 });
      var b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      return { model: m, build: b, mesh: K.meshFromBody(b.body) };
    }
    function meet(a, b, m) { m = m || 0; return a.x0 - m < b.x1 && b.x0 - m < a.x1 && a.y0 - m < b.y1 && b.y0 - m < a.y1; }
    function primBox(p) {
      if (p.k === 'text') return DW.textRect(p);
      if (p.k === 'line') return { x0: Math.min(p.a[0], p.b[0]), x1: Math.max(p.a[0], p.b[0]), y0: Math.min(p.a[1], p.b[1]), y1: Math.max(p.a[1], p.b[1]) };
      if (p.k === 'fill') { var xs = p.pts.map(function (q) { return q[0]; }), ys = p.pts.map(function (q) { return q[1]; }); return { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) }; }
      return null;
    }
    // every model dimension piece of a Standard 3 View sheet: [what it hits] (title block / left blocks, another view,
    // off the sheet's border)
    function clashes(sh) {
      var S = sh.size, tbs = DW.tbRects(S, 'in'), b1 = 10 / 25.4, bad = [];
      sh.dims.forEach(function (d, i) {
        sh.prims.forEach(function (p) {
          if (p.dimIx !== i) return;
          var b = primBox(p); if (!b) return;
          tbs.forEach(function (t) { if (meet(b, t)) bad.push(d.text + ' in the title / tolerance block'); });
          sh.views.forEach(function (w) { if (w.view.id !== d.view && meet(b, w.box)) bad.push(d.text + ' (view ' + d.view + ') crosses ' + w.view.name); });
          if (b.x0 < b1 || b.y0 < b1 || b.x1 > S[0] - b1 || b.y1 > S[1] - b1) bad.push(d.text + ' off the sheet');
        });
      });
      return bad.filter(function (x, i, a) { return a.indexOf(x) === i; });
    }
    function std3(r, opts) {
      var doc = DW.newDrawing(r.model, Object.assign({ projection: 'third' }, opts || {}));
      DW.standard3View(doc, r.mesh, r.model.units || 'in');
      doc.autoDims = true;
      return { doc: doc, sheet: DW.compute(doc, r.mesh, r.model, { build: r.build }) };
    }
    var parts = [['U channel', function () { var r = build(CHANNEL); noErrors(r); return r; }], ['box with a hem', function () { var r = build(BOX); noErrors(r); return r; }], ['STEP bracket (Insert Bends)', bracket]];
    parts.forEach(function (pt) {
      test('rfJB: ' + pt[0] + ' — Standard 3 View with model items on ANSI B: no dimension in the title block or the tolerance block, none crossing another view, none past the border', function () {
        var r = pt[1](), s = std3(r), bad = clashes(s.sheet);
        assert(s.sheet.dims.length >= 3, 'model items ' + s.sheet.dims.length);
        assert(!bad.length, bad.join('; '));
        return DW.scaleText(s.doc.sheet.scale) + ', ' + s.sheet.dims.length + ' dimensions';
      });
    });
    test('rfJB: the bracket keeps 2 : 1 and its Front 2.000 stays under the Front view (SolidWorks\' place), above UNLESS OTHERWISE SPECIFIED with room to spare; the views moved up, not shrunk', function () {
      var r = bracket(), s = std3(r), sh = s.sheet;
      assert(DW.scaleText(s.doc.sheet.scale) === '2:1', 'scale ' + DW.scaleText(s.doc.sheet.scale));
      var F = sh.views.filter(function (w) { return w.view.orient === 'Front'; })[0];
      var d = sh.dims.filter(function (x) { return x.view === F.view.id && x.kind === 'h'; })[0];
      assert(d && d.text === '2.000' && d.box.y1 <= F.box.y0 + 1e-9, 'under the view ' + JSON.stringify(d && d.box));
      var low = Infinity;
      sh.prims.forEach(function (p) { if (p.dimIx === sh.dims.indexOf(d)) { var b = primBox(p); if (b) low = Math.min(low, b.y0); } });
      var tbTop = DW.tbRects(sh.size, 'in')[0].y1;
      assert(low - tbTop >= 1 / 25.4 - 1e-9, 'clear of the blocks by 1 mm or more: ' + ((low - tbTop) * 25.4).toFixed(2) + ' mm');
    });
    test('rfJB: Standard 3 View room on other sheets — a 4 x 2 plate, a tall part, first angle, A3 mm: nothing in the blocks or across views; a metric sheet keeps its full view-gap margins', function () {
      var cases = [['p.units("in");\np.box(4, 0.25, 2);\n', {}], ['p.units("in");\np.box(3, 2, 7);\n', {}], ['p.units("in");\np.box(9, 1, 4);\n', { projection: 'first' }], ['p.units("mm");\np.box(150, 20, 80);\n', { format: 'A3' }]];
      var out = [];
      cases.forEach(function (c) {
        var r = build(c[0]); noErrors(r);
        var s = std3(r, c[1]), bad = clashes(s.sheet);
        if (s.doc.units === 'mm') bad = [];   // (clashes() measures inch borders; mm checked below)
        assert(!bad.length, c[0].replace(/\n/g, ' ') + ': ' + bad.join('; '));
        if (s.doc.units === 'mm') {
          var tbs = DW.tbRects(s.sheet.size, 'mm');
          s.sheet.dims.forEach(function (d, i) { s.sheet.prims.forEach(function (p) { var b = p.dimIx === i && primBox(p); if (b) tbs.forEach(function (t) { assert(!meet(b, t), 'mm: ' + d.text + ' in the blocks'); }); }); });
        }
        out.push(DW.scaleText(s.doc.sheet.scale));
      });
      return out.join(' / ');
    });
    test('rfJB: explicit positions are kept — a view moved after Standard 3 View stays where it was put when the sheet is computed again', function () {
      var r = bracket(), s = std3(r), F = s.doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
      DW.moveView(s.doc, F.id, F.x + 0.5, F.y + 0.25);
      var x = F.x, y = F.y;
      DW.compute(s.doc, r.mesh, r.model, { build: r.build });
      assert(Math.abs(F.x - x) < 1e-12 && Math.abs(F.y - y) < 1e-12 && s.doc.layout === 'manual', 'moved ' + JSON.stringify([F.x, F.y, x, y, s.doc.layout]));
    });
    // --- audit 6: a Bend Table with no free paper
    test('rfJB: audit 6 — the box\'s flat at 1 : 8 with a Bend Table on its full Standard 3 View sheet (the audit\'s case): the table is inside the border and covers no view, or (no free paper) the least of them and the sheet says so (sheet.warnings, the item marked noRoom); on Sheet2 there is no warning', function () {
      var r = build(BOX); noErrors(r);
      var doc = DW.newDrawing(r.model, { projection: 'third', options: { flatDims: true, flatSizeNote: true } });
      DW.standard3View(doc, r.mesh, 'in');
      var fv = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 15, y: 3.6, scale: [1, 8], bendNotes: 'table' });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), S = sh.size, b1 = 10 / 25.4;
      var bt = sh.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(bt && bt.box, 'a Bend Table');
      var B = bt.box;
      assert(B.x0 >= b1 - 1e-9 && B.y0 >= b1 - 1e-9 && B.x1 <= S[0] - b1 + 1e-9 && B.y1 <= S[1] - b1 + 1e-9, 'inside the border ' + JSON.stringify(B));
      var area = function (o) { var ix = Math.min(B.x1, o.x1) - Math.max(B.x0, o.x0), iy = Math.min(B.y1, o.y1) - Math.max(B.y0, o.y0); return ix > 0 && iy > 0 ? ix * iy : 0; };
      var cov = sh.views.filter(function (w) { return w.view.id !== fv.id; }).reduce(function (s, w) { return s + area(w.box); }, 0);
      if (bt.info && bt.info.noRoom) {
        assert((sh.warnings || []).some(function (t) { return /Bend Table/.test(t) && /no free paper/.test(t); }), 'warning ' + JSON.stringify(sh.warnings));
        assert(cov < 0.5 * (B.x1 - B.x0) * (B.y1 - B.y0) + 1e-9, 'covers ' + cov.toFixed(3) + ' sq in of the views');
      } else assert(cov < 1e-9 && !(sh.warnings || []).length, 'free paper found, nothing covered: ' + cov);
      // on Sheet2 (rfIW) the table has room: no warning
      var doc2 = DW.newDrawing(r.model, { projection: 'third', options: { flatDims: true, flatSizeNote: true } });
      DW.standard3View(doc2, r.mesh, 'in');
      DW.addFlatView(doc2, r.mesh, { model: r.model, build: r.build, fit: true, bendNotes: 'table' });
      var sh2 = DW.compute(doc2, r.mesh, r.model, { build: r.build });
      assert(!(sh2.warnings || []).length && !sh2.annotations.filter(function (a) { return a.type === 'bendTable' && a.info && a.info.noRoom; }).length, 'Sheet2: no warning ' + JSON.stringify(sh2.warnings));
      return bt.info && bt.info.noRoom ? 'no room: ' + cov.toFixed(3) + ' sq in covered' : 'free paper found';
    });
    test('rfJB: audit 6 — a Bend Table that cannot fit anywhere free (a flat filling an A-size sheet) is placed least-covering, not left on top of the Front view, and warned about', function () {
      var r = build(BOX); noErrors(r);
      var doc = DW.newDrawing(r.model, { projection: 'third', format: 'ANSI A', scale: [1, 1], options: { flatDims: true } });
      DW.standard3View(doc, r.mesh, 'in');
      doc.sheet.autoScale = false; doc.sheet.scale = [1, 1];
      DW.layout(doc, r.mesh, 'in');
      var fv = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 5.5, y: 4.25, bendNotes: 'table' });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var bt = sh.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(bt && bt.info && bt.info.noRoom, 'no room on a full A sheet');
      assert((sh.warnings || []).length === 1 && /Bend Table of /.test(sh.warnings[0]), JSON.stringify(sh.warnings));
      void fv;
    });
    // --- audit 7: Hole Table tags
    test('rfJB: audit 7 — Hole Table tags on the channel\'s flat at 1 : 4: at the dimension text height (.125 in), no tag touching another tag, another hole or a bend line; at 1 : 1 the first tag is still up and right of its hole', function () {
      var r = build(CHANNEL); noErrors(r);
      var fd = DW.flatData(r.mesh, r.model, r.build);
      [[1, 4], [1, 1]].forEach(function (sc) {
        var doc = DW.newDrawing(r.model, { projection: 'third', scale: [1, 1] });
        var fv = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 8.5, y: 6, scale: sc });
        DW.addHoleTable(doc, fv.id, { origin: [fd.bbox.umin, fd.bbox.vmin], all: true, x: 1, y: 3.5 });
        var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views[0];
        var tags = sh.prims.filter(function (p) { return p.holeTag; });
        assert(tags.length === 5, 'five tags');
        tags.forEach(function (t) { assert(Math.abs(t.h - 0.125) < 1e-9, 'tag height ' + t.h); });
        var boxes = tags.map(function (t) { return DW.textRect(t); }), rows = sh.holeTables[0].rows;
        boxes.forEach(function (b, i) {
          boxes.forEach(function (o, j) { if (j > i) assert(!meet(b, o), 'tags ' + tags[i].text + ' / ' + tags[j].text + ' touch at ' + DW.scaleText(sc)); });
          rows.forEach(function (h) {
            if (h.tag === tags[i].text) return;
            var c = w.toSheet(h.c), rr = h.r * w.scale;
            assert(!meet(b, { x0: c[0] - rr, y0: c[1] - rr, x1: c[0] + rr, y1: c[1] + rr }), tags[i].text + ' on hole ' + h.tag);
          });
          sh.prims.forEach(function (p) {
            if (p.k !== 'line' || !/^BEND_/.test(p.layer)) return;
            var lb = primBox(p);
            assert(!(meet(b, lb) && (lb.x1 - lb.x0 < 1e-9 ? lb.x0 > b.x0 && lb.x0 < b.x1 : lb.y0 > b.y0 && lb.y0 < b.y1)), tags[i].text + ' on a bend line');
          });
        });
        if (sc[1] === 1) {
          var a = tags.filter(function (t) { return t.text === rows[0].tag; })[0], c0 = w.toSheet(rows[0].c);
          assert(a.p[0] > c0[0] && a.p[1] > c0[1], 'up and right at 1 : 1');
        }
      });
    });
    // --- audit 8: a Hole Table origin that is not a vertex
    test('rfJB: audit 8 — addHoleTable with the computed view refuses an origin that is not a vertex (or X / Y edges that are not edges) and leaves the drawing as it was; a vertex is taken; without the view (old callers) nothing changes', function () {
      var r = build('p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).end().extrude(0.25);\np.hole("Front", 0.5, 0.5, 0.25, { offset: 0.25 });\np.hole("Front", 3.5, 0.5, 0.25, { offset: 0.25 });\n');
      noErrors(r);
      var doc = DW.newDrawing(r.model, {});
      DW.standard3View(doc, r.mesh, 'in');
      var F = doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views.filter(function (x) { return x.view.id === F.id; })[0];
      var threw = null;
      try { DW.addHoleTable(doc, F.id, { origin: [1.7, 1.1], all: true }, w); } catch (e) { threw = e.message; }
      assert(threw && /not a vertex/.test(threw) && /Drawing View/.test(threw), 'refused: ' + threw);
      assert(!(doc.holeTables || []).length, 'nothing added');
      threw = null;
      try { DW.addHoleTable(doc, F.id, { origin: { x: { a: [0, 1], b: [4, 1] }, y: { a: [0, 0], b: [0, 2] } }, all: true }, w); } catch (e) { threw = e.message; }
      assert(threw && /edges/.test(threw), 'edges refused: ' + threw);
      var t = DW.addHoleTable(doc, F.id, { origin: [0, 0], all: true }, w);
      assert(t && doc.holeTables.length === 1, 'a vertex is taken');
      threw = null;
      try { DW.editHoleTable(doc, t.id, { origin: [2, 1] }, w); } catch (e) { threw = e.message; }
      assert(threw && /not a vertex/.test(threw) && doc.holeTables[0].origin.p[0] === 0, 'edit refused ' + threw);
      var t2 = DW.addHoleTable(doc, F.id, { origin: [1.7, 1.1], all: true });
      assert(t2 && doc.holeTables.length === 2, 'no view given: added as before');
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      assert(sh.holeTables[1].dangling, 'and dangles');
    });
  })();
