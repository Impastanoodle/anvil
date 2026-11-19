  // --- rfQG (2026-11-19, lane drawflow7: a detail print dimensioned by hand): a Baseline set with no room above its
  // view goes under it; its spacing (step) re-spaces every line ---
  (function () {
    group('rfQG: Baseline set: past the border above its view it goes under the view when the whole set fits there; step spaces the lines evenly');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, IN = 25.4;
    function rfQGPlate() {
      return build('p.units("in");\nvar s = p.sketch("Top").rect(0, -3, 6, 3);\ns.end().extrude(0.1);\n' +
        'p.sketch("Top", 0.1).circle(1.5, -0.75, 0.14).circle(4.5, -0.75, 0.14).cut("through", { reverse: true });');
    }
    function rfQGSet(doc, id) {
      return DW.addBaseline(doc, id, { dir: 'h', base: { a: [0, 0], b: [0, -3] }, refs: [{ kind: 'dia', c: [1.5, -0.75], r: 0.14 }, { kind: 'dia', c: [4.5, -0.75], r: 0.14 }, { a: [6, 0], b: [6, -3] }] });
    }
    function rfQGLines(sheet, ix) {
      return sheet.prims.filter(function (p) { return p.dimIx === ix && p.k === 'line' && Math.abs(p.a[1] - p.b[1]) < 1e-9; }).map(function (p) { return p.a[1]; });
    }
    test('a Top view 0.4 in under the border: the set goes under the view, inside the border (its lines ran off the sheet)', function () {
      var r = rfQGPlate(); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      doc.autoDims = false;
      var v = DW.addView(doc, 'Top', { x: 8, y: 9.1 });
      rfQGSet(doc, v.id);
      var sh = DW.compute(doc, r.mesh, r.model), w = sh.views[0], ix = sh.dims.length - 1, d = sh.dims[ix];
      assert(d.kind === 'baseline', d.kind);
      var ys = rfQGLines(sh, ix), texts = sh.prims.filter(function (p) { return p.k === 'text' && p.dimIx === ix; }).map(DW.textRect);
      assert(ys.every(function (y) { return y < w.box.y0; }), 'under the view: ' + ys.map(fmt).join(' ') + ' / ' + fmt(w.box.y0));
      assert(texts.every(function (t) { return t.y1 < sh.size[1] - 10 / IN && t.y0 > 10 / IN; }), 'inside the border');
      assert(d.blPos.length === 3 && Math.abs((d.blPos[1] - d.blPos[0]) - (d.blPos[2] - d.blPos[1])) < 1e-9 && Math.abs(Math.abs(d.blPos[1] - d.blPos[0]) - 8 / IN) < 1e-9, 'equal 8 mm: ' + d.blPos.map(fmt).join(' '));
      return 'lines ' + ys.map(fmt).join(' ');
    });
    test('a Front view under it: no room above at 8 mm, so the set is kept inside the sheet border (rfQN)', function () {
      var r = rfQGPlate(); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      doc.autoDims = false;
      var v = DW.addView(doc, 'Top', { x: 8, y: 9.1 });
      DW.addView(doc, 'Front', { x: 8, y: 8.2 });
      rfQGSet(doc, v.id);
      var sh = DW.compute(doc, r.mesh, r.model), w = sh.views.filter(function (x) { return x.view.id === v.id; })[0], ix = sh.dims.length - 1;
      // (rfQN) it stayed above, running past the border. Neither side fits at 8 mm here (this fixture's Front view
      // overlaps the Top view), so the set goes to the side with more room, under the view, closed up and warned
      var ys = rfQGLines(sh, ix), texts = sh.prims.filter(function (p) { return p.k === 'text' && p.dimIx === ix; }).map(DW.textRect), b = 10 / IN;
      assert(ys.every(function (y) { return y > b && y < sh.size[1] - b; }), 'lines inside the border: ' + ys.map(fmt).join(' '));
      assert(texts.every(function (t) { return t.y1 < sh.size[1] - b && t.y0 > b; }), 'values inside the border');
      assert((sh.warnings || []).some(function (x) { return /Baseline set/.test(x); }), 'warned');
      return 'lines ' + ys.map(fmt).join(' ');
    });
    test('step (paper mm) spaces every line of the set: 12 mm', function () {
      var r = rfQGPlate(); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      doc.autoDims = false;
      var v = DW.addView(doc, 'Top', { x: 8, y: 4 });
      rfQGSet(doc, v.id);
      DW.setDimProps(DW.findView(doc, v.id).dims[0], { step: 12 });
      var sh = DW.compute(doc, r.mesh, r.model), d = sh.dims[sh.dims.length - 1];
      assert(Math.abs(d.blPos[1] - d.blPos[0] - 12 / IN) < 1e-9 && Math.abs(d.blPos[2] - d.blPos[1] - 12 / IN) < 1e-9, d.blPos.map(fmt).join(' '));
      var back = JSON.parse(JSON.stringify(DW.findView(doc, v.id).dims[0]));
      assert(back.step === 12, 'kept in the file');
      return d.blPos.map(fmt).join(' ');
    });

    group('rfQG: Break Lines: a dimension\'s extension lines cut a gap each side where they cross another dimension\'s line or arrow; arrows only; its own gap; the document gap; R2000 writes it as a DIMENSION (rfQK)');
    function rfQGBreakDoc(props, opts) {
      var r = rfQGPlate(); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      doc.autoDims = false;
      if (opts) Object.assign(doc.options || (doc.options = {}), opts);
      var v = DW.addView(doc, 'Top', { x: 6, y: 5 }), vd = DW.findView(doc, v.id);
      var A = DW.smartDim({ point: [6, 0] }, { point: [6, -3] }, [6.5, -1.5], { lock: 'v', scale: 1 });
      var B = DW.smartDim({ point: [4.5, -0.75] }, { point: [4.5, 0] }, [7.2, -0.4], { lock: 'v', scale: 1 });
      DW.setDimProps(B, props || {});
      vd.dims = [A, B];
      var sh = DW.compute(doc, r.mesh, r.model), w = sh.views[0];
      return { sh: sh, w: w, x6: w.toSheet([6.5, 0])[0], lines: sh.prims.filter(function (p) { return p.dimIx === 1 && p.k === 'line' && Math.abs(p.a[1] - p.b[1]) < 1e-9; }) };
    }
    function rfQGGaps(o) {
      // the pieces of B's two extension lines nearest the crossing at A's line: the gap's two edges
      return o.lines.map(function (p) { return Math.min(Math.abs(p.a[0] - o.x6), Math.abs(p.b[0] - o.x6)); }).filter(function (g) { return g < 0.3; }).sort();
    }
    test('off: the two extension lines run whole through the 4.5 hole line\'s and the top edge\'s crossing with the 3.000', function () {
      var o = rfQGBreakDoc({});
      assert(o.lines.length === 2 && o.lines.every(function (p) { return Math.min(p.a[0], p.b[0]) < o.x6 && Math.max(p.a[0], p.b[0]) > o.x6; }), 'whole');
      return o.lines.length + ' lines';
    });
    test('Break Lines: both lines cut .0625 each side of the 3.000\'s line (the top one through its arrow tip); R2000 writes a DIMENSION for it (rfQK)', function () {
      var o = rfQGBreakDoc({ brk: true }), g = rfQGGaps(o);
      assert(o.lines.length === 4 && g.length === 4 && g.every(function (x) { return Math.abs(x - 0.0625) < 1e-9; }), 'gaps ' + g.map(fmt).join(' '));
      var dxf = DW.toDXF(o.sh, { version: 'R2000' }), n = (dxf.match(/\n0\nDIMENSION\n/g) || []).length;
      assert(n === 2, 'a DIMENSION each (rfQK: the block of the .750 holds the cut lines): ' + n);
      return g.map(fmt).join(' ');
    });
    test('Break around dimension arrows only: the line through the arrow is cut, the one across the plain line is not', function () {
      var o = rfQGBreakDoc({ brk: 'arrows' }), top = o.w.toSheet([0, 0])[1];
      var onTop = o.lines.filter(function (p) { return Math.abs(p.a[1] - top) < 1e-9; }), hole = o.lines.filter(function (p) { return Math.abs(p.a[1] - top) > 1e-9; });
      assert(onTop.length === 2 && hole.length === 1, onTop.length + ' / ' + hole.length);
      var gt = onTop.map(function (p) { return Math.min(Math.abs(p.a[0] - o.x6), Math.abs(p.b[0] - o.x6)); }).sort();
      // the arrow runs .125 down the 3.000's line from its tip: the gap is the tip ± .0625 along the extension line
      assert(gt.every(function (x) { return Math.abs(x - 0.0625) < 1e-9; }), 'arrow gap ' + gt.map(fmt).join(' '));
      return 'arrow only';
    });
    test('its own gap .1 (Dimension PM), and the document gap .03 (Document Properties)', function () {
      var g1 = rfQGGaps(rfQGBreakDoc({ brk: true, brkGap: 0.1 })), g2 = rfQGGaps(rfQGBreakDoc({ brk: true }, { dimBreakGap: 0.03 }));
      assert(g1.length === 4 && g1.every(function (x) { return Math.abs(x - 0.1) < 1e-9; }), 'own ' + g1.map(fmt).join(' '));
      assert(g2.length === 4 && g2.every(function (x) { return Math.abs(x - 0.03) < 1e-9; }), 'doc ' + g2.map(fmt).join(' '));
      assert(DW.dimBreakGap({ units: 'in' }) === 0.0625 && DW.dimBreakGap({ units: 'mm' }) === 1.5, 'defaults');
      return 'ok';
    });

    group('rfQG: Center Dimension: the value stays in the middle whatever tx says');
    test('a value dragged .5 off centre (tx) is drawn in the middle with centre: true', function () {
      var r = rfQGPlate(); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      doc.autoDims = false;
      var v = DW.addView(doc, 'Top', { x: 6, y: 5 }), vd = DW.findView(doc, v.id);
      var A = DW.smartDim({ point: [0, 0] }, { point: [6, 0] }, [3, 0.6], { lock: 'h', scale: 1 });
      DW.setDimProps(A, { tx: 0.5 });
      vd.dims = [A];
      var s1 = DW.compute(doc, r.mesh, r.model), t1 = s1.dims[0].txNow;
      DW.setDimProps(vd.dims[0], { centre: true });
      var s2 = DW.compute(doc, r.mesh, r.model), t2 = s2.dims[0].txNow;
      assert(Math.abs(t1 - 0.5) < 1e-9 && Math.abs(t2) < 1e-9, t1 + ' -> ' + t2);
      return t1 + ' -> ' + t2;
    });

    group('rfQG: a foreshortened radius, a virtual sharp, a bend\'s tangent edge (detail print of a 14 ga bracket)');
    var QT = 0.0747;
    function rfQGBracket(width) {
      var W6 = width || 6;
      return build('p.name("DET-BRKT").units("in");\np.sheet(' + QT + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, ' + W6 + ', 3).end().baseFlange();\n' +
        'var RA = 22.6, A0 = Math.atan2(22.4, 3) * 180 / Math.PI;\np.sketch("Top", ' + QT + ').arc(3, -25.4, RA, A0, 180 - A0).line(0, -3, 6, -3).cut("through", { reverse: true });\n' +
        'p.flange(1.5, [[' + W6 + ', ' + QT + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
        'p.flange(1, [[0, ' + QT + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n');
    }
    function rfQGSheet(r, fill) {
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      doc.autoDims = false;
      DW.standard3View(doc, r.mesh, r.model.units);
      fill(doc);
      return { doc: doc, sheet: DW.compute(doc, r.mesh, r.model) };
    }
    function rfQGVid(doc, orient) { return doc.views.filter(function (v) { return v.orient === orient; })[0].id; }
    test('Foreshortened R22.600 (Top view, centre 22 in off the view): a zigzag line from a false centre 20 mm in, the arrow on the arc\'s middle, the value past the false centre; a DIMENSION in R2000 (rfQK)', function () {
      var r = rfQGBracket(); noErrors(r);
      var o = rfQGSheet(r, function (doc) {
        var d = DW.smartDim({ arc: { c: [3, -25.4], r: 22.6, a0: 82.37, a1: 97.63 } }, null, [4, -2.2], { scale: 1 });
        d.fs = true; DW.findView(doc, rfQGVid(doc, 'Top')).dims = [d];
      });
      var sh = o.sheet, d = sh.dims[0], w = sh.views.filter(function (x) { return x.view.orient === 'Top'; })[0];
      assert(d.kind === 'rad' && d.text === 'R22.600', d.kind + ' ' + d.text);
      var P = sh.prims.filter(function (p) { return p.dimIx === 0; }), L = P.filter(function (p) { return p.k === 'line'; }), tip = w.toSheet([3, -2.8]);
      assert(L.length === 5, 'F, zigzag (3), on to the arc: ' + L.length);
      var ar = P.filter(function (p) { return p.k === 'fill'; })[0];
      assert(ar && Math.hypot(ar.pts[0][0] - tip[0], ar.pts[0][1] - tip[1]) < 1e-9 && ar.pts[1][1] < tip[1], 'arrow on the arc from the centre side');
      var F = L[0].a;
      assert(Math.abs(F[0] - tip[0]) < 1e-9 && Math.abs(tip[1] - F[1] - 20 / IN) < 1e-9, 'false centre 20 mm in: ' + fmt(tip[1] - F[1]));
      var t = P.filter(function (p) { return p.k === 'text'; })[0];
      assert(t && t.p[1] < F[1], 'value past the false centre');
      var dxf = DW.toDXF(sh, { version: 'R2000' });
      assert(/\n0\nDIMENSION\n/.test(dxf) && /R22\.600/.test(dxf), 'a DIMENSION in R2000 (rfQK: its block draws the zigzag)');
      return 'F ' + F.map(fmt).join(',');
    });
    test('Foreshortened with its false centre dragged aside (d.lead): a slanted jog joins the radius; the arrow stays on the arc', function () {
      var r = rfQGBracket(); noErrors(r);
      var o = rfQGSheet(r, function (doc) {
        var d = DW.smartDim({ arc: { c: [3, -25.4], r: 22.6, a0: 82.37, a1: 97.63 } }, null, [4, -2.2], { scale: 1 });
        d.fs = true; d.lead = [0.6, 22.6 - 0.8]; DW.findView(doc, rfQGVid(doc, 'Top')).dims = [d];
      });
      var sh = o.sheet, w = sh.views.filter(function (x) { return x.view.orient === 'Top'; })[0], L = sh.prims.filter(function (p) { return p.dimIx === 0 && p.k === 'line'; }), tip = w.toSheet([3, -2.8]);
      assert(L.length === 3 && Math.abs(L[0].a[0] - (tip[0] + 0.6)) < 1e-9 && Math.abs(L[2].b[0] - tip[0]) < 1e-9 && Math.abs(L[2].b[1] - tip[1]) < 1e-9, JSON.stringify(L.map(function (l) { return [l.a, l.b]; })));
      return 'ok';
    });
    test('a virtual sharp at the right bend\'s outside corner (Find Intersection: base bottom x flange outside) to the left flange: 6.000 with a witness line on each edge; the part 7 wide reads 7.000', function () {
      var r = rfQGBracket(); noErrors(r);
      var spec = function (doc) {
        var d = DW.smartDim({ point: [6, 0], vsharp: [[[0.1347, 0], [5.8653, 0]], [[6, 0.1347], [6, 1.5]]] }, { edge: [[0, -0.9253], [0, -0.1347]] }, [3, 2.2], { scale: 1, lock: 'h' });
        DW.findView(doc, rfQGVid(doc, 'Front')).dims = [d];
      };
      var o = rfQGSheet(r, spec), d = o.sheet.dims[0];
      assert(d.text === '6.000' && d.refs[0].vs, d.text);
      var wl = o.sheet.prims.filter(function (p) { return p.dimIx === 0 && p.vsharp; });
      var w = o.sheet.views.filter(function (x) { return x.view.orient === 'Front'; })[0], S = w.toSheet([6, 0]);
      assert(wl.length === 2 && wl.every(function (l) { return Math.hypot(l.b[0] - S[0], l.b[1] - S[1]) - 0.125 < 1e-9 && Math.abs(Math.hypot(l.b[0] - S[0], l.b[1] - S[1]) - 0.125) < 1e-9; }), 'witness lines to .125 past the sharp');
      var r7 = rfQGBracket(7); noErrors(r7);
      var s7 = DW.compute(o.doc, r7.mesh, r7.model), d7 = s7.dims[0];
      assert(d7.text === '7.000' && !d7.dangling, 'followed: ' + d7.text + (d7.dangling ? ' dangling' : ''));
      return d.text + ' -> ' + d7.text;
    });
    test('the bend\'s tangent edge in the Right view (Tangent Edges Visible) to the flange top: 1.365, still 1.365 after a recompute (it went to the silhouette, 1.500)', function () {
      var r = rfQGBracket(); noErrors(r);
      var o = rfQGSheet(r, function (doc) {
        var id = rfQGVid(doc, 'Right'); DW.findView(doc, id).tangent = 'visible';
        var d = DW.smartDim({ edge: [[-3, 0.1347], [0, 0.1347]] }, { edge: [[-2.9, 1.5], [0, 1.5]] }, [0.6, 0.8], { scale: 1 });
        DW.findView(doc, id).dims = [d];
      });
      assert(o.sheet.dims[0].text === '1.365', o.sheet.dims[0].text);
      var s2 = DW.compute(o.doc, r.mesh, r.model);
      assert(s2.dims[0].text === '1.365' && !s2.dims[0].dangling, s2.dims[0].text);
      return '1.365';
    });
  })();
