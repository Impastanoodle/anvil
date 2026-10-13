  // --- rfAB: Model Items bring the sketch dimensions (typed 10 x 6, ordinates) into the Top view and the flat-pattern view ---
  (function () {
    group('rfAB: Model Items of an inch sheet-metal part — sketch Smart Dimensions and ordinates where they read true (Top view, flat pattern), hole callouts, flange lengths; slots drawn as lines and arcs keep their callouts');
    if (typeof Drawing === 'undefined' || typeof SketchSolver === 'undefined') return;
    var DW = Drawing, SS = SketchSolver;
    // the shop audit's blank: a 10 x 6 Top sketch drawn as four lines with typed lengths (Smart Dimensions on lines 0
    // and 1), four Ø.281 holes, a straight slot and an arc slot drawn as lines and arcs, a horizontal ordinate set from
    // the left edge to two holes; 16 ga Base Flange, a 1.5 Edge Flange on the x = 0 edge and a 1.0 one on y = 0
    function rfABPart() {
      var m = K.newModel('rfAB');
      K.runScript(m, ['p.name("Shop").units("in");', 'p.sheet(0.0598, 0.0598, 0.5);',
        'p.sketch("Top").line(0,0,10,0).line(10,0,10,6).line(10,6,0,6).line(0,6,0,0)',
        '.circle(1,1,0.1405).circle(9,1,0.1405).circle(1,5,0.1405).circle(9,5,0.1405)',
        '.slot(4.5,3,5.5,3,0.375).arcSlot(7,3,1,30,90,0.25)',
        '.dim(0, "len", {value: 10}).dim(1, "len", {value: 6})',
        '.end().baseFlange(0.0598);',
        'p.flange(1.5, [[0, 0.0598, -3]]);', 'p.flange(1.0, [[5, 0.0598, 0]], { reverse: true });'].join('\n'));
      var f = m.features[0];
      SS.explodeSlot(f, 8);
      SS.explodeSlot(f, f.entities.map(function (e) { return e.t; }).indexOf('aslot'));
      var cl = -1;
      f.entities.forEach(function (e, i) { if (cl < 0 && e.t === 'line' && e.construction && Math.abs(e.y1 - 3) < 1e-9 && Math.abs(e.y2 - 3) < 1e-9) cl = i; });
      if (cl >= 0) f.dims.push({ e: cl, k: 'len' });   // the slot's centre distance, as the typed slot places it
      var o = SS.addOrdinate(f, { zero: '3', target: '4', axis: 'x', at: -0.5 });
      SS.addOrdinate(f, { zero: '3', target: '5', axis: 'x', ord: o.ord });
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      var doc = DW.newDrawing(m, { date: '2026-10-12' });
      DW.standard3View(doc, mesh, 'in');
      var fv = DW.addFlatView(doc, mesh, { model: m, build: b, x: 300, y: 80 });
      var r = { model: m, build: b, mesh: mesh, doc: doc, flat: fv, cl: cl };
      r.compute = function (mi) { r.doc.modelItems = mi; r.sheet = DW.compute(r.doc, r.mesh, r.model, { build: r.build }); return r.sheet; };
      r.texts = function (vid) { return r.sheet.dims.filter(function (d) { return vid == null || d.view === vid; }).map(function (d) { return d.text; }); };
      r.role = function (role) { return r.doc.views.filter(function (v) { return v.role === role; })[0]; };
      return r;
    }
    test('rfAB: Model Items (Entire model, all views) put the blank\'s typed 10.000 / 6.000 and the ordinate set 0, 1.000, 9.000 on the Top view, the hole callout 4X Ø.281 and the slot callouts there, the flange lengths 1.620 / 1.120 on Front / Right; the slot\'s own centre distance is not repeated', function () {
      var r = rfABPart();
      noErrors({ errors: r.build.errors });
      r.compute({ source: 'entire' });
      var top = r.role('top'), tt = r.texts(top.id);
      ['10.000', '6.000', '0, 1.000, 9.000', '4X Ø.281', '.375 X 1.375 SLOT', 'R1.000 ARC SLOT .250 WIDE 60°'].forEach(function (x) { assert(tt.indexOf(x) >= 0, x + ' on Top: ' + tt.join(' | ')); });
      assert(r.texts(r.role('front').id).indexOf('1.620') >= 0 && r.texts(r.role('right').id).indexOf('1.120') >= 0, 'flange lengths ' + r.texts().join(' | '));
      var w = r.sheet.dims.filter(function (d) { return d.view === top.id && d.text === '10.000'; })[0];
      assert(w && w.kind === 'h' && w.sketchDim === r.model.features[0].id + ':0' && w.side === -1, '10.000 horizontal below, from the sketch: ' + JSON.stringify(w && { k: w.kind, s: w.sketchDim, side: w.side }));
      var sk = r.model.features[0], ci = sk.dims.length - 1;
      assert(r.cl >= 0 && sk.dims[ci].e === r.cl, 'slot centreline dimensioned');
      assert(!r.sheet.dims.some(function (d) { return d.sketchDim === sk.id + ':' + ci; }), 'no slot centre distance: ' + tt.join(' | '));
      return tt.join(' | ');
    });
    test('rfAB: Model Items into the flat-pattern view only (the audit: the flat view selected) insert the blank\'s 10.000 / 6.000, its ordinates and hole callouts at their flat positions, hole locations from the flat\'s edges, and no bend radius / bend deduction texts', function () {
      var r = rfABPart();
      r.compute({ source: 'entire', views: [r.flat.id] });
      var t = r.texts();
      assert(r.sheet.dims.length && r.sheet.dims.every(function (d) { return d.view === r.flat.id; }), 'flat only: ' + t.join(' | '));
      ['10.000', '6.000', '0, 1.000, 9.000', '4X Ø.281', '.375 X 1.375 SLOT'].forEach(function (x) { assert(t.indexOf(x) >= 0, x + ' on the flat: ' + t.join(' | ')); });
      assert(!t.some(function (x) { return /^R?\.060$|^\.098$/.test(x); }), 'no bend radius / deduction: ' + t.join(' | '));
      // the blank's bottom edge sits where it lies in the sketch (the flat is the sketch plane): 0 .. 10 at v = 0
      var w = r.sheet.dims.filter(function (d) { return d.text === '10.000'; })[0];
      near(Math.min(w.a[0], w.b[0]), 0, 1e-9, 'from x 0'); near(w.a[1], 0, 1e-9, 'at the bottom edge');
      // holes located from the flat's left edge (1.5 flange + 1 = 2.641 with the bend deduction)
      var fd = DW.flatData(r.mesh), hl = r.sheet.dims.filter(function (d) { return d.hole && d.kind === 'h'; }).map(function (d) { return d.value; });
      assert(hl.some(function (x) { return Math.abs(x - (1 - fd.bbox.umin)) < 1e-9; }), 'hole location from the flat edge ' + hl.join());
      var ann = (r.sheet.annotations || []).filter(function (a) { return a.type === 'bendNote'; });
      assert(ann.length === 2, 'bend notes stay notes: ' + ann.length);
      return t.join(' | ');
    });
    test('rfAB: Selected feature (the blank\'s sketch) brings its 10.000 / 6.000 to the Top view and the flat; a dimension marked off (mark: false) stays out; the bracket without sketch dimensions keeps its set', function () {
      var r = rfABPart(), sk = r.model.features[0];
      r.compute({ source: 'feature', feature: sk.id });
      var t = r.texts();
      assert(t.filter(function (x) { return x === '10.000'; }).length === 2 && t.filter(function (x) { return x === '6.000'; }).length === 2, 'Top and flat: ' + t.join(' | '));
      sk.dims[1].mark = false;
      r.compute({ source: 'entire' });
      assert(r.texts().indexOf('6.000') < 0 && r.texts().indexOf('10.000') >= 0, 'unmarked: ' + r.texts().join(' | '));
      return t.join(' | ');
    });
  })();
  // --- end rfAB ---

