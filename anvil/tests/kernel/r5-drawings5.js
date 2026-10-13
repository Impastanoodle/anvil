  // --- r5/drawings5 ---
  (function () {
    var DW = Drawing;
    test('a shallow (12°) crease between two features is a real edge, not a tangent edge (true normals decide)', function () {
      var code = 'p.sketch("Top").centerRect(0, 0, 40, 20).extrude(10); p.sketch("Front").polyline([[0, 10], [20, 10], [20, 14.2511]]).extrude(10);';
      var r = build(code); noErrors(r);
      var tp = DW.projectView(r.mesh, 'Top'), tt = DW.projectView(r.mesh, 'Top', { tangent: 'visible' });
      var at0 = function (l) { return Math.abs(l[0]) < 1e-6 && Math.abs(l[2]) < 1e-6; };
      var e = tp.lines.visible.filter(at0);
      assert(e.length === 1 && Math.abs(Math.abs(e[0][3] - e[0][1]) - 10) < 1e-6, 'the ramp\'s start drawn as a visible edge: ' + segsStr(tp.lines.visible.filter(at0)));
      assert(!tt.lines.tangent.some(at0), 'not drawn as a tangent edge');
      // a fillet's run-out (facets of one feature, no surface record) stays a tangent edge
      var f = build('p.box(40, 20, 30); p.fillet(4, [[20, 30, 20]]);');
      assert(DW.projectView(f.mesh, 'Top', { tangent: 'visible' }).lines.tangent.length === 1, 'fillet run-out still tangent');
    });
    test('Anvil kernel: a chamfer cone meeting a hex nut\'s flat is drawn from the true intersection (smooth hyperbola), its ends on the facet corners', function () {
      var r = build(AnvilExamples.filter(function (e) { return e.name === 'Hex nut'; })[0].code); noErrors(r);
      var R = 19 / Math.cos(Math.PI / 6) / 2, f = function (u) { return R + 8.8 - Math.sqrt(90.25 + u * u); };
      var pr = DW.projectView(r.mesh, 'Right'), n = 0, worst = 0;
      pr.lines.visible.forEach(function (l) {
        if (Math.min(l[1], l[3]) < 7.8 - 1e-6 || Math.abs(Math.abs(l[0]) - 4) > 0.8 || Math.abs(Math.abs(l[2]) - 4) > 0.8) return;
        if (Math.abs(l[1] - f(l[0])) > 0.06 || Math.abs(l[3] - f(l[2])) > 0.06) return;
        n++; worst = Math.max(worst, Math.abs((l[1] + l[3]) / 2 - f((l[0] + l[2]) / 2)));
      });
      assert(n >= 10, 'fine pieces on the curve: ' + n);
      assert(worst < 2e-3, 'within 0.002 of the true curve: ' + worst);
      // the Front view (the flats edge-on) still meets the top / bottom lines exactly
      var fr = DW.projectView(r.mesh, 'Front'), ends = 0;
      fr.lines.visible.forEach(function (l) { [[l[0], l[1]], [l[2], l[3]]].forEach(function (p) { if (p[1] < -1e-6 || p[1] > 10 + 1e-6) ends++; }); });
      assert(!ends, ends + ' line ends outside the nut');
      return n + ' pieces, worst ' + worst.toExponential(1);
    });
    // a plate 100 x 60 x 8 with a section through it, in a given material -> the section view's record
    function sectionIn(material) {
      var r = drawingOf('p.sketch("Top").rect(0, -60, 100, 60).extrude(8);' + (material ? ' p.material("' + material + '");' : ''));
      var F = r.view('Front').view, S = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'h', at: 4, sign: 1 });
      r.sheet = DW.compute(r.doc, r.mesh, r.model);
      return { r: r, w: r.sheet.views.filter(function (w) { return w.view.id === S.id; })[0] };
    }
    test('section hatch follows the material: none ANSI31, steel ANSI32 (pairs), brass ANSI33 (solid + dashed), aluminium ANSI38 (crossed dashes), ABS ANSI34', function () {
      var want = { '': 'ANSI31', 'AISI 1020': 'ANSI32', 'Brass': 'ANSI33', '6061-T6 (SS)': 'ANSI38', 'ABS': 'ANSI34' }, out = [];
      Object.keys(want).forEach(function (m) {
        var x = sectionIn(m), h = x.w.hatches[0];
        assert(h && h.pattern === want[m], (m || 'no material') + ': ' + JSON.stringify(h));
        var lines = x.r.sheet.prims.filter(function (p) { return p.layer === x.w.layer && p.style === 'hatch'; });
        var angs = {}; lines.forEach(function (p) { angs[Math.round((Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]) * 180 / Math.PI + 360) % 180)] = 1; });
        if (want[m] === 'ANSI38') assert(angs[45] && angs[135], 'two directions: ' + Object.keys(angs));
        else assert(Object.keys(angs).join() === '45', 'one direction: ' + Object.keys(angs));
        out.push(want[m] + ' ' + lines.length);
      });
      // steel's lines come in pairs: perpendicular gaps alternate 1 and 2 spacings
      var st = sectionIn('AISI 1020'), sl = st.r.sheet.prims.filter(function (p) { return p.layer === st.w.layer && p.style === 'hatch'; });
      var n = [-Math.SQRT1_2, Math.SQRT1_2], ts = sl.map(function (p) { return Math.round((n[0] * p.a[0] + n[1] * p.a[1]) * 1e6) / 1e6; }).filter(function (t, i, a) { return a.indexOf(t) === i; }).sort(function (a, b) { return a - b; });
      var gaps = []; for (var i = 1; i < ts.length; i++) gaps.push(+(ts[i] - ts[i - 1]).toFixed(4));
      assert(gaps.length > 4 && gaps.every(function (g, i) { return Math.abs(g - gaps[i % 2]) < 1e-3; }) && Math.abs(gaps[0] + gaps[1] - 3 * st.w.hatches[0].spacing) < 1e-3, 'pair gaps ' + gaps.join(' '));
      return out.join(', ');
    });
    test('auto centre marks: a slot\'s two ends get one linear centre mark; a rounded end a single one', function () {
      var r = drawingOf('p.sketch("Top").rect(0, -40, 80, 40).extrude(6); p.sketch("Top", 6).slot(20, -20, 50, -20, 10).cut("through", { reverse: true });');
      var tv = r.view('Top').view;
      DW.autoCenterMarks(r.doc, r.mesh, tv.id);
      var cm = (tv.annotations || []).filter(function (a) { return a.type === 'centerMark'; });
      assert(cm.length === 1 && cm[0].style === 'linear' && cm[0].holes.length === 2, JSON.stringify(cm));
      var xs = cm[0].holes.map(function (h) { return h.c[0]; }).sort(function (a, b) { return a - b; });
      near(Math.abs(xs[1] - xs[0]), 30, 1e-6, 'slot centres 30 apart'); near(cm[0].holes[0].r, 5, 1e-6, 'r 5');
      var c = drawingOf('p.box(30, 12, 40); p.sketch("Front").slot(24, 0, 24, 30, 12).extrude(12, { reverse: true });');
      var fv = c.view('Front').view;
      DW.autoCenterMarks(c.doc, c.mesh, fv.id);
      var cm2 = (fv.annotations || []).filter(function (a) { return a.type === 'centerMark'; });
      assert(cm2.length === 1 && cm2[0].style === 'single', 'lone rounded end: ' + JSON.stringify(cm2));
    });
    test('title block cells are found under a point (double-click edits them in place); DXF view layers plot in colour 7, hatch in 8', function () {
      var f = DW.titleFieldAt([420, 297], 'mm', [420 - 10 - 180 + 50, 10 + 40 - 5]);
      assert(f && f.field.key === 'title', JSON.stringify(f));
      assert(DW.titleFieldAt([420, 297], 'mm', [420 - 10 - 20, 10 + 5]).field.key === 'sheet', 'sheet cell');
      assert(DW.titleFieldAt([420, 297], 'mm', [100, 100]) === null, 'outside');
      var x = sectionIn('AISI 1020'), dxf = DW.toDXF(x.r.sheet);
      assert(/\nLAYER\n2\nSECTION_A\n70\n0\n62\n7\n/.test(dxf), 'section layer colour 7');
      assert(/\nLINE\n8\nSECTION_A\n62\n8\n/.test(dxf), 'hatch line in colour 8');
    });
  })();
  // --- end r5/drawings5 ---
