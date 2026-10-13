  // ------------------------------------------------------------------ rfAL: True diameters / radii on ellipses, section labels across sheets
  (function () {
    if (typeof Drawing === 'undefined') return;
    group('rfAL: True dimension type on circles seen obliquely, labels unique across sheets');
    var DW = Drawing;
    test('rfAL: ellipseRadius — conjugate radii of a circle of radius 5 under any orthographic projection give 5; ellipseReach lands on the ellipse', function () {
      var F = DW.frameOf(DW.orientation('Isometric')), V = Kernel.vec, n = [0, 0, 1], x = [1, 0, 0], y = [0, 1, 0];
      var ax = [5 * V.dot(x, F.u), 5 * V.dot(x, F.v)], ay = [5 * V.dot(y, F.u), 5 * V.dot(y, F.v)];
      near(DW.ellipseRadius(ax, ay), 5, 1e-12, 'iso');
      near(DW.ellipseRadius([3, 0], [0, 5]), 5, 1e-12, 'principal axes'); near(DW.ellipseRadius([2, 0], [1, 1]), Math.sqrt((6 + Math.sqrt(36 - 16)) / 2), 1e-12, 'sheared');
      var e = { ax: [4, 0], ay: [0, 2] };
      near(DW.ellipseReach(e, [1, 0]), 4, 1e-12, 'along ax'); near(DW.ellipseReach(e, [0, -3]), 2, 1e-12, 'along ay');
      var r45 = DW.ellipseReach(e, [1, 1]), q = [r45 / Math.SQRT2, r45 / Math.SQRT2];
      near(q[0] * q[0] / 16 + q[1] * q[1] / 4, 1, 1e-12, 'on the ellipse at 45°');
      return 'iso r ' + DW.ellipseRadius(ax, ay).toFixed(9);
    });
    test('rfAL: Dimension Type True on an ellipse — a Ø10 hole in a plate reads Ø10 in a True isometric view (drawn as an ellipse), the arrow on the ellipse; the DXF DIMENSION carries 10; the hole made Ø12 reads Ø12; a part arc reads its true R', function () {
      var r = build('p.sketch("Front").rect(0, 0, 100, 50).circle(30, 25, 5).extrude(10);');
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(doc, r.mesh, r.model.units);
      var iso = doc.views.filter(function (v) { return v.orient === 'Isometric'; })[0];
      DW.setDimType(doc, iso.id, 'true');
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views.filter(function (x) { return x.view.id === iso.id; })[0];
      assert(w.trueDims, 'True view');
      var els = w.proj.ellipses.visible.filter(function (el) { return Math.abs(DW.ellipseRadius(el.ax, el.ay) - 5) < 1e-6 && (el.full || el.whole); });
      assert(els.length >= 1, 'hole rim ellipses ' + w.proj.ellipses.visible.length);
      var el = els[0], minor = Math.sqrt(Math.max(0, (el.ax[0] * el.ax[0] + el.ax[1] * el.ax[1] + el.ay[0] * el.ay[0] + el.ay[1] * el.ay[1]) - 25));
      assert(minor < 4.5, 'drawn as an ellipse (minor ' + minor.toFixed(3) + ')');
      var d = DW.smartDim({ ellipse: { c: el.c, ax: el.ax, ay: el.ay, t0: el.t0, t1: el.t1, full: true } }, null, null, { scale: w.scale, aligned: true });
      assert(d.kind === 'dia' && d.ell, 'diameter of an ellipse ' + JSON.stringify(d));
      near(d.value, 10, 1e-9, 'true diameter');
      iso.dims = [d];
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var sd = sh.dims.filter(function (x) { return x.view === iso.id; })[0];
      assert(sd && !sd.dangling && sd.text === 'Ø10', 'text ' + (sd && sd.text));
      w = sh.views.filter(function (x) { return x.view.id === iso.id; })[0];
      var tip = sd.dxf.p15, c = w.toSheet(sd.c), AX = [el.ax[0] * w.scale, el.ax[1] * w.scale], AY = [el.ay[0] * w.scale, el.ay[1] * w.scale];
      var det = AX[0] * AY[1] - AX[1] * AY[0], rel = [tip[0] - c[0], tip[1] - c[1]], ec = (rel[0] * AY[1] - rel[1] * AY[0]) / det, es = (AX[0] * rel[1] - AX[1] * rel[0]) / det;
      near(Math.hypot(ec, es), 1, 1e-9, 'the arrow tip is on the ellipse');
      var dxf = DW.toDXF(sh, { version: 'R2000' }), dims = DxfCheck.check(dxf, { units: r.model.units }).dimensions || [];
      assert(dims.some(function (x) { return x.kind === 'diameter' && Math.abs(x.value - 10) < 1e-9 && x.text.indexOf('10') >= 0; }), 'DXF diameter 10: ' + JSON.stringify(dims.map(function (x) { return [x.kind, x.value, x.text]; })));
      var r2 = build('p.sketch("Front").rect(0, 0, 100, 50).circle(30, 25, 6).extrude(10);');
      noErrors(r2);
      sh = DW.compute(doc, r2.mesh, r2.model, { build: r2.build });
      sd = sh.dims.filter(function (x) { return x.view === iso.id; })[0];
      assert(!sd.dangling && sd.text === 'Ø12', 'follows the part: ' + sd.text);
      // a part arc of an ellipse reads its true radius
      var arcEl = { c: el.c, ax: el.ax, ay: el.ay, t0: 0, t1: Math.PI / 2, full: false };
      var ra = DW.smartDim({ ellipse: arcEl }, null, null, { scale: w.scale });
      assert(ra.kind === 'rad' && ra.ell && ra.ell.t1 === Math.PI / 2, 'radius of an elliptical arc');
      near(ra.value, 5, 1e-9, 'true radius');
      return sd.text + ', minor ' + minor.toFixed(3);
    });
    test('rfAL: section and detail labels are unique across sheets — a section on sheet 2 after SECTION A-A on sheet 1 is B; magnetic line ids too', function () {
      var r = build('p.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).extrude(10);');
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(doc, r.mesh, r.model.units);
      var F = doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
      var a = DW.addSectionView(doc, r.mesh, F.id, { axis: 'h', at: 25, sign: 1 });
      assert(a.label === 'A', 'first ' + a.label);
      var ml = DW.addMagLine(doc, F.id, { side: 'top' });
      DW.addSheet(doc, { activate: true });
      assert(doc.views.length === 0, 'sheet 2 is empty');
      DW.standard3View(doc, r.mesh, r.model.units);
      var F2 = doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
      var b = DW.addSectionView(doc, r.mesh, F2.id, { axis: 'v', at: 50, sign: 1 });
      assert(b.label === 'B', 'second sheet goes on: ' + b.label);
      var ml2 = DW.addMagLine(doc, F2.id, { side: 'top' });
      assert(ml.id !== ml2.id, 'magnetic line ids ' + ml.id + ' ' + ml2.id);
      return a.label + ', ' + b.label;
    });
  })();
  // --- end rfAL ---
