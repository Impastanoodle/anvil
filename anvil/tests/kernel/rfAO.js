  // ------------------------------------------------------------------ rfAO: drawing sketch, Line Format, Hide / Show Edges, Relative View
  (function () {
    group('rfAO: sketch entities on the sheet and in views (relations, driving dimensions), Line Format, Hide / Show Edges, Relative View');
    function rfAOThrows(fn) { try { fn(); } catch (e) { return true; } return false; }
    function rfAODoc(src) {
      var r = build(src || 'p.name("Bracket").units("in");\np.sketch("Front").polyline([[0, 0], [4, 0], [4, 2], [0, 2]], true).end().extrude(0.25);');
      noErrors(r);
      r.doc = DW.newDrawing(r.model, { date: '2026-10-12' });
      DW.standard3View(r.doc, r.mesh, r.model.units);
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      r.recompute();
      return r;
    }
    function rfAOSk(s, id) { return s.prims.filter(function (p) { return p.layer === 'SKETCH' && (id == null || p.sk === id); }); }
    function rfAOFront(r) { return r.doc.views.filter(function (v) { return v.orient === 'Front'; })[0]; }
    test('rfAO: Line, Centerline, Circle, Arc, Spline, Point and Text on the sheet draw on the SKETCH layer in SVG, DXF and PDF', function () {
      var r = rfAODoc();
      var ln = DW.addSketchEntity(r.doc, { t: 'line', a: [1, 1], b: [3, 1] });
      var cl = DW.addSketchEntity(r.doc, { t: 'line', a: [1, 1.5], b: [3, 1.5], cons: true });
      var ci = DW.addSketchEntity(r.doc, { t: 'circle', c: [5, 5], r: 0.5 });
      var ar = DW.addSketchEntity(r.doc, { t: 'arc', c: [7, 5], r: 0.5, a0: 0, a1: 90 });
      var sp = DW.addSketchEntity(r.doc, { t: 'spline', pts: [[1, 6], [2, 7], [3, 6]] });
      var pt = DW.addSketchEntity(r.doc, { t: 'point', p: [9, 9] });
      var tx = DW.addSketchEntity(r.doc, { t: 'text', p: [1, 9], text: 'WELD BOTH SIDES' });
      assert(ln.id && cl.id && ln.id !== cl.id && ln.view === null, 'ids ' + ln.id + ' ' + cl.id);
      var s = r.recompute();
      assert(rfAOSk(s, ln.id).length === 1 && rfAOSk(s, ln.id)[0].k === 'line' && rfAOSk(s, ln.id)[0].style === 'visible', 'line, normal weight');
      assert(rfAOSk(s, cl.id)[0].style === 'center', 'centerline in the centre style');
      assert(rfAOSk(s, ci.id)[0].k === 'circle' && rfAOSk(s, ar.id)[0].k === 'arc' && rfAOSk(s, ar.id)[0].a1 === 90, 'circle and arc');
      assert(rfAOSk(s, sp.id).length > 10 && rfAOSk(s, sp.id).every(function (p) { return p.k === 'line' && p.chain; }), 'spline as a chained polyline');
      near(rfAOSk(s, sp.id)[0].a[0], 1, 1e-12, 'spline starts at its first point');
      assert(rfAOSk(s, pt.id)[0].k === 'fill' && rfAOSk(s, tx.id)[0].text === 'WELD BOTH SIDES', 'point and text');
      assert(s.sketch && s.sketch.length === 7, 'sheet.sketch lists the entities');
      var svg = DW.toSVG(s), dxf = DW.toDXF(s, { version: 'R2000' }), pdf = DW.toPDF([s]);
      assert(/data-layer="SKETCH"/.test(svg) && /WELD BOTH SIDES/.test(svg), 'SVG layer');
      assert(/\nSKETCH\r?\n/.test(dxf) && dxf.indexOf('WELD BOTH SIDES') > 0, 'DXF layer SKETCH');
      assert(pdf && pdf.length > 1000, 'PDF');
      assert(rfAOThrows(function () { DW.addSketchEntity(r.doc, { t: 'blob' }); }) && rfAOThrows(function () { DW.addSketchEntity(r.doc, { t: 'circle', c: [0, 0], r: 0 }); }), 'bad entities refused');
      DW.deleteSketchEntity(r.doc, sp.id);
      s = r.recompute();
      assert(!rfAOSk(s, sp.id).length && s.sketch.length === 6, 'deleted');
      return s.sketch.length + ' entities';
    });
    test('rfAO: a Rectangle is four lines held by Coincident / Horizontal / Vertical; dragging a corner keeps it a rectangle', function () {
      var r = rfAODoc();
      var ids = DW.addSketchRect(r.doc, [1, 1], [3, 2]);
      assert(ids.length === 4, 'four lines');
      var rels = DW.sketchEntities(r.doc, null).filter(function (e) { return e.t === 'rel'; });
      assert(rels.filter(function (x) { return x.kind === 'coincident'; }).length === 4 && rels.filter(function (x) { return x.kind === 'H'; }).length === 2 && rels.filter(function (x) { return x.kind === 'V'; }).length === 2, 'relations ' + rels.map(function (x) { return x.kind; }).join(','));
      DW.moveSketchEntity(r.doc, ids[1], 0.5, 0.25, 'b');   // the top-right corner
      var L = ids.map(function (id) { return DW.sketchEntity(r.doc, id); });
      near(L[1].b[0], 3.5, 1e-9, 'corner x'); near(L[1].b[1], 2.25, 1e-9, 'corner y');
      near(L[2].a[0], 3.5, 1e-9, 'coincident follows'); near(L[2].a[1], 2.25, 1e-9, 'coincident follows y');
      near(L[2].b[1], 2.25, 1e-9, 'top stays horizontal'); near(L[1].a[0], 3.5, 1e-9, 'right side stays vertical');
      near(L[0].a[0], 1, 1e-9, 'far corner put'); near(L[0].a[1], 1, 1e-9, 'far corner put y');
      DW.moveSketchEntity(r.doc, ids[3], -0.5, 0);   // the whole left side
      L = ids.map(function (id) { return DW.sketchEntity(r.doc, id); });
      near(L[0].a[0], 0.5, 1e-9, 'left side moved'); near(L[2].b[0], 0.5, 1e-9, 'top line end follows'); near(L[0].b[0], 3.5, 1e-9, 'right side stays');
      assert(rfAOThrows(function () { DW.addSketchRelation(r.doc, 'H', 999); }), 'H needs a line');
      return 'ok';
    });
    test('rfAO: Smart Dimension on sketch entities drives them (line length, circle diameter, arc radius); in a 1:2 view it reads model units', function () {
      var r = rfAODoc();
      var ln = DW.addSketchEntity(r.doc, { t: 'line', a: [1, 1], b: [2, 1], rel: 'H' });
      var d = DW.addSketchDim(r.doc, ln.id);
      near(d.val, 1, 1e-12, 'measured');
      DW.setSketchDim(r.doc, d.id, 2.5);
      var l2 = DW.sketchEntity(r.doc, ln.id);
      near(l2.b[0] - l2.a[0], 2.5, 1e-9, 'driven to 2.5'); near(l2.a[0], 1, 1e-12, 'start stays');
      var ci = DW.addSketchEntity(r.doc, { t: 'circle', c: [5, 5], r: 0.5 }), dc = DW.addSketchDim(r.doc, ci.id);
      assert(dc.kind === 'dia', dc.kind); DW.setSketchDim(r.doc, dc.id, 0.75);
      near(DW.sketchEntity(r.doc, ci.id).r, 0.375, 1e-12, 'diameter drives');
      var ar = DW.addSketchEntity(r.doc, { t: 'arc', c: [7, 5], r: 0.5, a0: 0, a1: 180 }), da = DW.addSketchDim(r.doc, ar.id);
      assert(da.kind === 'rad', da.kind);
      var s = r.recompute(), txt = rfAOSk(s, d.id).filter(function (p) { return p.k === 'text'; })[0], tc = rfAOSk(s, dc.id).filter(function (p) { return p.k === 'text'; })[0];
      assert(txt && /^2\.50?0?$/.test(txt.text), 'length text ' + (txt && txt.text));
      assert(tc && /^Ø/.test(tc.text) && rfAOSk(s, da.id).some(function (p) { return p.k === 'text' && /^R/.test(p.text); }), 'Ø and R');
      assert(rfAOSk(s, d.id).filter(function (p) { return p.k === 'fill'; }).length === 2, 'two arrowheads');
      // in a view at 1:2 a 1 in paper line is 2 in on the part
      var F = rfAOFront(r);
      F.scale = [1, 2];
      var vl = DW.addSketchEntity(r.doc, { t: 'line', a: [F.x, F.y], b: [F.x + 1, F.y] }, F.id), vd = DW.addSketchDim(r.doc, vl.id);
      near(vd.val, 2, 1e-9, 'model units in a 1:2 view');
      DW.setSketchDim(r.doc, vd.id, 3);
      var vl2 = DW.sketchEntity(r.doc, vl.id);
      near(vl2.b[0] - vl2.a[0], 1.5, 1e-9, '3 in on the part is 1.5 in on paper');
      return 'ok';
    });
    test('rfAO: a sketch in a view moves with the view; sheet sketch stays', function () {
      var r = rfAODoc(), F = rfAOFront(r);
      var vl = DW.addSketchEntity(r.doc, { t: 'line', a: [F.x - 1, F.y], b: [F.x + 1, F.y] }, F.id);
      var sl = DW.addSketchEntity(r.doc, { t: 'line', a: [1, 1], b: [2, 1] });
      assert(vl.view === F.id && sl.view === null, 'owners');
      var x0 = F.x;
      DW.moveView(r.doc, F.id, F.x + 1.5, F.y + 0.5);
      var v2 = DW.sketchEntity(r.doc, vl.id), s2 = DW.sketchEntity(r.doc, sl.id);
      near(v2.a[0], x0 - 1 + 1.5, 1e-9, 'view sketch moved'); near(s2.a[0], 1, 1e-12, 'sheet sketch stays');
      var s = r.recompute();
      assert(rfAOSk(s, vl.id)[0].view === F.id, 'prims carry the view (live drag)');
      DW.deleteView(r.doc, F.id);
      assert(!DW.sketchEntity(r.doc, vl.id), 'gone with its view');
      return 'ok';
    });
    test('rfAO: Line Format on sketch entities: hidden / center / phantom, thin / normal / thick, colour; DXF line types', function () {
      var r = rfAODoc();
      var a = DW.addSketchEntity(r.doc, { t: 'line', a: [1, 1], b: [3, 1] }), b = DW.addSketchEntity(r.doc, { t: 'line', a: [1, 2], b: [3, 2] });
      var c = DW.addSketchEntity(r.doc, { t: 'circle', c: [5, 5], r: 0.5 });
      assert(DW.setLineFormat(r.doc, [a.id], { style: 'hidden' }) === 1, 'one');
      DW.setLineFormat(r.doc, [b.id], { style: 'phantom', weight: 'thick', color: '#ff0000' });
      DW.setLineFormat(r.doc, [c.id], { weight: 'thin' });
      var s = r.recompute(), pa = rfAOSk(s, a.id)[0], pb = rfAOSk(s, b.id)[0], pc = rfAOSk(s, c.id)[0];
      assert(pa.style === 'hidden' && pb.style === 'chain' && pb.rgb === '#ff0000' && pb.lw === 0.7 && pc.style === 'thin', pa.style + ' ' + pb.style + ' ' + pc.style);
      var dxf = DW.toDXF(s, { version: 'R2000' });
      assert(/PHANTOM/.test(dxf) && /HIDDEN/.test(dxf), 'line types');
      assert(rfAOThrows(function () { DW.setLineFormat(r.doc, [a.id], { style: 'wavy' }); }) && rfAOThrows(function () { DW.setLineFormat(r.doc, [a.id], { color: 'red' }); }), 'bad formats refused');
      DW.setLineFormat(r.doc, [a.id], { style: null });
      assert(rfAOSk(r.recompute(), a.id)[0].style === 'visible', 'cleared');
      near(DW.lineStyle({ style: 'center' }).lw, 0.5, 1e-12, 'weight kept');
      return 'ok';
    });
    test('rfAO: Hide / Show Edges and Line Format on a view edge, by a key that holds across rebuilds', function () {
      var r = rfAODoc(), F = rfAOFront(r), s = r.sheet, w = s.views.filter(function (x) { return x.view.id === F.id; })[0];
      var l = w.proj.lines.visible[0], key = DW.edgeKey({ la: [l[0], l[1]], lb: [l[2], l[3]] });
      var A = w.toSheet([l[0], l[1]]), B = w.toSheet([l[2], l[3]]);
      function onIt(p) { return p.layer === w.layer && p.k === 'line' && Math.hypot(p.a[0] - A[0], p.a[1] - A[1]) + Math.hypot(p.b[0] - B[0], p.b[1] - B[1]) < 1e-6 || p.layer === w.layer && p.k === 'line' && Math.hypot(p.a[0] - B[0], p.a[1] - B[1]) + Math.hypot(p.b[0] - A[0], p.b[1] - A[1]) < 1e-6; }
      var n0 = s.prims.filter(function (p) { return p.layer === w.layer; }).length;
      assert(s.prims.some(onIt), 'edge drawn');
      DW.hideEdge(r.doc, F.id, key);
      assert(DW.hiddenEdges(r.doc, F.id).length === 1, 'listed');
      s = r.recompute();
      assert(!s.prims.some(onIt) && s.prims.filter(function (p) { return p.layer === w.layer; }).length < n0 && s.hiddenEdges.length >= 1, 'hidden');
      assert(DW.toDXF(s).length > 0, 'DXF without it');
      DW.showEdges(r.doc, F.id);
      s = r.recompute();
      assert(s.prims.some(onIt) && !F.edgeFormats, 'shown again');
      DW.setEdgeFormat(r.doc, F.id, key, { style: 'phantom' });
      s = r.recompute();
      assert(s.prims.filter(onIt).every(function (p) { return p.style === 'tanfont' || p.style === 'chain'; }), 'phantom edge');
      assert(rfAOThrows(function () { DW.setEdgeFormat(r.doc, F.id, 'Zjunk', { hide: true }); }), 'bad key');
      return key;
    });
    test('rfAO: Relative View — first face Front, second face Right / Left / Top / Bottom; an inclined face is seen square with True dimensions', function () {
      var F = DW.relativeFrame([0, 0, 1], [1, 0, 0], 'Right');
      assert(F.name === 'Front', 'z front, x right is Front: ' + F.name);
      assert(DW.relativeFrame([0, 0, 1], [0, 1, 0], 'Top').name === 'Front' && DW.relativeFrame([0, 0, 1], [-1, 0, 0], 'Left').name === 'Front' && DW.relativeFrame([0, 1, 0], [0, 0, 1], 'Bottom').name === 'Top', 'named frames');
      assert(rfAOThrows(function () { DW.relativeFrame([0, 0, 1], [0, 0, -1]); }), 'parallel faces refused');
      // a block with a 45° face: its relative view looks square at that face
      var r = rfAODoc('p.units("in");\np.sketch("Front").polyline([[0, 0], [3, 0], [3, 1], [2, 2], [0, 2]], true).end().extrude(1);');
      var fi = -1, ff = -1;
      r.mesh.faces.forEach(function (f, i) { if (Math.abs(f.normal[0] - Math.SQRT1_2) < 1e-6 && Math.abs(f.normal[1] - Math.SQRT1_2) < 1e-6) fi = i; if (f.normal[2] > 1 - 1e-9) ff = i; });
      assert(fi >= 0 && ff >= 0, 'faces found');
      var v = DW.addRelativeView(r.doc, r.mesh, { face1: fi, face2: ff, second: 'Top', x: 10, y: 7 });
      var Fr = DW.viewFrame(r.doc, v);
      near(Fr.e[0], Math.SQRT1_2, 1e-9, 'looks along the face normal'); near(Fr.v[2], 1, 1e-9, 'the front face points up');
      assert(v.dimType === 'true' && v.relative && v.relative.second === 'Top', 'True dimensions');
      var s = r.recompute(), w = s.views.filter(function (x) { return x.view.id === v.id; })[0];
      assert(w && w.proj.lines.visible.length >= 4, 'drawn');
      var ext = DW.extentsOf(r.mesh, Fr);
      near(ext.h, 1, 1e-6, 'the part is 1 in deep');
      var P = r.mesh.positions64, fc = r.mesh.faces[fi], us = [];
      for (var t = fc.start * 9; t < (fc.start + fc.count) * 9; t += 3) us.push(P[t] * Fr.u[0] + P[t + 1] * Fr.u[1] + P[t + 2] * Fr.u[2]);
      near(Math.max.apply(null, us) - Math.min.apply(null, us), Math.SQRT2, 1e-9, 'the 45° face at its true width');
      // faceAt: the Front view's centre is the front face
      var Ff = DW.orientation('Front');
      assert(r.mesh.faces[DW.faceAt(r.mesh, Ff, [1, 1])].normal[2] > 0.99, 'front face picked');
      assert(DW.faceAt(r.mesh, Ff, [10, 10]) === -1, 'nothing outside');
      return v.orient;
    });
  })();
  // --- end rfAO ---
