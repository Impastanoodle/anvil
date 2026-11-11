  // --- rfKX (2026-11-11, lane drawflow2, test-reports/2026-11-11-drawing-flow.md *Left*) --- deleting a view takes
  // what belongs to it (dimensions, annotations, the notes / symbols / Hole Tables on it, the views made from it) as
  // SolidWorks' Delete with Confirm Delete ▸ Yes; the Hole Callout preview text; Tolerance precision (per dimension and
  // the document's) under a 2-place nominal. Self-contained.
  (function () {
    group('rfKX: drawing flow 2 (delete a view with its dependents, Hole Callout preview, tolerance precision)');
    var DW = Drawing;
    var RFKX_PLATE = 'p.name("KXPlate").units("in");\np.sketch("Top").rect(0, -4, 6, 4).end().extrude(0.125, { reverse: true });\n' +
      'p.hole("Top", 1.5, -1, 0.281);\np.hole("Top", 4.5, -1, 0.281);\np.hole("Top", 3, -2.5, 0.5);';
    function rfKXDoc() {
      var r = build(RFKX_PLATE);
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-11', autoDims: false });
      DW.standard3View(doc, r.mesh, r.model.units);
      r.doc = doc;
      r.sheet = function () { return DW.compute(doc, r.mesh, r.model); };
      return r;
    }
    function rfKXView(doc, o) { return doc.views.filter(function (v) { return v.orient === o; })[0]; }

    test('rfKX: Delete a view as Confirm Delete ▸ Yes (opts.dependents): the views made from it (projected, section), their dimensions, callouts, the notes / symbols / Hole Table on them go; a sheet note stays; viewDependents lists them; the plain call keeps its old behaviour', function () {
      var r = rfKXDoc(), F = rfKXView(r.doc, 'Front'), T = rfKXView(r.doc, 'Top'), R = rfKXView(r.doc, 'Right');
      assert(T.parent === F.id && R.parent === F.id, 'Top and Right are projected from Front');
      var S = DW.addSectionView(r.doc, r.mesh, T.id, { axis: 'h', at: -1, sign: 1 });
      DW.addHoleCallout(r.doc, T.id, { c: [1.5, -1], r: 0.1405 });
      DW.addSmartDim(r.doc, T.id, { point: [1.5, -1] }, { point: [4.5, -1] }, [3, 0.5], { lock: 'h' });
      var sh = r.sheet(), wt = sh.views.filter(function (x) { return x.view.id === T.id; })[0];
      var tip = wt.toSheet([3, -4]);
      var nOn = DW.addNote(r.doc, { p: [tip[0] + 0.5, tip[1] - 0.6], text: 'DEBURR', leader: tip });   // its leader on Top: attached by compute
      var nFree = DW.addNote(r.doc, { p: [1, 1.5], text: 'SHEET NOTE', view: 0 });
      var sOn = DW.addSymbol(r.doc, { type: 'datum', p: [tip[0], tip[1] - 0.5], leader: tip });
      DW.addHoleTable(r.doc, T.id, { origin: { p: [0, 0] }, all: true }, wt);
      sh = r.sheet();
      assert(nOn.view === T.id && sOn.view === T.id && !nFree.view, 'attached: ' + JSON.stringify([nOn.view, sOn.view, nFree.view]));
      var dep = DW.viewDependents(r.doc, F.id, true);
      assert(dep.views.length === 4 && dep.children.length === 3 && dep.notes === 1 && dep.symbols === 1 && dep.holeTables === 1 && dep.dims >= 1 && dep.annotations >= 1, 'dependents ' + JSON.stringify(dep));
      var dep0 = DW.viewDependents(r.doc, F.id);
      assert(dep0.views.length === 1 && dep0.notes === 0, 'without all: only section / detail children of Front itself ' + JSON.stringify(dep0));
      // the plain call: projected views become free, notes stay (rfQ, kernel drawings)
      var copy = JSON.parse(JSON.stringify(r.doc));
      assert(DW.deleteView(copy, T.id) === 2 && copy.notes.length === 2 && (copy.holeTables || []).length === 1, 'plain: Top and its section go, its notes stay');
      // Confirm Delete ▸ Yes
      var nv = r.doc.views.length, n = DW.deleteView(r.doc, F.id, { dependents: true });
      assert(n === 4 && r.doc.views.length === nv - 4 && r.doc.views.every(function (v) { return v.parent == null; }), 'views removed ' + n + ', left ' + r.doc.views.map(function (v) { return v.orient; }));
      assert(r.doc.notes.length === 1 && r.doc.notes[0].id === nFree.id && !(r.doc.symbols || []).length && !(r.doc.holeTables || []).length, 'only the sheet note stays: ' + JSON.stringify([r.doc.notes, r.doc.symbols, r.doc.holeTables]));
      sh = r.sheet();
      assert(!sh.dims.length && !(sh.annotations || []).length && sh.prims.some(function (p) { return p.k === 'text' && p.text === 'SHEET NOTE'; }), 'nothing of the views on the sheet');
      // a view with no children: its own items only, its parent untouched
      var r2 = rfKXDoc(), F2 = rfKXView(r2.doc, 'Front'), R2 = rfKXView(r2.doc, 'Right');
      DW.addNote(r2.doc, { p: [1, 1], text: 'ON RIGHT', view: R2.id });
      assert(DW.deleteView(r2.doc, R2.id, { dependents: true }) === 1 && DW.findView(r2.doc, F2.id) && !r2.doc.notes.length, 'Right alone');
      return S.label + ': ' + dep.children.map(function (c) { return c.name; }).join(', ');
    });

    test('rfKX: Hole Callout preview: holeCalloutLines reads what the placed callout reads; a callout placed by its second click keeps its leader (the elbow at the click, text after the shoulder)', function () {
      var r = rfKXDoc(), T = rfKXView(r.doc, 'Top');
      var sh = r.sheet(), w = sh.views.filter(function (x) { return x.view.id === T.id; })[0];
      var pv = DW.holeCalloutLines(r.doc, w, r.mesh, r.model, { c: [1.5, -1], r: 0.1405 });
      var c = w.toSheet([1.5, -1]), at = [c[0] - 1.2, c[1] + 0.8];
      DW.addHoleCallout(r.doc, T.id, { c: [1.5, -1], r: 0.1405, lead: [at[0] - c[0], at[1] - c[1]] });
      sh = r.sheet();
      var an = sh.annotations.filter(function (a) { return a.type === 'holeCallout'; })[0];
      assert(an && an.text === pv.lines.join(' ') && an.text === '2X Ø.281 THRU ALL', 'preview ' + JSON.stringify(pv.lines) + ' placed ' + (an && an.text));
      var t = sh.prims.filter(function (p) { return p.k === 'text' && p.text === '2X Ø.281 THRU ALL'; })[0];
      assert(t && t.anchor === 'end', 'text left of the elbow');
      near(t.p[0], at[0] - pv.shoulder - pv.gap, 1e-9, 'text x after the shoulder');
      near(pv.th, 0.125, 1e-9, 'preview text height .125 in');
      near(T.annotations[0].leadNow[0], at[0] - c[0], 1e-12, 'leader kept'); near(T.annotations[0].leadNow[1], at[1] - c[1], 1e-12, 'leader kept y');
      return pv.lines.join(' ');
    });

    test('rfKX: Tolerance precision: +.010 / -.005 under a 2-place nominal reads +.01/-.01 (Same as nominal), +.010/-.005 at .123 (the dimension\'s or the document\'s), Same as nominal on the dimension beats the document; symmetric; mm; in the DXF and the PDF', function () {
      var r = rfKXDoc(), T = rfKXView(r.doc, 'Top');
      DW.addSmartDim(r.doc, T.id, { point: [1.5, -1] }, { point: [4.5, -1] }, [3, 0.5], { lock: 'h' });
      var d = T.dims[0];
      function txt() { var sh = r.sheet(); return sh.dims.filter(function (x) { return x.view === T.id; })[0].text; }
      DW.setDimProps(d, { prec: 2, tol: { type: 'bilateral', plus: 0.01, minus: 0.005 } });
      assert(txt() === '3.00 +.01/-.01', 'same as nominal: ' + txt());
      DW.setDimProps(d, { tol: { type: 'bilateral', plus: 0.01, minus: 0.005, prec: 3 } });
      assert(txt() === '3.00 +.010/-.005', 'tolerance .123: ' + txt());
      var sh = r.sheet();
      assert(DW.toDXF(sh).indexOf('+.010') >= 0 && DW.toDXF(sh).indexOf('-.005') >= 0, 'in the DXF');
      if (DW.toPDF) { var pdf = DW.toPDF(sh); var ps = typeof pdf === 'string' ? pdf : ''; if (ps) assert(ps.indexOf('.005') >= 0, 'in the PDF'); }
      // the document's Tolerance precision
      DW.setDimProps(d, { tol: { type: 'bilateral', plus: 0.01, minus: 0.005 } });
      r.doc.options = r.doc.options || {}; r.doc.options.tolPrec = 3;
      assert(txt() === '3.00 +.010/-.005', 'document .123: ' + txt());
      assert(DW.docOptions(r.doc).tolPrec === 3 && DW.dimStyle(r.doc).tolPrec === 3, 'docOptions / dimStyle');
      DW.setDimProps(d, { tol: { type: 'bilateral', plus: 0.01, minus: 0.005, prec: 'nominal' } });
      assert(txt() === '3.00 +.01/-.01', 'Same as nominal on the dimension: ' + txt());
      DW.setDimProps(d, { tol: { type: 'symmetric', plus: 0.005, minus: 0.005 } });
      assert(txt() === '3.00 ±.005', 'symmetric at the document .123: ' + txt());
      delete r.doc.options.tolPrec;
      assert(txt() === '3.00 ±.01', 'symmetric same as nominal: ' + txt());
      // millimetres: 1 place nominal, tolerance .12 keeps its trailing zero
      var r3 = build('p.box(40, 20, 10);'); noErrors(r3);
      var doc3 = DW.newDrawing(r3.model, { autoDims: false }); DW.standard3View(doc3, r3.mesh, r3.model.units);
      var F3 = rfKXView(doc3, 'Front'), sh3 = DW.compute(doc3, r3.mesh, r3.model), w3 = sh3.views.filter(function (x) { return x.view.id === F3.id; })[0];
      var b = w3.proj.bounds;
      DW.addSmartDim(doc3, F3.id, { point: [b.umin, b.vmin] }, { point: [b.umax, b.vmin] }, [(b.umin + b.umax) / 2, b.vmin - 5], { lock: 'h' });
      DW.setDimProps(F3.dims[0], { prec: 1, tol: { type: 'bilateral', plus: 0.1, minus: 0.05, prec: 2 } });
      var t3 = DW.compute(doc3, r3.mesh, r3.model).dims.filter(function (x) { return x.view === F3.id; })[0].text;
      assert(t3 === '40.0 +0.10/-0.05', 'mm: ' + t3);
      return txt();
    });
  })();
  // --- end rfKX ---
