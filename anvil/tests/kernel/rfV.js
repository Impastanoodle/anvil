  // ------------------------------------------------------------------ rfV: drawing fidelity #6 / #10 / #13, angle dimension style and DXF, direct view kinds
  (function () {
    if (typeof Drawing === 'undefined') return;
    group('rfV: Center Mark .1 in, THRU ALL, bend table INNER RADIUS, flatDims off, angle dimensions in the document style and as DXF DIMENSION, no _.hook');
    var DW = Drawing;
    function rfVDoc(code, opts) {
      var r = build(code);
      noErrors(r);
      r.doc = DW.newDrawing(r.model, Object.assign({ date: '2026-10-12' }, opts || {}));
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      r.recompute();
      r.view = function (orient) { return r.sheet.views.filter(function (w) { return w.view.orient === orient; })[0]; };
      return r;
    }
    test('rfV: Center Mark size is in the drawing\'s units: .1 in on an inch drawing (2.54 paper mm), 2.5 on a mm one; an old paper-mm 2.5 on an inch drawing still reads as mm', function () {
      var r = rfVDoc('p.units("in"); p.box(4, 2, 0.5); p.hole("Top", 1, -1, 0.25, { offset: 0.5 });'), mm = rfVDoc('p.box(40, 20, 5);');
      assert(DW.docOptions(r.doc).markSize === 0.1 && DW.docOptions(mm.doc).markSize === 2.5, 'defaults ' + DW.docOptions(r.doc).markSize + ' / ' + DW.docOptions(mm.doc).markSize);
      near(DW.markPaper(r.doc, 0.1), 2.54, 1e-12, '.1 in in paper mm'); near(DW.markPaper(mm.doc, 2.5), 2.5, 1e-12, 'mm');
      var T = r.view('Top');
      var an = DW.addCenterMark(r.doc, T.view.id, { style: 'single', holes: [{ c: [1, -1], r: 0.125 }], ext: false });
      r.recompute();
      var prims = r.sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === 'ANNOTATIONS' && p.view === T.view.id; });
      var lens = prims.map(function (p) { return Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]); });
      assert(prims.length === 2 && lens.every(function (L) { return Math.abs(L - 0.2) < 1e-9; }), 'the cross is 2 × .1 in: ' + lens.join());
      r.doc.options.markSize = 2.5; r.recompute();
      near(DW.docOptions(r.doc).markSize, 0.0984, 1e-12, 'a pre-rfV 2.5 shows in inches');
      lens = r.sheet.prims.filter(function (p) { return p.k === 'line' && p.layer === 'ANNOTATIONS' && p.view === T.view.id; }).map(function (p) { return Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]); });
      assert(lens.every(function (L) { return Math.abs(L - 5 / 25.4) < 1e-9; }), 'kept as 2.5 mm ' + lens.join());
      return an.type + ' ' + lens[0].toFixed(4);
    });
    test('rfV: Hole Callout writes THRU ALL for a Cut-Extrude Through All hole, THRU for a blind cut that clears the part (SolidWorks ANSI)', function () {
      var r = rfVDoc('p.box(40, 20, 10); p.hole("Top", 10, -10, 6, { offset: 10 }); p.hole("Top", 30, -10, 4, { offset: 10, depth: 30 });'), T = r.view('Top');
      DW.addHoleCallout(r.doc, T.view.id, { c: [10, -10], r: 3 });
      DW.addHoleCallout(r.doc, T.view.id, { c: [30, -10], r: 2 });
      r.recompute();
      var t = r.sheet.annotations.filter(function (a) { return a.type === 'holeCallout'; }).map(function (a) { return a.text; });
      assert(t.join('|') === 'Ø6 THRU ALL|Ø4 THRU', 'callouts ' + t.join('|'));
      return t.join(', ');
    });
    test('rfV: a flat-pattern view gets no overall dimensions by default (SolidWorks), the option adds them; the Bend Table header is INNER RADIUS', function () {
      var r = build('p.name("Bracket").units("in");\np.sheet(0.06, 0.03, 0.44);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1, [[0, 0.06, 1]]);');
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-12' }), v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      assert(DW.docOptions(doc).flatDims === false && !sh.dims.some(function (d) { return d.flat; }), 'no flat dims by default: ' + sh.dims.map(function (d) { return d.text; }));
      doc.options = doc.options || {}; doc.options.flatDims = true;
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      assert(sh.dims.filter(function (d) { return d.flat; }).length === 2, 'the option adds width and height');
      v.bendNotes = 'table'; sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var tb = sh.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(tb && tb.info.columns.indexOf('Inner Radius') === 3 && tb.info.rows[0][3] === '0.030', 'table ' + JSON.stringify(tb && tb.info));
      return tb.info.columns.join(' / ');
    });
    test('rfV: an angle dimension uses the drawing\'s dimension style (inch: .125 text and arrows, like the linear ones) and is a 3-point angular DIMENSION in R2000 DXF with its own block', function () {
      var c = rfVDoc('p.units("in"); p.box(4, 2, 1); p.chamfer(0.2, [[2, 1, 2]]);'), R = c.view('Right');
      var ch = R.proj.lines.visible.filter(function (l) { return Math.abs(Math.abs(l[2] - l[0]) - 0.2) < 1e-9 && Math.abs(Math.abs(l[3] - l[1]) - 0.2) < 1e-9; })[0];
      var lead = R.proj.lines.visible.filter(function (l) { return Math.abs(l[1] - 1) < 1e-9 && Math.abs(l[3] - 1) < 1e-9; })[0];
      assert(ch && lead, 'chamfer / lead-in edges');
      var e1 = { edge: [[ch[0], ch[1]], [ch[2], ch[3]]] }, e2 = { edge: [[lead[0], lead[1]], [lead[2], lead[3]]] }, V = DW.smartDim(e1, e2, null).c;
      var mids = [[(ch[0] + ch[2]) / 2, (ch[1] + ch[3]) / 2], [(lead[0] + lead[2]) / 2, (lead[1] + lead[3]) / 2]];
      var acute = DW.smartDim(e1, e2, [V[0] - (mids[0][0] - V[0]) + (mids[1][0] - V[0]) * 0.5, V[1] - (mids[0][1] - V[1]) + (mids[1][1] - V[1]) * 0.5]);
      near(acute.value, 45, 1e-9, 'acute');
      var v = DW.findView(c.doc, R.view.id); v.dims = (v.dims || []).concat([acute]);
      c.recompute();
      var ix = -1; c.sheet.dims.forEach(function (d, i) { if (d.kind === 'angle') ix = i; });
      assert(ix >= 0 && c.sheet.dims[ix].text === '45°', 'angle on the sheet');
      var at = c.sheet.prims.filter(function (p) { return p.dimIx === ix && p.k === 'text'; })[0];
      var lin = c.sheet.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'text' && p.dimIx != null && p.dimIx !== ix; })[0];
      assert(at && lin, 'texts');
      near(at.h, lin.h, 1e-12, 'angle text height = linear text height'); near(at.h, c.sheet.dimStyle.paper.text, 1e-12, 'the style\'s text');
      near(c.sheet.dimStyle.paper.text, 0.125, 1e-9, 'ANSI inch .125');
      var fill = c.sheet.prims.filter(function (p) { return p.dimIx === ix && p.k === 'fill'; })[0];
      near(Math.hypot(fill.pts[0][0] - (fill.pts[1][0] + fill.pts[2][0]) / 2, fill.pts[0][1] - (fill.pts[1][1] + fill.pts[2][1]) / 2), 0.125, 1e-9, 'arrow .125 long');
      var dxf = DW.toDXF(c.sheet, { version: 'R2000' }), k = DxfCheck.check(dxf, { units: 'in', layers: [] });
      assert(k.ok, 'check ' + k.errors.join('; '));
      var ang = k.dimensions.filter(function (d) { return d.kind === 'angular3'; });
      assert(ang.length === 1 && ang[0].entities >= 4 && ang[0].text === '45%%d', 'angular DIMENSION ' + JSON.stringify(ang));
      assert(k.dimensions.length === c.sheet.dims.length && !k.counts['ARC@DIMENSIONS'] && !k.counts['TEXT@DIMENSIONS'], 'nothing exploded ' + JSON.stringify(k.counts));
      assert(/\nAcDb3PointAngularDimension\n/.test(dxf), '3-point angular subclass');
      var r12 = DxfCheck.check(DW.toDXF(c.sheet, { version: 'R12' }), { units: 'in', layers: [] });
      assert(r12.ok && !r12.dimensions.length && r12.counts['ARC@DIMENSIONS'] === 1, 'R12 stays exploded ' + JSON.stringify(r12.counts));
      return ang[0].text + ' in ' + ang[0].block;
    });
    test('rfV: the view kinds are direct code paths: no Drawing._.hook, compute / layout / moveView / addSectionView are plain functions; a typed section\'s parent has only its path line (no straight line drawn and taken off)', function () {
      assert(typeof DW._.hook === 'undefined', '_.hook gone');
      ['compute', 'layout', 'moveView', 'addSectionView'].forEach(function (n) {
        var d = Object.getOwnPropertyDescriptor(DW, n);
        assert(d && typeof d.value === 'function' && !d.get, n + ' is a plain function');
      });
      var dv = Object.getOwnPropertyDescriptor(DW._, 'viewContent');
      assert(dv && typeof dv.value === 'function' && !dv.get, 'viewContent plain');
      var r = rfVDoc('p.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).circle(80, 25, 5).extrude(10);');
      var front = r.doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
      var sv = DW.addSectionView(r.doc, r.mesh, front.id, { axis: 'h', at: 25, sign: 1, type: 'half', c: 50, side: 1 });
      var sh = r.recompute(), pw = sh.views.filter(function (w) { return w.view.id === front.id; })[0];
      var chain = sh.prims.filter(function (p) { return p.layer === pw.layer && p.k === 'line' && p.style === 'chain' && p.view == null; });
      assert(chain.length >= 2 && chain.every(function (p) { return p.cutLine === sv.id; }), 'only the path line: ' + chain.length);
      var letters = sh.prims.filter(function (p) { return p.layer === pw.layer && p.k === 'text' && p.text === sv.label; });
      assert(letters.length === 1 && letters[0].cutLine === sv.id, 'one letter (half section: one arrow) ' + letters.length);
      var bad = null; try { DW.addSectionView(r.doc, r.mesh, front.id, { axis: 'h', at: 25, sign: 1, type: 'offset', jogs: [] }); } catch (e) { bad = e.message; }
      assert(bad && r.doc.views.length === 5, 'a refused type takes the view off again: ' + bad + ', ' + r.doc.views.length + ' views');
      return chain.length + ' path legs';
    });
  })();
  // --- end rfV ---

