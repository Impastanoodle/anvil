  // ------------------------------------------------------------------ rfAN: Hole Table, Revision Symbol / Cloud, Weld Symbol
  (function () {
    if (typeof Drawing === 'undefined') return;
    group('rfAN: Hole Table (flat-pattern coordinates, Hole Wizard sizes), Revision Symbol and Cloud, Weld Symbol');
    var DW = Drawing;
    function rfANSheet(r, doc) { return DW.compute(doc, r.mesh, r.model, { build: r.build }); }
    function rfANTexts(sh, layer) { return sh.prims.filter(function (p) { return p.k === 'text' && (!layer || p.layer === layer); }).map(function (p) { return p.text; }); }
    var PLATE = 'p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).end().extrude(0.25);\n';
    function rfANHoles(x2) { return 'p.hole("Front", 0.5, 0.5, 0.25, { offset: 0.25 });\np.hole("Front", ' + x2 + ', 0.5, 0.25, { offset: 0.25 });\np.hole("Front", 2, 1.5, 0.5, { offset: 0.25 });'; }
    test('rfAN: Hole Table on a plate — origin at the lower-left vertex, tags A1 A2 B1 per size, X / Y LOC at the inch precision, Ø.250 THRU ALL; Combine same tags / sizes merge cells; a moved hole moves its row; JSON round trip', function () {
      var r = build(PLATE + rfANHoles(3.5));
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(doc, r.mesh, r.model.units);
      var F = doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
      var sh = rfANSheet(r, doc), w = sh.views.filter(function (x) { return x.view.id === F.id; })[0];
      assert(DW.viewHoles(w, r.mesh).length === 3, 'three holes in the Front view');
      var t = DW.addHoleTable(doc, F.id, { origin: { p: [0, 0] }, all: true });
      sh = rfANSheet(r, doc);
      var ht = sh.holeTables[0], rows = ht.rows.map(function (x) { return [x.tag, x.xText, x.yText, x.size].join(' '); });
      assert(rows.join('|') === 'A1 .500 .500 Ø.250 THRU ALL|A2 3.500 .500 Ø.250 THRU ALL|B1 2.000 1.500 Ø.500 THRU ALL', 'rows: ' + rows.join('|'));
      var tl = rfANTexts(sh, 'TABLES');
      ['TAG', 'X LOC', 'Y LOC', 'SIZE', 'A1', '3.500', 'Ø.500 THRU ALL'].forEach(function (s) { assert(tl.indexOf(s) >= 0, 'table text ' + s); });
      var tags = sh.prims.filter(function (p) { return p.holeTag; });
      assert(tags.length === 3 && tags.every(function (p) { return p.layer === 'ANNOTATIONS' && p.view === F.id; }), 'tags beside the holes, moving with the view');
      var a1 = tags.filter(function (p) { return p.text === 'A1'; })[0], c1 = w.toSheet([0.5, 0.5]);
      assert(a1.p[0] > c1[0] && a1.p[1] > c1[1] && a1.p[0] - c1[0] < 0.5, 'A1 up and right of its hole');
      assert(sh.prims.some(function (p) { return p.holeTable === t.id && p.k === 'text' && p.text === 'X'; }) && sh.prims.some(function (p) { return p.holeTable === t.id && p.k === 'text' && p.text === 'Y'; }), 'datum X / Y arrows');
      var hb = ht.box;
      assert(sh.views.every(function (x) { var o = x.box; return !(o.x0 < hb.x1 && hb.x0 < o.x1 && o.y0 < hb.y1 && hb.y0 < o.y1); }), 'the table goes beside the view, clear of the views: ' + JSON.stringify(hb));
      // combine
      DW.editHoleTable(doc, t.id, { combineTags: true, combineSizes: true });
      sh = rfANSheet(r, doc);
      var ct = rfANTexts(sh, 'TABLES');
      assert(ct.filter(function (s) { return s === 'A'; }).length === 1 && ct.filter(function (s) { return s === 'Ø.250 THRU ALL'; }).length === 1, 'merged TAG / SIZE cells: ' + ct.join(','));
      assert(sh.holeTables[0].rows.map(function (x) { return x.tag; }).join() === 'A,A,B', 'tags per size');
      // the model changes: the second hole moves to x 3.25
      var r2 = build(PLATE + rfANHoles(3.25));
      noErrors(r2);
      sh = rfANSheet(r2, doc);
      assert(sh.holeTables[0].rows[1].xText === '3.250' && !sh.holeTables[0].dangling, 'follows the part: ' + sh.holeTables[0].rows[1].xText);
      // saved with the drawing
      var back = JSON.parse(JSON.stringify(doc));
      sh = rfANSheet(r2, back);
      assert(sh.holeTables.length === 1 && sh.holeTables[0].rows.length === 3, 'round trip');
      // sheets keep their own hole tables
      assert(DW.SHEET_KEYS.indexOf('holeTables') >= 0, 'a sheet key');
      DW.addSheet(doc, { activate: true });
      assert(!(doc.holeTables || []).length, 'sheet 2 has none');
      DW.activateSheet(doc, 0);
      assert(doc.holeTables.length === 1, 'sheet 1 keeps it');
      // picked holes and the X / Y edges as datum
      DW.editHoleTable(doc, t.id, { all: false, holes: [{ c: [2, 1.5], r: 0.25 }], origin: { x: { a: [0, 0], b: [4, 0] }, y: { a: [0, 0], b: [0, 2] } }, combineTags: false });
      sh = rfANSheet(r, doc);
      assert(sh.holeTables[0].rows.length === 1 && sh.holeTables[0].rows[0].tag === 'A1' && sh.holeTables[0].rows[0].xText === '2.000', 'one picked hole from the edges: ' + JSON.stringify(sh.holeTables[0].rows));
      DW.editHoleTable(doc, t.id, { holes: [], sizes: [0.25] });
      sh = rfANSheet(r, doc);
      assert(sh.holeTables[0].rows.length === 2, 'all holes of the same size');
      var threw = null;
      try { DW.addHoleTable(doc, F.id, { origin: { p: [0, 0] } }); } catch (e) { threw = e.message; }
      assert(/needs holes/.test(threw || ''), 'refused without holes');
      return rows.join(' | ');
    });
    test('rfAN: Hole Table on a flat-pattern view — the 16 ga bracket\'s four Ø.281 holes in flat coordinates (3.000 and 1.000 apart), every output carries it (SVG, DXF R12 / R2000, PDF)', function () {
      var code = 'p.name("Bracket").units("in");\np.sheet(0.06, 0.03, 0.44);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[0, 0.06, 1]]);\np.flange(1, [[4, 0.06, 1]], { reverse: true });\n' +
        'p.hole("Top", 0.5, -0.5, 0.281, { offset: 0.06 });\np.hole("Top", 3.5, -0.5, 0.281, { offset: 0.06 });\np.hole("Top", 0.5, -1.5, 0.281, { offset: 0.06 });\np.hole("Top", 3.5, -1.5, 0.281, { offset: 0.06 });';
      var r = build(code);
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      var v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, scale: '1:2' });
      var sh = rfANSheet(r, doc), w = sh.views.filter(function (x) { return x.view.id === v.id; })[0];
      assert(w && w.flat, 'flat view');
      var b = w.proj.bounds;
      DW.addHoleTable(doc, v.id, { origin: { p: [b.umin, b.vmin] }, all: true });
      sh = rfANSheet(r, doc);
      var rows = sh.holeTables[0].rows;
      assert(rows.length === 4, 'four holes: ' + rows.length);
      assert(rows.every(function (x) { return x.size === 'Ø.281 THRU ALL'; }), 'size ' + rows[0].size);
      var xs = rows.map(function (x) { return x.x; }).sort(function (a, c) { return a - c; }), ys = rows.map(function (x) { return x.y; }).sort(function (a, c) { return a - c; });
      near(xs[3] - xs[0], 3, 1e-6, 'X pitch'); near(ys[3] - ys[0], 1, 1e-6, 'Y pitch');
      assert(xs[0] > 0.5 && ys[0] > 0, 'from the flat blank corner (flange developed lengths included): ' + xs[0].toFixed(4) + ', ' + ys[0].toFixed(4));
      // flat coordinates: the holes' centres on the flat outline's frame
      var fc = w.proj.circles.visible.map(function (c) { return c.c; });
      rows.forEach(function (x) { assert(fc.some(function (c) { return Math.hypot(c[0] - (x.x + b.umin), c[1] - (x.y + b.vmin)) < 1e-6; }), 'row on a flat circle'); });
      var svg = DW.toSVG(sh), d12 = DW.toDXF(sh), d2k = DW.toDXF(sh, { version: 'R2000' }), pdf = DW.toPDF(sh);
      [svg, d12, d2k].forEach(function (s, i) { assert(s.indexOf('X LOC') >= 0 && s.indexOf('A4') >= 0, 'output ' + i); });
      assert(d12.indexOf('%%c.281 THRU ALL') >= 0, 'DXF size text');
      var pt = typeof pdf === 'string' ? pdf : String.fromCharCode.apply(null, Array.prototype.slice.call(pdf, 0, Math.min(pdf.length, 2000000)));
      assert(pt.indexOf('X LOC') >= 0, 'PDF');
      return rows.map(function (x) { return x.tag + ' ' + x.xText + ',' + x.yText; }).join(' | ');
    });
    test('rfAN: Hole Table sizes of Hole Wizard holes read the feature callout (CBORE, tapped, THRU ALL)', function () {
      var code = 'p.units("in");\np.box(2, 2, 1, { centered: true });\n' +
        'p.holeWizard({ face: "Top", offset: 1, points: [[-0.5, 0]], standard: "ANSI Inch", type: "cbore", size: "1/4", fit: "normal", depth: 0.75 });\n' +
        'p.holeWizard({ face: "Top", offset: 1, points: [[0, -0.6]], type: "hole", sizeType: "drill", size: "F", end: "through" });';
      var r = build(code);
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(doc, r.mesh, r.model.units);
      var T = doc.views.filter(function (v) { return v.orient === 'Top'; })[0];
      DW.addHoleTable(doc, T.id, { origin: { p: [-1, -1] }, all: true });
      var sh = rfANSheet(r, doc), rows = sh.holeTables[0].rows;
      assert(rows.length === 2, 'two holes: ' + JSON.stringify(rows));
      var hw = r.model.features.filter(function (f) { return f.type === 'hole'; });
      var want = hw.map(function (f) { return HoleWizard.callout(f, 'in').map(function (s) { return s.replace(/ THRU$/, ' THRU ALL'); }).join(' '); });
      rows.forEach(function (x) { assert(want.indexOf(x.size) >= 0, 'wizard text ' + x.size + ' in ' + JSON.stringify(want)); });
      assert(rows.some(function (x) { return /THRU ALL/.test(x.size); }) && rows.some(function (x) { return x.lines.length > 1; }), 'THRU ALL drill, a two-line CBORE size');
      return rows.map(function (x) { return x.tag + ' ' + x.size; }).join(' | ');
    });
    test('rfAN: Revision Symbol names the latest revision, follows its row when the REV is edited; Revision Cloud scallops bulge outward with an end on each corner; Weld Symbol ANSI layout', function () {
      var r = build(PLATE + rfANHoles(3.5));
      var doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(doc, r.mesh, r.model.units);
      DW.addRevision(doc, { description: 'RELEASED' }); DW.addRevision(doc, { description: 'HOLE MOVED' });
      var rs = DW.addSymbol(doc, { type: 'revision', p: [5, 5], leader: [4.5, 4.6] });
      assert(rs.rev === 'B' && rs.row != null, 'latest: ' + JSON.stringify(rs));
      var sh = rfANSheet(r, doc), sy = sh.symbols.filter(function (s) { return s.id === rs.id; })[0];
      assert(sy.text === 'REVISION B', sy.text);
      var tri = sh.prims.filter(function (p) { return p.symbol === rs.id && p.k === 'line'; });
      assert(tri.length === 4 && rfANTexts(sh, 'SYMBOLS').indexOf('B') >= 0, 'triangle, leader and letter');
      DW.editRevision(doc, 1, { rev: 'C' });
      sh = rfANSheet(r, doc);
      assert(sh.symbols.filter(function (s) { return s.id === rs.id; })[0].text === 'REVISION C', 'follows the row');
      // cloud
      var cl = DW.addSymbol(doc, { type: 'revCloud', shape: 'rect', a: [2, 2], b: [4, 3] });
      assert(Math.abs(cl.w - 2) < 1e-12 && Math.abs(cl.h - 1) < 1e-12 && cl.p[0] === 3, 'rect from corners');
      sh = rfANSheet(r, doc);
      var arcs = sh.prims.filter(function (p) { return p.symbol === cl.id && p.k === 'arc'; });
      assert(arcs.length > 12, 'scallops ' + arcs.length);
      arcs.forEach(function (a) {
        var m = (a.a0 + a.a1) / 2 * Math.PI / 180, q = [a.c[0] + a.r * Math.cos(m), a.c[1] + a.r * Math.sin(m)];
        assert(q[0] < 2 + 1e-9 || q[0] > 4 - 1e-9 || q[1] < 2 + 1e-9 || q[1] > 3 - 1e-9, 'bulges outward');
      });
      [[2, 2], [4, 2], [4, 3], [2, 3]].forEach(function (c) { assert(arcs.some(function (a) { var e = (a.a0) * Math.PI / 180; return Math.hypot(a.c[0] + a.r * Math.cos(e) - c[0], a.c[1] + a.r * Math.sin(e) - c[1]) < 1e-9; }), 'an arc starts on corner ' + c); });
      var ce = DW.addSymbol(doc, { type: 'revCloud', shape: 'ellipse', a: [6, 2], b: [8, 3] }), cp = DW.addSymbol(doc, { type: 'revCloud', shape: 'polygon', points: [[1, 5], [2, 5], [1.5, 6]] });
      assert(ce.shape === 'ellipse' && cp.pts.length === 3, 'ellipse and polygon');
      // weld: fillet arrow side 1/4 2-6, V other side, all around, field weld, tail GMAW; arrow to the lower left
      var wl = DW.addSymbol(doc, { type: 'weld', p: [10, 5], leader: [9.5, 4.6], arrow: { type: 'fillet', size: '1/4', length: '2-6' }, other: { type: 'v', size: '1/8' }, allAround: true, field: true, tail: 'GMAW' });
      sh = rfANSheet(r, doc);
      var wp = sh.prims.filter(function (p) { return p.symbol === wl.id; }), k = 1 / 25.4;
      var ref = wp.filter(function (p) { return p.k === 'line' && Math.abs(p.a[1] - 5) < 1e-12 && Math.abs(p.b[1] - 5) < 1e-12 && p.a[0] === 10; })[0];
      assert(ref && ref.b[0] > 10.5, 'reference line to the right of the junction (away from the arrow)');
      var inSym = function (p) { return p.k === 'line' && p.a[0] > 10.1 && p.a[0] < ref.b[0] - 1e-9; };
      var below = wp.filter(function (p) { return inSym(p) && (p.a[1] < 5 - 1e-9 || p.b[1] < 5 - 1e-9); }), above = wp.filter(function (p) { return inSym(p) && (p.a[1] > 5 + 1e-9 || p.b[1] > 5 + 1e-9); });
      assert(below.length === 2 && above.length === 2, 'fillet below (arrow side), V above (other side): ' + below.length + ' / ' + above.length);
      var leg = below.filter(function (p) { return Math.abs(p.a[0] - p.b[0]) < 1e-12; })[0], hyp = below.filter(function (p) { return p !== leg; })[0];
      assert(leg && hyp && Math.max(hyp.a[0], hyp.b[0]) > leg.a[0] + 1e-9, 'the fillet\'s upright leg on the left');
      var wt = wp.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text + '@' + (p.p[1] < 5 ? 'below' : 'above'); });
      ['1/4@below', '2-6@below', '1/8@above', 'GMAW@below'].forEach(function (s) { assert(wt.indexOf(s) >= 0, 'text ' + s + ' in ' + wt.join(',')); });
      assert(wp.some(function (p) { return p.k === 'circle' && p.c[0] === 10 && p.c[1] === 5; }), 'all-around circle at the junction');
      assert(wp.filter(function (p) { return p.k === 'fill'; }).length === 2, 'arrowhead and field-weld flag');
      DW.editSymbol(doc, wl.id, { other: null, allAround: false, field: false, tail: '' });
      sh = rfANSheet(r, doc);
      assert(sh.symbols.filter(function (s) { return s.id === wl.id; })[0].text === 'WELD | ARROW SIDE FILLET 1/4 2-6', 'edited');
      var d = DW.toDXF(sh, { version: 'R2000' });
      assert(d.indexOf('GMAW') < 0 && d.indexOf('2-6') >= 0 && /\nARC\n/.test(d), 'DXF carries the symbols');
      void k;
      return sy.text + ', ' + arcs.length + ' scallops';
    });
    test('rfAN: the writers honour Line Format — a primitive\'s p.lw (mm) and p.rgb: SVG stroke-width / stroke, DXF R2000 370 / 420 (R12: layer colour), PDF w / RG; primitives without them unchanged', function () {
      var r = build(PLATE + rfANHoles(3.5));
      var doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(doc, r.mesh, r.model.units);
      var sh = rfANSheet(r, doc), svg0 = DW.toSVG(sh), dxf0 = DW.toDXF(sh, { version: 'R2000' }), pdf0 = DW.toPDF(sh);
      sh.prims.push({ k: 'line', a: [1, 1], b: [3, 1], layer: 'SKETCH', style: 'thin', lw: 0.7, rgb: '#FF8000' });
      sh.prims.push({ k: 'line', a: [1, 2], b: [3, 2], layer: 'SKETCH', style: 'thick' });
      var svg = DW.toSVG(sh), d2 = DW.toDXF(sh, { version: 'R2000' }), d12 = DW.toDXF(sh), pdf = DW.toPDF(sh);
      var k = 1 / 25.4, sw = String(Math.round(0.7 * k * 1e4) / 1e4);
      assert(svg.indexOf('stroke-width="' + sw + '" stroke="#ff8000"') >= 0, 'SVG weight and colour');
      assert(svg.indexOf(svg0.split('\n').slice(2, 6).join('\n')) >= 0, 'other primitives as before');
      var ents = d2.split('\n0\nLINE\n').filter(function (x) { return /\n8\nSKETCH\n/.test(x); });
      assert(ents.length === 2 && /\n370\n70\n/.test(ents[0]) && new RegExp('\\n420\\n' + parseInt('ff8000', 16) + '\\n').test(ents[0]), 'R2000 370 / 420: ' + ents[0].slice(0, 200));
      assert(/\n370\n70\n/.test(ents[1]) && !/\n420\n/.test(ents[1]), 'a plain thick line: its style weight, no true colour');
      assert(!/\n420\n/.test(dxf0) && d12.indexOf('\n420\n') < 0, 'no true colour elsewhere / in R12');
      var pt = function (x) { return typeof x === 'string' ? x : String.fromCharCode.apply(null, Array.prototype.slice.call(x, 0, Math.min(x.length, 3000000))); };
      var ptxt = pt(pdf);
      assert(ptxt.indexOf('1 0.502 0 RG') >= 0, 'PDF colour');
      assert(ptxt.indexOf(String(Math.round(0.7 * k * 72 * 1e4) / 1e4) + ' w') >= 0, 'PDF weight');
      assert(pt(pdf0).indexOf('1 0.502 0 RG') < 0, 'the PDF without it has no orange');
      return 'lw .7 mm, #ff8000';
    });
  })();
  // --- end rfAN ---

