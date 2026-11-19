  // --- rfQV (2026-11-19, lane drawviews, test-reports/2026-11-19-drawing-views.md): Standard 3 View added to a sheet
  // (no isometric, views kept), the corner projected view (pictorial), Use parent scale / style, Hide and Lock ---
  (function () {
    if (typeof Drawing === 'undefined') { group('rfQV: drawing views'); return; }
    var DW = Drawing;
    function rfQVPart() { return build('p.units("in"); p.sketch("Front").rect(0, 0, 4, 2).extrude(1); p.sketch("Front", 1).circle(2, 1, 0.25).cut("through", { reverse: true });'); }
    function rfQVSame(a, b) { return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9; }
    group('rfQV: drawing views as SolidWorks places them');
    test('addStandard3View: an empty sheet gets Front, Top and Right only (laid out, aligned); a sheet with views keeps them and gets a second family without roles', function () {
      var r = rfQVPart(), doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      var out = DW.addStandard3View(doc, r.mesh, 'in', { autoInsert: false });
      assert(doc.views.length === 3 && out.length === 3, 'three views: ' + doc.views.map(function (v) { return v.orient; }).join());
      assert(doc.views.map(function (v) { return v.orient; }).join() === 'Front,Top,Right', 'orients');
      assert(doc.views[1].parent === 1 && doc.views[1].align === 'x' && doc.views[2].align === 'y' && doc.views[0].role === 'front', 'aligned, roles');
      var keep = doc.views.map(function (v) { return [v.x, v.y]; });
      out = DW.addStandard3View(doc, r.mesh, 'in', { autoInsert: false });
      assert(doc.views.length === 6, 'six views');
      keep.forEach(function (p, i) { assert(doc.views[i].x === p[0] && doc.views[i].y === p[1], 'view ' + (i + 1) + ' kept'); });
      assert(out[1].parent === out[0].id && out[2].parent === out[0].id && !out[0].role && doc.layout === 'manual', 'second family');
      var sh = DW.compute(doc, r.mesh, r.model);
      assert(sh.views.length === 6, 'computed');
    });
    test('the corner projected view: Front + upright is the Isometric frame (third angle; downleft in first angle); free, True dimensions, no alignment to break or restore', function () {
      var iso = DW.frameOf('Isometric'), fr = DW.frameOf('Front');
      var F3 = DW.projectedFrame(fr, 'upright', 'third'), F1 = DW.projectedFrame(fr, 'downleft', 'first');
      assert(rfQVSame(F3.e, iso.e) && rfQVSame(F3.u, iso.u) && rfQVSame(F3.v, iso.v) && F3.name === 'Isometric', 'third angle: ' + JSON.stringify(F3));
      assert(rfQVSame(F1.e, iso.e) && rfQVSame(F1.u, iso.u), 'first angle');
      var F2 = DW.projectedFrame(fr, 'downleft', 'third');
      assert(Math.abs(F2.e[0] + 1 / Math.sqrt(3)) < 1e-9 && Math.abs(F2.e[1] + 1 / Math.sqrt(3)) < 1e-9 && F2.v[1] > 0 && F2.name === 'Isometric', 'from below left: ' + JSON.stringify(F2.e));
      var r = rfQVPart(), doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      var f = DW.addView(doc, 'Front', { x: 4, y: 3 });
      var v = DW.addProjectedView(doc, r.mesh, f.id, 'upright', { x: 12, y: 8 });
      assert(v.kind === 'projected' && v.parent === f.id && !v.align && v.x === 12 && v.y === 8 && v.dimType === 'true', 'placed free: ' + JSON.stringify(v));
      var threw = false; try { DW.setViewAlignment(doc, v.id, true); } catch (e) { threw = true; }
      assert(threw, 'no Default Alignment for it');
      DW.moveView(doc, f.id, 5, 3);
      assert(v.x === 12 && v.y === 8, 'the parent\'s drag leaves it');
      var sh = DW.compute(doc, r.mesh, r.model), w = sh.views.filter(function (x) { return x.view.id === v.id; })[0];
      assert(w && w.proj.stats.visibleLines > 8, 'drawn');
    });
    test('Use parent scale / style: Top and Right follow the Front\'s scale and display; ownScale / ownStyle keep their own; a section and a detail are not touched', function () {
      var r = rfQVPart(), doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      DW.addStandard3View(doc, r.mesh, 'in', { autoInsert: false });
      var F = doc.views[0], T = doc.views[1], R = doc.views[2];
      F.scale = [1, 2]; F.display = 'hlr';
      var sh = DW.compute(doc, r.mesh, r.model);
      assert(JSON.stringify(T.scale) === '[1,2]' && JSON.stringify(R.scale) === '[1,2]' && T.display === 'hlr' && R.display === 'hlr', 'followed: ' + JSON.stringify([T.scale, R.scale, T.display]));
      var wF = sh.views.filter(function (x) { return x.view.id === F.id; })[0], wT = sh.views.filter(function (x) { return x.view.id === T.id; })[0];
      assert(Math.abs((wF.box.x1 - wF.box.x0) - (wT.box.x1 - wT.box.x0)) < 1e-9, 'the same width on paper');
      T.ownScale = true; T.scale = [1, 1]; R.ownStyle = true; R.display = 'hlv';
      F.scale = [1, 4]; F.display = 'hlr';
      DW.compute(doc, r.mesh, r.model);
      assert(JSON.stringify(T.scale) === '[1,1]' && JSON.stringify(R.scale) === '[1,4]' && R.display === 'hlv' && T.display === 'hlr', 'own kept: ' + JSON.stringify([T.scale, R.scale, R.display, T.display]));
      F.scale = null;
      DW.compute(doc, r.mesh, r.model);
      assert(R.scale === null, 'back to the sheet scale with its parent');
      assert(DW.followsParent(T) && !DW.followsParent(F) && !DW.followsParent({ kind: 'detail', parent: 1 }) && !DW.followsParent({ kind: 'section', parent: 1 }), 'which views follow');
    });
    test('moveSectionLine / moveDetailCircle: the cutting line to the hole, the section cut there (the hole now in it); an offset line\'s legs move along; a removed section refused; the detail circle and a profile move whole', function () {
      var r = rfQVPart(), doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      var f = DW.addView(doc, 'Front', { x: 4, y: 3 });
      var s = DW.addSectionView(doc, r.mesh, f.id, { axis: 'v', at: 0.5, label: 'A', x: 10, y: 3 });
      var c0 = DW.compute(doc, r.mesh, r.model).views.filter(function (w) { return w.view.id === s.id; })[0].proj.stats;
      var fu = DW.compute(doc, r.mesh, r.model).views.filter(function (w) { return w.view.id === f.id; })[0], hu = fu.proj.circles.visible[0].c[0];
      DW.moveSectionLine(doc, r.mesh, s.id, hu);
      assert(s.section.at === hu, 'moved');
      var c1 = DW.compute(doc, r.mesh, r.model).views.filter(function (w) { return w.view.id === s.id; })[0].proj.stats;
      assert(c1.hiddenLines + c1.visibleLines > c0.hiddenLines + c0.visibleLines, 'the hole is in the cut now: ' + JSON.stringify([c0, c1]));
      var o = DW.addSectionView(doc, r.mesh, f.id, { axis: 'h', at: 0.5, type: 'offset', jogs: [{ t: 2, at: 1.5 }], label: 'B', x: 4, y: 8 });
      DW.moveSectionLine(doc, r.mesh, o.id, 0.75);
      assert(Math.abs(o.section.jogs[0].at - 1.75) < 1e-12, 'the leg moved along: ' + JSON.stringify(o.section.jogs));
      var rm = DW.addRemovedSection(doc, r.mesh, f.id, { a: [0.5, 0], b: [0.5, 2], x: 12, y: 8, label: 'C' });
      var threw = false; try { DW.moveSectionLine(doc, r.mesh, rm.id, 1); } catch (e) { threw = true; }
      assert(threw, 'a removed section is refused');
      var d = DW.addDetailView(doc, r.mesh, f.id, { c: [2, 1], r: 0.4, x: 13, y: 3, label: 'D' });
      DW.moveDetailCircle(doc, d.id, [2.5, 0.75]);
      assert(d.detail.c[0] === 2.5 && d.detail.c[1] === 0.75 && d.detail.r === 0.4, 'circle moved');
      d.detail.shape = 'profile'; d.detail.a = [2, 0.5]; d.detail.b = [3, 1]; d.detail.pts = [[2, 0.5], [3, 0.5], [3, 1]];
      DW.moveDetailCircle(doc, d.id, [3.5, 0.75]);
      assert(d.detail.a[0] === 3 && d.detail.b[0] === 4 && d.detail.pts[2][0] === 4, 'profile moved whole');
    });
    test('Hide: the view is off the sheet, the SVG and the DXF (its layer gone), a section cut from it is still drawn; Show puts it back; Lock is a flag', function () {
      var r = rfQVPart(), doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      DW.addStandard3View(doc, r.mesh, 'in', { autoInsert: false });
      var F = doc.views[0], R = doc.views[2];
      var s = DW.addSectionView(doc, r.mesh, F.id, { axis: 'v', at: 2, label: 'A', x: 14, y: 3 });
      DW.setViewHidden(doc, R.id, true);
      DW.setViewHidden(doc, F.id, true);
      var sh = DW.compute(doc, r.mesh, r.model);
      assert(!sh.views.some(function (w) { return w.view.id === R.id || w.view.id === F.id; }), 'off the sheet');
      var ws = sh.views.filter(function (w) { return w.view.id === s.id; })[0];
      assert(ws && ws.proj.stats.visibleLines > 3, 'the section from the hidden Front is drawn');
      var dxf = DW.toDXF(sh, { version: 'R12' });
      assert(!/\n\s*8\r?\n\s*RIGHT\r?\n/.test(dxf) && !/\n\s*8\r?\n\s*FRONT\r?\n/.test(dxf), 'no RIGHT / FRONT layer entities');
      var svg = DW.toSVG(sh);
      DW.setViewHidden(doc, R.id, false); DW.setViewHidden(doc, F.id, false);
      assert(!R.hidden, 'Show');
      var sh2 = DW.compute(doc, r.mesh, r.model);
      assert(sh2.views.length === 4 && DW.toSVG(sh2).length > svg.length, 'back on the sheet');
      DW.setViewLocked(doc, F.id, true);
      assert(F.locked === true, 'locked'); DW.setViewLocked(doc, F.id, false); assert(!('locked' in F), 'unlocked');
    });
  })();
