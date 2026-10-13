  // ------------------------------------------------------------------ rfZ: Detail View Profile / outlines / circle styles, partial sections, Scale with model changes, True dimensions
  (function () {
    if (typeof Drawing === 'undefined') return;
    group('rfZ: detail Profile and Full / Jagged outline, detail circle styles, Partial section, Scale with model changes, Dimension Type True');
    var DW = Drawing, PLATE = 'p.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).circle(80, 25, 5).extrude(10);';
    function rfZDoc(code) {
      var r = build(code);
      noErrors(r);
      r.doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      r.recompute();
      r.byId = function (id) { return r.sheet.views.filter(function (w) { return w.view.id === id; })[0]; };
      r.front = function () { return r.doc.views.filter(function (v) { return v.orient === 'Front'; })[0]; };
      return r;
    }
    test('rfZ: Detail View Profile — a 40 × 50 rectangle round the left hole shows that hole whole, edges cut at u = 40, its box is the rectangle at twice the scale; the parent shows the rectangle (4 thick lines), not a circle; Full outline draws it round the view; a profile needs two corners', function () {
      var r = rfZDoc(PLATE), F = r.front();
      var v = DW.addDetailView(r.doc, r.mesh, F.id, { shape: 'profile', a: [40, 50], b: [0, 0], outline: 'full', x: 300, y: 150 });
      assert(v.detail.shape === 'profile' && v.detail.a[0] === 0 && v.detail.b[0] === 40 && v.detail.outline === 'full', 'stored ' + JSON.stringify(v.detail));
      var sh = r.recompute(), w = r.byId(v.id), s = w.scale;
      assert(w.proj.circles.visible.length === 1 && Math.abs(w.proj.circles.visible[0].c[0] - 20) < 1e-9, 'one hole, whole: ' + JSON.stringify(w.proj.stats));
      assert(w.proj.lines.visible.every(function (l) { return Math.max(l[0], l[2]) <= 40 + 1e-9; }), 'nothing past u = 40');
      near(w.box.x1 - w.box.x0, 40 * s, 1e-9, 'box width'); near(w.box.y1 - w.box.y0, 50 * s, 1e-9, 'box height');
      near(s, 2 * DW.scaleValue(F.scale || r.doc.sheet.scale), 1e-12, 'twice the parent scale');
      var marks = sh.prims.filter(function (p) { return p.detailMark === v.id; });
      assert(marks.length === 4 && marks.every(function (p) { return p.k === 'line' && p.style === 'thick'; }), 'rectangle on the parent ' + marks.map(function (p) { return p.k; }));
      var ol = sh.prims.filter(function (p) { return p.detailOutline === v.id; });
      assert(ol.length === 4 && ol.every(function (p) { return p.k === 'line' && p.layer === w.layer; }), 'full outline round the view ' + ol.length);
      near(Math.min.apply(null, ol.map(function (p) { return Math.min(p.a[0], p.b[0]); })), w.box.x0, 1e-9, 'outline on the box');
      assert(sh.prims.some(function (p) { return p.k === 'text' && p.text === 'DETAIL ' + v.label; }), 'label');
      var bad = null; try { DW.addDetailView(r.doc, r.mesh, F.id, { shape: 'profile', a: [0, 0], b: [0, 10] }); } catch (e) { bad = e.message; }
      assert(bad && /corners/.test(bad), 'zero-width profile refused: ' + bad);
      return 'detail ' + v.label + ' ' + (w.box.x1 - w.box.x0).toFixed(2) + ' × ' + (w.box.y1 - w.box.y0).toFixed(2);
    });
    test('rfZ: detail circle outlines and styles — Full outline is a circle of the detail radius round the view, Jagged a closed zig-zag; Broken leaves a gap for the letter, With Leader adds a thin leader, Connected a thin line to the detail view; setDetailOptions changes and clears them', function () {
      var r = rfZDoc(PLATE), F = r.front();
      var v = DW.addDetailView(r.doc, r.mesh, F.id, { c: [80, 25], r: 12, outline: 'full', x: 330, y: 270 });
      var sh = r.recompute(), w = r.byId(v.id), ol = sh.prims.filter(function (p) { return p.detailOutline === v.id; });
      assert(ol.length === 1 && ol[0].k === 'circle', 'full: one circle'); near(ol[0].r, 12 * w.scale, 1e-9, 'radius');
      DW.setDetailOptions(r.doc, v.id, { outline: 'jagged' });
      sh = r.recompute(); ol = sh.prims.filter(function (p) { return p.detailOutline === v.id; });
      assert(ol.length >= 12 && ol.every(function (p) { return p.k === 'line'; }), 'jagged: zig-zag lines ' + ol.length);
      near(Math.hypot(ol[0].a[0] - ol[ol.length - 1].b[0], ol[0].a[1] - ol[ol.length - 1].b[1]), 0, 1e-9, 'closed');
      var circ = function () { return r.sheet.prims.filter(function (p) { return p.detailMark === v.id; }); };
      assert(circ().length === 1 && circ()[0].k === 'circle', 'per standard: the circle');
      DW.setDetailOptions(r.doc, v.id, { style: 'broken', outline: null });
      r.recompute();
      var arc = circ().filter(function (p) { return p.k === 'arc'; })[0];
      assert(arc && !circ().some(function (p) { return p.k === 'circle'; }) && arc.a1 - arc.a0 < 360 - 1 && arc.a1 - arc.a0 > 180, 'broken: an arc with a gap ' + (arc && (arc.a1 - arc.a0)));
      assert(!r.sheet.prims.some(function (p) { return p.detailOutline === v.id; }), 'outline cleared');
      DW.setDetailOptions(r.doc, v.id, { style: 'leader' });
      r.recompute();
      assert(r.sheet.prims.some(function (p) { return p.detailLeader === v.id && p.style === 'thin'; }), 'with leader');
      DW.setDetailOptions(r.doc, v.id, { style: 'connected' });
      sh = r.recompute(); w = r.byId(v.id);
      var cn = sh.prims.filter(function (p) { return p.detailConnect === v.id; })[0];
      assert(cn, 'connected line');
      assert(cn.b[0] >= w.box.x0 - 1e-9 && cn.b[0] <= w.box.x1 + 1e-9 && cn.b[1] >= w.box.y0 - 1e-9 && cn.b[1] <= w.box.y1 + 1e-9, 'ends on the detail view');
      DW.setDetailOptions(r.doc, v.id, { style: null });
      assert(!r.doc.views.filter(function (x) { return x.id === v.id; })[0].detail.style, 'style cleared');
      var dxf = DW.toDXF(sh), svg = DW.toSVG(sh);
      assert(dxf.indexOf('DETAIL ' + v.label) > 0 && svg.indexOf('DETAIL ' + v.label) > 0, 'exports');
      return ol.length + ' jagged pieces';
    });
    test('rfZ: Partial section — a horizontal cut at v = 25 from u = 0 to 40 keeps that band of the section (the left hole cut, nothing past 40), the cutting line on Front stops at its two ends; partial on a half section is refused; partial: null takes it off', function () {
      var r = rfZDoc(PLATE), F = r.front();
      var full = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'h', at: 25, sign: 1 }), sh = r.recompute(), wf = r.byId(full.id);
      var fullW = wf.proj.bounds.umax - wf.proj.bounds.umin;
      DW.deleteView(r.doc, full.id);
      var v = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'h', at: 25, sign: 1, partial: [40, 0] });
      assert(v.section.partial[0] === 0 && v.section.partial[1] === 40, 'stored sorted ' + JSON.stringify(v.section));
      sh = r.recompute();
      var w = r.byId(v.id), pw = r.byId(F.id);
      near(fullW, 100, 1e-6, 'the full section is 100 wide');
      assert(w.proj.bounds.umax <= 40 + 1e-9 && w.proj.bounds.umin >= -1e-9, 'band 0..40: ' + JSON.stringify(w.proj.bounds));
      assert(w.hatch > 0, 'hatched');
      var chain = sh.prims.filter(function (p) { return p.layer === pw.layer && p.k === 'line' && p.style === 'chain' && p.view == null; });
      assert(chain.length === 1, 'one cutting line ' + chain.length);
      var A = pw.toSheet([0, 25]), B = pw.toSheet([40, 25]);
      near(Math.min(chain[0].a[0], chain[0].b[0]), A[0], 1e-9, 'starts at u = 0'); near(Math.max(chain[0].a[0], chain[0].b[0]), B[0], 1e-9, 'ends at u = 40');
      near(chain[0].a[1], A[1], 1e-9, 'at v = 25');
      var bad = null; try { DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'h', at: 25, sign: 1, type: 'half', c: 50, side: 1, partial: [0, 40] }); } catch (e) { bad = e.message; }
      assert(bad && /partial/i.test(bad) && r.doc.views.length === 5, 'half + partial refused, view taken off: ' + bad);
      DW.setSectionOptions(r.doc, r.mesh, v.id, { partial: null });
      r.recompute();
      near(r.byId(v.id).proj.bounds.umax - r.byId(v.id).proj.bounds.umin, 100, 1e-6, 'partial off: the whole section');
      return 'band ' + (w.proj.bounds.umax - w.proj.bounds.umin).toFixed(3);
    });
    test('rfZ: Scale with model changes — a vertical cut at u = 75 of a 100 wide plate moves to u = 150 when the plate is made 200 wide (same place on the part), a partial line\'s ends too; without it the line stays at 75', function () {
      var r = rfZDoc(PLATE), F = r.front();
      var a = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'v', at: 75, sign: 1, scaleWithModel: true, label: 'A' });
      var b = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'v', at: 75, sign: 1, label: 'B', partial: [10, 40], scaleWithModel: true });
      var c = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'v', at: 75, sign: 1, label: 'C' });
      near(a.section.rel.at, 0.75, 1e-12, 'fraction'); assert(!c.section.rel && !c.section.scaleWithModel, 'off by default');
      var r2 = build('p.sketch("Front").rect(0, 0, 200, 100).circle(20, 25, 5).extrude(10);');
      noErrors(r2);
      var sh = DW.compute(r.doc, r2.mesh, r2.model, { build: r2.build });
      near(a.section.at, 150, 1e-9, 'A follows the part'); near(c.section.at, 75, 1e-12, 'C stays');
      near(b.section.partial[0], 20, 1e-9, 'partial from'); near(b.section.partial[1], 80, 1e-9, 'partial to');
      var wa = sh.views.filter(function (w) { return w.view.id === a.id; })[0];
      assert(wa && wa.hatch > 0, 'A still cuts the part');
      DW.compute(r.doc, r.mesh, r.model, { build: r.build });
      near(a.section.at, 75, 1e-9, 'back to 75 with the old part');
      DW.setSectionOptions(r.doc, r.mesh, a.id, { scaleWithModel: false });
      assert(!a.section.rel && !a.section.scaleWithModel, 'off again');
      return 'A at ' + a.section.at;
    });
    test('rfZ: Dimension Type True — in an isometric view the longest edge (the 100 long one, drawn 81.65) reads 100 with True and 81.65 with Projected; a vertex-to-vertex dimension reads the 3D distance 111.803; trueLength lifts the 2D points onto the part; orthographic and section views ignore it', function () {
      var r = rfZDoc('p.sketch("Front").rect(0, 0, 100, 50).extrude(10);');
      var iso = r.doc.views.filter(function (v) { return v.orient === 'Isometric'; })[0], F0 = DW.frameOf(DW.orientation('Isometric'));
      function pj(p) { return [Kernel.vec.dot(p, F0.u), Kernel.vec.dot(p, F0.v)]; }
      near(DW.trueLength(r.mesh, F0, pj([0, 50, 10]), pj([100, 50, 10])), 100, 1e-9, 'an X edge');
      near(DW.trueLength(r.mesh, F0, pj([0, 50, 10]), pj([50, 50, 10])), 50, 1e-9, 'half of it');
      near(DW.trueLength(r.mesh, F0, pj([0, 50, 10]), pj([100, 0, 10])), Math.hypot(100, 50), 1e-9, 'two vertices');
      var w = r.sheet.views.filter(function (x) { return x.view.id === iso.id; })[0], L = 0, best = null;
      w.proj.lines.visible.forEach(function (l) { var d = Math.hypot(l[2] - l[0], l[3] - l[1]); if (d > L) { L = d; best = l; } });
      near(L, 100 * Math.sqrt(2 / 3), 1e-6, 'drawn foreshortened');
      var d = DW.smartDim({ edge: [[best[0], best[1]], [best[2], best[3]]] }, null, [best[0], best[1] + 20], { scale: w.scale, aligned: true });
      assert(d.kind === 'aligned', 'along the edge: ' + d.kind);
      iso.dims = [d];
      r.recompute();
      var sd = r.sheet.dims.filter(function (x) { return x.view === iso.id; })[0];
      near(sd.value, L, 1e-9, 'Projected (default) ' + sd.text);
      DW.setDimType(r.doc, iso.id, 'true');
      r.recompute();
      sd = r.sheet.dims.filter(function (x) { return x.view === iso.id; })[0];
      near(sd.value, 100, 1e-9, 'True'); assert(sd.text === '100' && sd.trueDim, 'text ' + sd.text);
      assert(r.sheet.views.filter(function (x) { return x.view.id === iso.id; })[0].trueDims, 'the view reads true lengths');
      iso.dims.push(DW.smartDim({ point: pj([0, 50, 10]) }, { point: pj([100, 0, 10]) }, null, { aligned: true }));
      r.recompute();
      near(r.sheet.dims.filter(function (x) { return x.view === iso.id; })[1].value, Math.hypot(100, 50), 1e-9, 'vertex to vertex');
      var front = r.front(), bad = null;
      DW.setDimType(r.doc, front.id, 'true'); r.recompute();
      assert(!r.sheet.views.filter(function (x) { return x.view.id === front.id; })[0].trueDims, 'orthographic: nothing to correct');
      var sv = DW.addSectionView(r.doc, r.mesh, front.id, { axis: 'h', at: 25, sign: 1 });
      try { DW.setDimType(r.doc, sv.id, 'true'); } catch (e) { bad = e.message; }
      assert(bad, 'a section view has no Dimension Type');
      DW.setDimType(r.doc, iso.id, 'projected');
      assert(!iso.dimType, 'back to projected');
      return sd.text + ' (drawn ' + L.toFixed(3) + ')';
    });
  })();
  // --- end rfZ ---
