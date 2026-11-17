  // --- rfNL (2026-11-16, lane NL: drawing leftovers and views audit, test-reports/2026-11-16-drawing-views.md) ---
  (function () {
    group('rfNL: drawing leftovers (a deleted hole’s diameter dangles, explode lines, oblique holes) and views');
    var DW = Drawing;
    function rfNLDrawing(code) {
      var r = build(code); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-16' });
      DW.standard3View(doc, r.mesh, r.model.units);
      r.doc = doc; r.sheet = DW.compute(doc, r.mesh, r.model);
      r.view = function (o) { return r.sheet.views.filter(function (w) { return w.view.orient === o; })[0]; };
      r.redo = function (code2) { var n = build(code2); noErrors(n); r.mesh = n.mesh; r.model = n.model; r.sheet = DW.compute(r.doc, r.mesh, r.model); return r.sheet; };
      return r;
    }
    test('a diameter on a hole that is deleted dangles (it jumped to the next hole of the same size); a hole that moves is still followed; undo reattaches', function () {
      var base = 'p.units("in"); p.box(6, 3, 0.25); ';
      var two = base + 'p.hole("Top", 1, -1.5, 0.201, { offset: 0.25 }); p.hole("Top", 2, -1.5, 0.201, { offset: 0.25 });';
      var r = rfNLDrawing(two), wt = r.view('Top');
      var c2 = wt.proj.circles.visible.filter(function (c) { return Math.abs(c.c[0] - 2) < 1e-6; })[0];
      assert(c2, 'hole 2 in Top: ' + JSON.stringify(wt.proj.circles.visible.map(function (c) { return c.c; })));
      wt.view.dims.push({ kind: 'dia', c: c2.c.slice(), r: c2.r, count: 1, value: 2 * c2.r });
      function user() { return r.sheet.dims.filter(function (d) { return !d.auto; }).map(function (d) { return d.text + (d.dangling ? '?' : ''); }).join(' '); }
      r.sheet = DW.compute(r.doc, r.mesh, r.model);
      assert(user() === 'Ø.201', 'attached: ' + user());
      r.redo(base + 'p.hole("Top", 1, -1.5, 0.201, { offset: 0.25 });');
      assert(user() === 'Ø.201?', 'hole 2 deleted: ' + user());
      near(wt.view.dims[0].c[0], 2, 1e-9, 'kept its last place');
      r.redo(two);
      assert(user() === 'Ø.201' && Math.abs(wt.view.dims[0].c[0] - 2) < 1e-9, 'undo: ' + user());
      r.redo(base + 'p.hole("Top", 1, -1.5, 0.201, { offset: 0.25 }); p.hole("Top", 3.5, -1, 0.201, { offset: 0.25 });');
      assert(user() === 'Ø.201' && Math.abs(wt.view.dims[0].c[0] - 3.5) < 1e-9, 'hole 2 moved: ' + user() + ' at ' + wt.view.dims[0].c);
      return 'dangles at x = 2, follows the move to 3.5';
    });
    test('an exploded assembly view draws its explode lines as phantom lines (block centre before -> after its step), a collapsed view none; DXF carries them', function () {
      var r = buildAsm('var b = a.insert({ script: \'p.name("Base"); p.box(100, 50, 10);\' }, { fixed: true });\n' +
        'var k = a.insert({ script: \'p.name("Block"); p.box(20, 20, 10);\' }, { position: [40, 10, 15], fixed: true });\n' +
        'a.explode([k], "y", 30);');
      assert(!Object.keys(r.errors).length, 'errors ' + JSON.stringify(r.errors));
      var doc = DW.newDrawing(r.model, { date: '2026-11-16' });
      DW.addView(doc, 'Front', { x: 80, y: 120 }); DW.addView(doc, 'Front', { x: 250, y: 120 });
      DW.setViewExploded(doc, doc.views[1].id, true, r.model);
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var xl = function (w) { return sh.prims.filter(function (p) { return p.explodeLine && p.view === w.view.id; }); };
      assert(xl(sh.views[0]).length === 0, 'collapsed: no explode line');
      var L = xl(sh.views[1]);
      assert(L.length === 1 && L[0].style === 'chain' && L[0].layer === sh.views[1].layer, 'one phantom line: ' + JSON.stringify(L));
      var s = sh.views[1].scale, len = Math.hypot(L[0].b[0] - L[0].a[0], L[0].b[1] - L[0].a[1]);
      near(len, 30 * s, 1e-6, 'the step’s 30 mm at the view scale');
      near(Math.abs(L[0].b[1] - L[0].a[1]), 30 * s, 1e-6, 'straight up (Y) in Front');
      var dxf = DW.toDXF(sh);
      assert(dxf.split('\nLINE\n').length > 2, 'DXF lines');
      return 'phantom line ' + (len / s).toFixed(3) + ' mm';
    });
    test('a hole through a flange bent at 30\u00b0 (its rims are ellipses on the slanted faces): Right and Isometric draw true ellipses (they were 49 + 25 facet chords), Top still one circle; DXF R2000 ELLIPSE', function () {
      var r = rfNLDrawing('p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(2, [[4, 0.06, 1.5]], { angle: 30 });\n' +
        'p.sketch("Top").circle(4.8, -1.5, 0.15).cut("through", { both: true });');
      function of(o) { var w = r.view(o); return { w: w, ps: r.sheet.prims.filter(function (p) { return p.layer === w.layer; }) }; }
      var R = of('Right'), T = of('Top'), I = of('Isometric');
      var el = R.ps.filter(function (p) { return p.k === 'ellipse'; }), s = R.w.scale;
      assert(el.length === 3, 'Right: 3 ellipses (2 visible, 1 hidden): ' + el.length);
      el.forEach(function (p) {
        var big = Math.hypot(p.major[0], p.major[1]) / s, small = big * p.ratio;
        near(big, 0.15, 1e-6, 'half-axis along the hole (Z)'); near(small, 0.15 * Math.tan(Math.PI / 6), 1e-6, 'half-axis up the 30\u00b0 face');
      });
      assert(R.ps.filter(function (p) { return p.k === 'line'; }).length <= 8, 'Right: no facet chords: ' + R.ps.filter(function (p) { return p.k === 'line'; }).length);
      assert(I.ps.filter(function (p) { return p.k === 'line'; }).length <= 12 && I.ps.filter(function (p) { return p.k === 'ellipse'; }).length >= 5, 'Isometric: ellipses, no chords');
      var tc = T.ps.filter(function (p) { return p.k === 'circle'; });
      assert(tc.length === 1 && Math.abs(tc[0].r - 0.15 * T.w.scale) < 1e-9 && !T.ps.some(function (p) { return p.k === 'ellipse'; }), 'Top: one circle');
      var dxf = DW.toDXF(r.sheet, { version: 'R2000' });
      assert(dxf.indexOf('\nELLIPSE\n') > 0, 'DXF R2000 ELLIPSE');
      return 'Right: ellipses .150 x .087';
    });
  })();