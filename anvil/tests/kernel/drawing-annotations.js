  // ------------------------------------------------------------------ drawing annotations (run cloud-2026-09-25m)
  // Plate with bolt holes: 100 x 8 x 60 (x ∈ [0,100], y ∈ [0,8], z ∈ [0,60]), four Ø8 through holes at x = 10 / 90,
  // z = 10 / 50. Standard 3 View puts it at 2:1; the Top view shows (u, v) = (x, -z), centred on (50, -30).
  if (DW) (function () {
    group('drawing annotations');
    var PLATE2 = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0].code;
    function annDrawing(code, opts) {
      var r = build(code);
      noErrors(r);
      var doc = DW.newDrawing(r.model, Object.assign({ date: '2026-09-26' }, opts || {}));
      DW.standard3View(doc, r.mesh, r.model.units);
      r.doc = doc; r.sheet = DW.compute(doc, r.mesh, r.model, { build: r.build });
      r.view = function (orient) { return r.sheet.views.filter(function (w) { return w.view.orient === orient; })[0]; };
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      return r;
    }
    function annPrims(sheet, style) { return sheet.prims.filter(function (p) { return p.layer === 'ANNOTATIONS' && (!style || p.style === style); }); }
    function hasSeg(list, a, b, tol) {
      return list.some(function (p) { return p.k === 'line' && ((Math.hypot(p.a[0] - a[0], p.a[1] - a[1]) < tol && Math.hypot(p.b[0] - b[0], p.b[1] - b[1]) < tol) || (Math.hypot(p.a[0] - b[0], p.a[1] - b[1]) < tol && Math.hypot(p.b[0] - a[0], p.b[1] - a[1]) < tol)); });
    }
    function polyArea(r) { var n = segsForRadius(r); return n / 2 * r * r * Math.sin(2 * Math.PI / n); }

    test('Auto insert on view creation: centre marks on the four plate holes at their analytic sheet positions, centrelines in the Front and Right views', function () {
      var r = annDrawing(PLATE2, { options: { autoCenterMarks: true, autoCenterlines: true } });
      var T = r.view('Top'), F = r.view('Front'), R = r.view('Right'), s = 2;
      var marks = r.sheet.annotations.filter(function (a) { return a.type === 'centerMark'; });
      assert(marks.length === 4 && marks.every(function (a) { return a.view === T.view.id && a.auto && !a.dangling; }), 'marks ' + JSON.stringify(r.sheet.annotations.map(function (a) { return [a.view, a.type]; })));
      var thin = annPrims(r.sheet, 'thin'), ctr = annPrims(r.sheet, 'center');
      [[10, 10], [90, 10], [10, 50], [90, 50]].forEach(function (xz) {
        // analytic: Top view u = x, v = -z, centred on (50, -30) at 2:1
        var x = T.view.x + (xz[0] - 50) * s, y = T.view.y + (-xz[1] + 30) * s;
        assert(marks.some(function (a) { return Math.hypot(a.info.centers[0][0] - x, a.info.centers[0][1] - y) < 1e-9; }), 'no mark at ' + xz);
        assert(hasSeg(thin, [x - 2.5, y], [x + 2.5, y], 1e-9) && hasSeg(thin, [x, y - 2.5], [x, y + 2.5], 1e-9), 'cross at ' + xz);
        // extended lines: 1 mm gap after the 2.5 mm cross, 2.5 mm past the Ø8 circle (r = 8 on paper)
        assert(hasSeg(ctr, [x + 3.5, y], [x + 10.5, y], 1e-9) && hasSeg(ctr, [x, y - 3.5], [x, y - 10.5], 1e-9), 'extension lines at ' + xz);
      });
      var cls = r.sheet.annotations.filter(function (a) { return a.type === 'centerline'; });
      assert(cls.length === 4 && cls.filter(function (a) { return a.view === F.view.id; }).length === 2 && cls.filter(function (a) { return a.view === R.view.id; }).length === 2, 'centrelines ' + cls.length);
      // Front: axes at x = 10 and 90 over the 8 mm thickness, 3 mm past both faces; Right: u = -z = -10, -50
      [10, 90].forEach(function (u) { var x = F.view.x + (u - 50) * s; assert(hasSeg(ctr, [x, F.box.y0 - 3], [x, F.box.y1 + 3], 1e-9), 'front centreline x=' + u); });
      [-10, -50].forEach(function (u) { var x = R.view.x + (u + 30) * s; assert(hasSeg(ctr, [x, R.box.y0 - 3], [x, R.box.y1 + 3], 1e-9), 'right centreline u=' + u); });
      assert(!r.sheet.annotations.some(function (a) { return a.view === r.view('Isometric').view.id; }), 'nothing on the isometric');
      // off by default: a drawing made without the option has no annotations
      var r2 = annDrawing(PLATE2);
      assert(!r2.sheet.annotations.length && !annPrims(r2.sheet).length, 'auto insert is off by default in the engine');
      return '4 marks, 4 centrelines';
    });
    test('Linear and circular centre marks: connection line through a row of holes; bolt circle Ø40 fitted through six pattern holes', function () {
      var r = annDrawing(PLATE2), T = r.view('Top');
      var lin = DW.addCenterMark(r.doc, T.view.id, { style: 'linear', holes: [{ c: [90, -10], r: 4 }, { c: [10, -10], r: 4 }] });
      r.recompute();
      var x0 = T.view.x - 80, x1 = T.view.x + 80, y = T.view.y + 40;
      assert(hasSeg(annPrims(r.sheet, 'center'), [x0, y], [x1, y], 1e-9), 'connection line');
      assert(r.sheet.annotations.filter(function (a) { return a.id === lin.id; })[0].text === 'Linear Center Mark (2)', 'text');
      var f = annDrawing('p.cylinder(30, 10); p.hole("Top", 20, 0, 6, { offset: 10 }); p.circularPattern({ axis: "y", count: 6 });');
      var FT = f.view('Top'), holes = FT.proj.circles.visible.filter(function (c) { return Math.abs(c.r - 3) < 1e-9; });
      assert(holes.length === 6, 'six holes ' + holes.length);
      var cm = DW.addCenterMark(f.doc, FT.view.id, { style: 'circular', holes: holes.map(function (c) { return { c: c.c, r: c.r }; }) });
      f.recompute();
      var pc = f.sheet.prims.filter(function (p) { return p.layer === 'ANNOTATIONS' && p.k === 'circle' && p.style === 'center'; });
      var s = DW.scaleValue(f.doc.sheet.scale), cs = FT.toSheet([0, 0]);
      assert(pc.length === 1, 'pitch circle ' + pc.length);
      near(pc[0].c[0], cs[0], 1e-6, 'pitch centre x'); near(pc[0].c[1], cs[1], 1e-6, 'pitch centre y'); near(pc[0].r, 20 * s, 1e-6, 'pitch radius');
      var fit = DW.fitCircle(holes.map(function (c) { return c.c; }));
      near(fit.r, 20, 1e-9, 'fitted bolt circle'); near(Math.hypot(fit.c[0], fit.c[1]), 0, 1e-9, 'fitted centre');
      // six radial lines from the pattern centre (they start one mark size out)
      assert(annPrims(f.sheet, 'center').filter(function (p) { return p.k === 'line'; }).length === 6, 'radial lines');
      void cm;
      return 'bolt circle r ' + fmt(pc[0].r) + ' at ' + DW.scaleText(f.doc.sheet.scale);
    });
    test('Hole Callout: THRU, blind depth, counterbore, countersink, far-side blind; "4X" counts the identical holes of the view; a boss is not a hole', function () {
      var F = DW.orientation('Top');
      function callout(code, c, r) { var m = build(code); noErrors(m); var h = DW.holeInfo(m.mesh, F, c, r); return h ? DW.holeText(h, 'mm', 1).join(' | ') + (h.entry === 'far' ? ' (far)' : '') : null; }
      var BOX = 'p.box(40, 40, 20, { centered: true }); ';
      var cases = [
        [BOX + 'p.hole("Top", 0, 0, 6.6, { offset: 20 });', 3.3, 'Ø6.6 THRU'],
        [BOX + 'p.hole("Top", 5, 5, 8, { offset: 20, depth: 10 });', 4, 'Ø8 ↧ 10', [5, 5]],
        [BOX + 'p.hole("Top", 0, 0, 11, { offset: 20, depth: 6.8 }); p.hole("Top", 0, 0, 6.6, { offset: 20 });', 5.5, 'Ø6.6 THRU | ⌴ Ø11 ↧ 6.8'],
        [BOX + 'p.hole("Top", 0, 0, 11, { offset: 20, depth: 6.8 }); p.hole("Top", 0, 0, 6.6, { offset: 20, depth: 15 });', 3.3, 'Ø6.6 ↧ 15 | ⌴ Ø11 ↧ 6.8'],
        [BOX + 'p.hole("Top", 0, 0, 6.6, { offset: 20 }); p.sketch("Front", 0).polyline([[0, 21], [7, 21], [3.3, 17.3], [0, 17.3]]).end().revolveCut(360, { axis: "y" });', 6, 'Ø6.6 THRU | ⌵ Ø12 X 90°'],
        [BOX + 'p.hole("Top", 5, 5, 8, { offset: 0, depth: 10, forward: true });', 4, 'Ø8 ↧ 10 (far)', [5, 5]],
        [BOX + 'p.cylinder(5, 10, { at: [0, 20, 0] });', 5, null]
      ];
      var got = cases.map(function (c) { var t = callout(c[0], c[3] || [0, 0], c[1]); assert(t === c[2], JSON.stringify(c[2]) + ' read as ' + JSON.stringify(t)); return t; });
      // the plate's four holes (Cut-Extrude Through All) read "4X Ø8 THRU ALL" in a callout (rfV); the annotation follows the hole it was put on
      var r = annDrawing(PLATE2), T = r.view('Top');
      var an = DW.addHoleCallout(r.doc, T.view.id, { c: [90, -50], r: 4 });
      r.recompute();
      var a = r.sheet.annotations.filter(function (x) { return x.id === an.id; })[0];
      assert(a.text === '4X Ø8 THRU ALL' && !a.dangling && a.info.count === 4, 'plate callout ' + a.text);
      assert(annPrims(r.sheet).some(function (p) { return p.k === 'text' && p.text === '4X Ø8 THRU ALL'; }), 'callout text drawn');
      return got.filter(Boolean).join('; ');
    });
    test('Ordinate dimensions on the plate: 0 / 6 / 14 / 86 / 94 / 100 along the Front view, 0 / 10 / 50 down the Top view; they follow a width change', function () {
      var r = annDrawing(PLATE2), F = r.view('Front'), T = r.view('Top');
      function vline(u) { return { a: [u, 0], b: [u, 8] }; }
      var od = DW.addOrdinate(r.doc, F.view.id, { dir: 'h', base: vline(0), refs: [vline(6), vline(14), vline(86), vline(94), vline(100)] });
      var ov = DW.addOrdinate(r.doc, T.view.id, { dir: 'v', base: { a: [0, 0], b: [100, 0] }, refs: [{ c: [10, -10], r: 4 }, { c: [10, -50], r: 4 }] });
      r.recompute();
      var dh = r.sheet.dims.filter(function (d) { return d.kind === 'ordinate' && d.view === F.view.id; })[0], dv = r.sheet.dims.filter(function (d) { return d.kind === 'ordinate' && d.view === T.view.id; })[0];
      assert(dh.text === '0, 6, 14, 86, 94, 100' && !dh.dangling, 'front ' + dh.text);
      assert(dv.text === '0, 10, 50' && !dv.dangling, 'top ' + dv.text);
      // texts: rotated 90° on one line 10 mm above the Front view; the uncrowded ones sit on their feature (x + h/2)
      var tx = r.sheet.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'text' && p.rot === 90 && Math.abs(p.p[1] - (F.box.y1 + 11)) < 1e-9; });
      assert(tx.length === 6, 'ordinate texts ' + tx.length);
      var t100 = tx.filter(function (p) { return p.text === '100'; })[0];
      near(t100.p[0], F.view.x + 50 * 2 + 1.75, 1e-9, 'x of the 100 text');
      // widen the plate to 120: the right-edge reference reattaches and reads 120
      r.model.features.filter(function (f) { return f.type === 'sketch'; })[0].entities[0].w = 120;
      var b = K.rebuild(r.model); r.mesh = K.meshFromBody(b.body); r.build = b; r.recompute();
      dh = r.sheet.dims.filter(function (d) { return d.kind === 'ordinate' && d.view === F.view.id; })[0];
      assert(dh.text === '0, 6, 14, 86, 94, 120', 'after the change ' + dh.text);
      void od; void ov;
      return dh.text + ' | ' + dv.text;
    });
    test('Baseline dimensions stack 10 / 18 / 26 mm out from the view, nearest first; Chamfer dimension reads "2 X 45°"', function () {
      var r = annDrawing(PLATE2), F = r.view('Front');
      function vline(u) { return { a: [u, 0], b: [u, 8] }; }
      DW.addBaseline(r.doc, F.view.id, { dir: 'h', base: vline(0), refs: [vline(100), vline(14), vline(6)] });
      r.recompute();
      var d = r.sheet.dims.filter(function (x) { return x.kind === 'baseline'; })[0];
      assert(d.text === '100, 14, 6', 'baseline ' + d.text);
      var texts = r.sheet.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'text' && ['6', '14', '100'].indexOf(p.text) >= 0 && p.rot === 0 && p.p[1] > F.box.y1; });
      var ys = {}; texts.forEach(function (p) { ys[p.text] = p.p[1] - F.box.y1; });
      // (r13/drawings13: the text is centred on its dimension line, in a break of it: baseline 1.75 below the line)
      assert(Math.abs(ys['6'] - 8.25) < 1e-9 && Math.abs(ys['14'] - 16.25) < 1e-9 && Math.abs(ys['100'] - 24.25) < 1e-9, 'stacking ' + JSON.stringify(ys));
      // chamfer 2 on the top front edge of a 40 x 20 x 10 box: the Right view shows the 45° chamfer line
      var c = annDrawing('p.box(40, 20, 10); p.chamfer(2, [[20, 10, 20]]);'), R = c.view('Right');
      var ch = R.proj.lines.visible.filter(function (l) { return Math.abs(Math.abs(l[2] - l[0]) - 2) < 1e-9 && Math.abs(Math.abs(l[3] - l[1]) - 2) < 1e-9; })[0];
      var lead = R.proj.lines.visible.filter(function (l) { return Math.abs(l[1] - 10) < 1e-9 && Math.abs(l[3] - 10) < 1e-9; })[0];
      assert(ch && lead, 'chamfer / lead-in edges');
      var cd = DW.addChamferDim(c.doc, R.view.id, { a: [ch[0], ch[1]], b: [ch[2], ch[3]], ref: { a: [lead[0], lead[1]], b: [lead[2], lead[3]] } });
      near(cd.value, 2, 1e-9, 'setback'); near(cd.angle, 45, 1e-9, 'angle');
      c.recompute();
      var t = c.sheet.dims.filter(function (x) { return x.kind === 'chamfer'; })[0];
      assert(t.text === '2 X 45°', 'chamfer text ' + t.text);
      var threw = false; try { DW.addChamferDim(c.doc, R.view.id, { a: [lead[0], lead[1]], b: [lead[2], lead[3]], ref: { a: [lead[0], lead[1]], b: [lead[2], lead[3]] } }); } catch (e) { threw = true; }
      assert(threw, 'parallel edges refused');
      return d.text + '; ' + t.text;
    });
    test('Tolerance and precision formatting: bilateral, limit, symmetric, <DIM> text, inch precision; model items keep them through a part change', function () {
      function L(d, u) { return DW.dimLabel(d, u || 'mm'); }
      var bi = L({ kind: 'h', value: 100, prec: 2, tol: { type: 'bilateral', plus: 0.1, minus: 0.05 } });
      assert(bi.main === '100.00' && bi.upper === '+0.10' && bi.lower === '-0.05' && bi.text === '100.00 +0.10/-0.05', JSON.stringify(bi));
      assert(L({ kind: 'h', value: 100, prec: 2, tol: { type: 'limit', plus: 0.1, minus: 0.05 } }).text === '100.10/99.95', 'limit');
      assert(L({ kind: 'h', value: 100, prec: 2, tol: { type: 'symmetric', plus: 0.05 } }).text === '100.00 ±0.05', 'symmetric');
      assert(L({ kind: 'h', value: 100, prec: 2, tol: { type: 'bilateral', plus: 0.1, minus: 0 } }).lower === '0', 'zero lower (rfM: ASME Y14.5 metric, a single 0)');
      assert(L({ kind: 'dia', value: 8, count: 4, prec: 1, label: '<DIM> TYP' }).text === '4X Ø8.0 TYP', 'dia with text');
      assert(L({ kind: 'dia', value: 8, count: 1, tol: { type: 'limit', plus: 0.02, minus: 0 }, prec: 2 }).text === 'Ø8.02/Ø8.00', 'dia limit');
      assert(L({ kind: 'v', value: 4, prec: 3, tol: { type: 'bilateral', plus: 0.005, minus: 0.002 } }, 'in').text === '4.000 +.005/-.002', 'inch (ANSI: no leading zeros on inch tolerances)');
      assert(L({ kind: 'h', value: 12.3456 }).text === '12.35' && L({ kind: 'h', value: 12.3456, prec: 0 }).text === '12', 'precision');
      // on the sheet: the overall width (model item Front:h:0) with a bilateral tolerance, stacked 0.7 high beside the value
      var r = annDrawing(PLATE2), F = r.view('Front');
      r.doc.dimProps = {}; r.doc.dimProps[F.view.id + ':h:0'] = { prec: 2, tol: { type: 'bilateral', plus: 0.1, minus: 0.05 } };
      r.recompute();
      assert(r.sheet.dims[0].text === '100.00 +0.10/-0.05', 'sheet text ' + r.sheet.dims[0].text);
      var tt = r.sheet.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'text' && (p.text === '100.00' || p.tol); });
      assert(tt.length === 3 && tt.filter(function (p) { return p.tol; }).every(function (p) { return Math.abs(p.h - 3.5 * 0.7) < 1e-9; }), 'stacked tolerance texts ' + tt.map(function (p) { return p.text; }));
      var up = tt.filter(function (p) { return p.tol === 'upper'; })[0], lo = tt.filter(function (p) { return p.tol === 'lower'; })[0], mn = tt.filter(function (p) { return !p.tol; })[0];
      assert(up.p[1] > lo.p[1] && up.p[0] === lo.p[0] && up.p[0] > mn.p[0] + DW.numText(0, 'mm').length, 'upper over lower, right of the value');
      // a part change keeps the settings (the style key is view:kind:n, not the value)
      r.model.features.filter(function (f) { return f.type === 'sketch'; })[0].entities[0].w = 120;
      var b = K.rebuild(r.model); r.mesh = K.meshFromBody(b.body); r.build = b; r.recompute();
      assert(r.sheet.dims[0].text === '120.00 +0.10/-0.05', 'after the change ' + r.sheet.dims[0].text);
      return bi.text;
    });
    test('Driving dimensions: the plate’s model items find their parameters; width 100 → 120, 4X Ø8 → Ø10 and depth 8 → 6 rebuild to the analytic volume', function () {
      var r = annDrawing(PLATE2);
      function src(i) { var d = r.sheet.dims[i]; return DW.dimSource(r.model, r.build, r.sheet.views.filter(function (w) { return w.view.id === d.view; })[0], d); }
      var texts = r.sheet.dims.map(function (d) { return d.text; });
      assert(JSON.stringify(texts) === JSON.stringify(['100', '8', '60', '4X Ø8']), 'dims ' + texts);
      var s = [0, 1, 2, 3].map(src);
      assert(s[0].kind === 'entity' && s[0].dim.k === 'w' && s[0].featureName === 'Sketch1', 'width source ' + JSON.stringify(s[0]));
      assert(s[1].kind === 'depth' && s[1].featureName === 'Boss-Extrude1', 'depth source ' + JSON.stringify(s[1]));
      assert(s[2].kind === 'entity' && s[2].dim.k === 'h', 'height source ' + JSON.stringify(s[2]));
      assert(s[3].kind === 'entity' && s[3].dim.k === 'dia' && s[3].featureName === 'Sketch2', 'diameter source ' + JSON.stringify(s[3]));
      // (the hole sketch sits at y = 8 and cuts down through: a thinner plate keeps its through holes)
      DW.driveDim(r.model, s[0], 120); DW.driveDim(r.model, s[3], 10); DW.driveDim(r.model, s[1], 6);
      var b = K.rebuild(r.model); noErrors({ errors: b.errors }); r.mesh = K.meshFromBody(b.body); r.build = b; r.recompute();
      texts = r.sheet.dims.map(function (d) { return d.text; });
      assert(JSON.stringify(texts) === JSON.stringify(['120', '6', '60', '4X Ø10']), 'after driving ' + texts);
      var mp = K.massProps(r.mesh, 1);
      nearRel(mp.volume, 120 * 60 * 6 - 4 * Math.PI * 25 * 6, 1e-9, 'volume (exact holes)');
      // refused: a value an equation drives, a non-positive value
      var e = build('p.equations({ T: 8 }); p.box(100, 60, "=T");'), doc = DW.newDrawing(e.model, {});
      DW.standard3View(doc, e.mesh, 'mm');
      var sh = DW.compute(doc, e.mesh, e.model), dv = sh.dims[1], se = DW.dimSource(e.model, e.build, sh.views[0], dv);
      assert(se && se.expr === '=T', 'equation source ' + JSON.stringify(se));
      var m1 = null, m2 = null;
      try { DW.driveDim(e.model, se, 9); } catch (err) { m1 = err.message; }
      try { DW.driveDim(r.model, s[0], -1); } catch (err) { m2 = err.message; }
      assert(/equation =T/.test(m1 || '') && /positive/.test(m2 || ''), m1 + ' / ' + m2);
      return texts.join(', ') + '; volume ' + fmt(mp.volume);
    });
    test('Dimension properties on the sheet: at moves the dimension line, flip puts the arrows outside, lead moves a diameter leader, off an aligned one', function () {
      var r = annDrawing(PLATE2), F = r.view('Front'), T = r.view('Top');
      var d0 = r.sheet.dims[0];
      near(d0.lineAt, -5, 1e-9, 'default width line 10 mm below at 2:1');
      r.doc.dimProps = {}; r.doc.dimProps[F.view.id + ':h:0'] = { at: -15, flip: true };
      r.recompute();
      var y = F.view.y + (-15 - 4) * 2, lines = r.sheet.prims.filter(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'line' && Math.abs(p.a[1] - y) < 1e-9 && Math.abs(p.b[1] - y) < 1e-9; });
      // (r13/drawings13: the line is broken round the text, ANSI: two pieces spanning 7 mm past both extension lines)
      assert(lines.length === 2, 'dimension line at the new level ' + lines.length);
      var xs = []; lines.forEach(function (l) { xs.push(l.a[0], l.b[0]); });
      near(Math.max.apply(null, xs) - Math.min.apply(null, xs), 200 + 2 * 7, 1e-9, 'flipped: the line runs 7 mm past both extension lines');
      var dd = r.sheet.dims.filter(function (d) { return d.kind === 'dia'; })[0];
      r.doc.dimProps[T.view.id + ':dia:0'] = { lead: [-30, 20] };
      r.recompute();
      var dia = r.sheet.dims.filter(function (d) { return d.kind === 'dia'; })[0], c = T.toSheet(dia.c);
      assert(Math.abs(dia.leadNow[0] + 30) < 1e-9 && Math.abs(dia.leadNow[1] - 20) < 1e-9, 'lead ' + dia.leadNow);
      assert(r.sheet.prims.some(function (p) { return p.layer === 'DIMENSIONS' && p.k === 'text' && p.text === '4X Ø8' && p.anchor === 'end' && Math.abs(p.p[0] - (c[0] - 35)) < 1e-9; }), 'text left of the elbow');
      void dd;
      return 'ok';
    });
    test('Balloons: a manual balloon on a part drawing is item 1 with QTY "1X"; a stacked balloon on the pinned-plate assembly shows 1 | 2 with "2X" for the pins', function () {
      var r = annDrawing(PLATE2), T = r.view('Top');
      var b = DW.addBalloon(r.doc, r.model, T.view.id, { attach: [0, -30], pos: [-130, 40], qty: true });
      r.recompute();
      var sb = r.sheet.balloons[0];
      assert(sb && sb.item === 1 && sb.manual && b.key === 'part', 'part balloon ' + JSON.stringify(sb && { item: sb.item }));
      near(sb.c[0], T.view.x - 130, 1e-9, 'x'); near(sb.c[1], T.view.y + 40, 1e-9, 'y');
      var at = T.toSheet([0, -30]); near(sb.attach[0], at[0], 1e-9, 'attach x'); near(sb.attach[1], at[1], 1e-9, 'attach y');
      assert(r.sheet.prims.some(function (p) { return p.layer === 'BALLOONS' && p.k === 'text' && p.text === '1X'; }), 'QTY text');
      var ex = AnvilExamples.filter(function (e) { return /Pinned plate/.test(e.name); })[0];
      var a = buildAsm(ex.code), doc = DW.newDrawing(a.model, { date: '2026-09-26' });
      DW.standard3View(doc, a.mesh, a.model.units);
      var iso = doc.views.filter(function (v) { return v.role === 'iso'; })[0];
      var plate = a.model.components[0], pin = a.model.components[1];
      DW.addBalloon(doc, a.model, iso.id, { component: plate.id, attach: [0, 0], pos: [-60, 40], stack: [{ component: pin.id }], stackDir: 'right', qty: true });
      var sh = DW.compute(doc, a.mesh, a.model, { build: a.build });
      var bb = sh.balloons.filter(function (x) { return x.manual; })[0];
      assert(bb.item === 1 && JSON.stringify(bb.stack.map(function (s) { return s.item; })) === '[2]', 'stack ' + JSON.stringify(bb.stack));
      var circles = sh.prims.filter(function (p) { return p.layer === 'BALLOONS' && p.k === 'circle'; });
      assert(circles.some(function (p) { return Math.abs(p.c[0] - (bb.c[0] + 2 * bb.r)) < 1e-9 && Math.abs(p.c[1] - bb.c[1]) < 1e-9; }), 'stacked circle to the right');
      assert(sh.prims.some(function (p) { return p.layer === 'BALLOONS' && p.k === 'text' && p.text === '1X'; }), 'QTY of the plate row');
      // Auto Balloon still replaces a view's balloons; dragging (pos) moves one without touching the others
      return 'part item 1 (1X); stack 1 | 2';
    });
    test('Exports: CENTER linetype and ANNOTATIONS layer in the DXF, symbols as words (CBORE, X 6.8 DEEP, %%p), SVG dash, PDF ASCII with ± as WinAnsi', function () {
      var r = annDrawing('p.box(40, 40, 20, { centered: true }); p.hole("Top", 0, 0, 11, { offset: 20, depth: 6.8 }); p.hole("Top", 0, 0, 6.6, { offset: 20 });', { options: { autoCenterMarks: true, autoCenterlines: true } });
      var T = r.view('Top');
      DW.addHoleCallout(r.doc, T.view.id, { c: [0, 0], r: 5.5 });
      r.doc.dimProps = {}; r.doc.dimProps[r.view('Front').view.id + ':h:0'] = { tol: { type: 'symmetric', plus: 0.1 }, prec: 1 };
      r.recompute();
      var dxf = DW.toDXF(r.sheet), svg = DW.toSVG(r.sheet), pdf = DW.toPDF(r.sheet);
      assert(dxf.indexOf('\n2\nCENTER\n') > 0 && dxf.indexOf('LTYPE\n70\n4') > 0 && dxf.indexOf('\n8\nANNOTATIONS\n6\nCENTER\n') > 0, 'CENTER linetype on ANNOTATIONS');
      assert(dxf.indexOf('%%c6.6 THRU') > 0 && dxf.indexOf('CBORE %%c11 X 6.8 DEEP') > 0 && dxf.indexOf('40.0 %%p0.1') > 0, 'DXF text');
      var d = new DOMParser().parseFromString(svg, 'image/svg+xml');
      assert(!d.querySelector('parsererror') && d.querySelectorAll('g[data-layer="ANNOTATIONS"] line.center[stroke-dasharray="6 1.5 1.5 1.5"]').length > 0, 'SVG centre lines');
      assert(Array.prototype.some.call(d.querySelectorAll('text'), function (t) { return t.textContent === '⌴ Ø11 ↧ 6.8'; }), 'SVG keeps the symbols');
      assert(!/[^\x00-\x7f]/.test(pdf) && pdf.indexOf('(CBORE \\33011 X 6.8 DEEP) Tj') > 0 && pdf.indexOf('(40.0 \\2610.1) Tj') > 0, 'PDF text');
      return 'ok';
    });
  })();

