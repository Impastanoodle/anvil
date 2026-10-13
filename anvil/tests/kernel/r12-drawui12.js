  // --- r12/drawui12 ---
  test('lazy compute: uncached views are placeholders of their true size (no dims, annotations or model items yet); with the projections put in, it equals the synchronous sheet', function () {
    var code = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0].code;
    var r = build(code), doc = DW.newDrawing(r.model, { date: '2026-09-25' });
    DW.standard3View(doc, r.mesh, r.model.units, { autoInsert: false });
    var lazy = DW.compute(doc, r.mesh, r.model, { lazy: true });
    assert(lazy.pending.length === 4 && lazy.views.every(function (w) { return w.pending; }), 'pending ' + lazy.pending.length);
    assert(!lazy.dims.length && !lazy.annotations.length, 'nothing placed on a view still to come');
    assert(lazy.prims.filter(function (p) { return p.k === 'pending'; }).length === 4, 'placeholders');
    assert(DW.svgParts(lazy, { live: true }).groups.some(function (g) { return g.body.indexOf('dw-pending') >= 0; }) && DW.toSVG(lazy).indexOf('dw-pending') < 0, 'placeholders drawn live only');
    assert(!r.mesh._drawingProj || !Object.keys(r.mesh._drawingProj).length, 'a lazy compute works nothing out');
    // the views worked out elsewhere (as drawing-worker.js does), on a structured copy of the mesh
    var copy = {};
    Object.keys(r.mesh).forEach(function (k) { if (k.indexOf('_drawing') !== 0) copy[k] = r.mesh[k]; });
    copy = typeof structuredClone === 'function' ? structuredClone(copy) : copy;
    lazy.pending.forEach(function (j) { DW.putProjection(r.mesh, j.key, JSON.parse(JSON.stringify(DW.projectView(copy, j.frame, { display: j.display, tangent: j.tangent })))); });
    var done = DW.compute(doc, r.mesh, r.model, { lazy: true });
    assert(!done.pending.length && !done.views.some(function (w) { return w.pending; }), 'still pending');
    lazy.views.forEach(function (w, i) {
      var b = done.views[i].box;
      assert(['x0', 'y0', 'x1', 'y1'].every(function (q) { return Math.abs(w.box[q] - b[q]) < 1e-9; }), 'placeholder box differs from the view: ' + JSON.stringify(w.box) + ' vs ' + JSON.stringify(b));
    });
    var r2 = build(code), doc2 = DW.newDrawing(r2.model, { date: '2026-09-25' });
    DW.standard3View(doc2, r2.mesh, r2.model.units, { autoInsert: false });
    var sync = DW.compute(doc2, r2.mesh, r2.model);
    assert(DW.toSVG(done) === DW.toSVG(sync), 'the sheet from put-in projections differs from the synchronous one');
    return lazy.pending.length + ' views pending, then identical (' + done.dims.length + ' dims)';
  });
  // --- end r12/drawui12 ---

