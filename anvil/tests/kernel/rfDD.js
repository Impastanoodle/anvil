  // --- rfDD ---
  // (2026-10-26) drawing dimensions from the model: every kind of sketch dimension brings its tolerance / precision /
  // text onto the drawing as a model item (a Path Length dimension too, as the drawing's Path Length), Drawing.autoDims
  // without the drawing-annotations.js wrapper, Hole Callout on a straight / arc slot, a True view's two-pick dimension
  // from a hole's centre (an ellipse) reads the 3D distance
  (function () {
    var S = window.SketchSolver, DW = typeof Drawing !== 'undefined' ? Drawing : null;
    group('rfDD: drawing dimensions from the model (sketch dimension properties, slot callouts, True ellipse centres)');
    // a 4 x 2 inch plate at (1, 1) with a R.5 corner, a Ø.25 hole; the sketch's dimensions of every kind, each with
    // its own properties
    function rfDDDrawing(extra) {
      var r = build('p.units("in");\np.sketch("Front").line(1, 1, 5, 1).line(5, 1, 5, 2.5).arc(4.5, 2.5, 0.5, 0, 90).line(4.5, 3, 1, 3).line(1, 3, 1, 1).circle(2, 2, 0.125).extrude(0.25);');
      noErrors(r);
      var f = r.model.features[0];
      function ok(x, what) { assert(x && x.ok !== false, what + ': ' + JSON.stringify(x)); return x; }
      var n0 = (f.rels || []).length;
      ok(S.addPathLength(f, ['1', '2', '3']), 'path length');
      ok(S.addOrdinate(f, { axis: 'x', zero: '4', target: '5' }), 'ordinate');
      var R = f.rels;
      R[n0].prec = 3; R[n0].suffix = 'REF';
      var ordIx = R.length - 1;
      R[ordIx].prec = 3;
      f.dims = [{ e: 0, k: 'len', prec: 2, suffix: 'TYP' }, { e: 5, k: 'dia', tol: { type: 'symmetric', plus: 0.002 }, prec: 3 }, { e: 2, k: 'r', prefix: '2X', prec: 3 }];
      if (extra) extra(f, R);
      var b = K.rebuild(r.model), mesh = K.meshFromBody(b.body);
      var doc = DW.newDrawing(r.model, { date: '2026-10-26' }); DW.standard3View(doc, mesh, 'in');
      doc.modelItems = { source: 'entire', marked: true, holeLocations: false, holeCallouts: true, annotations: false, dedupe: true };
      var sheet = DW.compute(doc, mesh, r.model, { build: b });
      return { r: r, f: f, n0: n0, ordIx: ordIx, doc: doc, sheet: sheet, mesh: mesh, build: b };
    }
    test('rfDD: Model Items bring every sketch dimension kind with its properties — length "4.00 TYP", diameter "Ø.250 ±.002", radius "2X R.500", ordinate member ".. 1.000", and the Path Length "5.785 REF" as a drawing Path Length on the Front view (value = the sketch\'s 1.5 + π/4 + 3.5), in the DXF', function () {
      if (!DW || !S || !S.addPathLength) return 'no drawing engine / solver';
      var x = rfDDDrawing(), dims = x.sheet.dims, all = dims.map(function (d) { return d.kind + ' ' + d.text; }).join(' | ');
      var front = x.sheet.views.filter(function (w) { return w.view.orient === 'Front'; })[0];
      function has(t) { return dims.some(function (d) { return d.text === t; }); }
      assert(has('4.00 TYP'), 'length: ' + all);
      assert(dims.some(function (d) { return d.kind === 'dia' && /^Ø\.250 ±\.002$/.test(d.text); }), 'diameter: ' + all);
      assert(dims.some(function (d) { return d.kind === 'rad' && d.text === '2X R.500'; }), 'radius: ' + all);
      var od = dims.filter(function (d) { return d.kind === 'ordinate'; })[0];
      assert(od && / 1\.000$|, 1\.000/.test(od.text), 'ordinate member at 3 places: ' + (od && od.text) + ' | ' + all);
      var pl = dims.filter(function (d) { return d.kind === 'pathlen'; })[0], want = 1.5 + Math.PI / 4 + 3.5;
      assert(pl, 'a path length model item: ' + all);
      near(pl.value, want, 1e-9, 'path length value');
      near(pl.value, S.measure(x.f, 'pathlength', x.f.rels[x.n0].refs), 1e-9, 'the sketch\'s own value');
      assert(pl.view === front.view.id && pl.text === '5.785 REF' && pl.sketchName === 'D' + pl.sketchName.slice(1), 'text ' + pl.text + ' ' + pl.sketchName);
      assert(x.sheet.prims.some(function (p) { return p.k === 'text' && p.text === '5.785 REF' && p.layer === 'DIMENSIONS'; }), 'drawn');
      assert(DW.toDXF(x.sheet).indexOf('5.785 REF') >= 0, 'in the DXF');
      // one arc ref with the arc's true sweep, in the view's frame
      var arc = pl.refs.filter(function (q) { return q.kind === 'rad'; })[0];
      assert(arc && Math.abs(arc.r - 0.5) < 1e-9, 'the arc ref ' + JSON.stringify(arc));
      // Mark for drawing off leaves it out
      x.f.rels[x.n0].mark = false;
      var sh2 = DW.compute(x.doc, x.mesh, x.r.model, { build: x.build });
      assert(!sh2.dims.some(function (d) { return d.kind === 'pathlen'; }), 'unmarked: left out');
      return [pl.text, od.text].join(' | ');
    });
    test('rfDD: Drawing.autoDims is one function in drawing-sheet.js (no rfBA wrapper) and still brings the sketches\' angle / path length items after the linear ones; the drawing\'s own Dimension PM settings on the path length win', function () {
      if (!DW || !S || !S.addPathLength) return 'no drawing engine / solver';
      assert(!DW.autoDims.rfBA, 'no wrapper flag');
      var x = rfDDDrawing(function (f) { S.addRelation(f, 'angle', ['1', '3']); });
      var kinds = x.sheet.dims.filter(function (d) { return d.auto; }).map(function (d) { return d.kind; });   // (autoDims reads the compute's context)
      var lastLinear = Math.max(kinds.lastIndexOf('h'), kinds.lastIndexOf('v'), kinds.lastIndexOf('dia'), kinds.lastIndexOf('rad'));
      assert(kinds.indexOf('pathlen') > lastLinear && kinds.indexOf('angle') > lastLinear, 'angle and path length after the linear items: ' + kinds.join(','));
      var pl = x.sheet.dims.filter(function (d) { return d.kind === 'pathlen'; })[0];
      x.doc.dimProps = {}; x.doc.dimProps[pl.style] = { prec: 1 };
      var sh2 = DW.compute(x.doc, x.mesh, x.r.model, { build: x.build });
      var p2 = sh2.dims.filter(function (d) { return d.kind === 'pathlen'; })[0];
      assert(p2.text === '5.8 REF', 'drawing precision wins: ' + p2.text);
      return kinds.join(',');
    });
    test('rfDD: Hole Callout on a slot — a straight slot\'s end arc gives ".375 X 1.375 SLOT", an arc slot\'s end or side arc "R1.000 ARC SLOT .250 WIDE 60°"; the callout follows the slot when it is made wider; a plain arc is refused', function () {
      if (!DW) return 'no drawing engine';
      function code(w) { return 'p.units("in");\np.sketch("Front").rect(0, 0, 10, 6).slot(2, 3, 3, 3, ' + w + ').arcSlot(7, 3, 1, 30, 90, 0.25).extrude(0.25);'; }
      var r = build(code(0.375)); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-26' }); DW.standard3View(doc, r.mesh, 'in'); doc.autoDims = false;
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var fv = doc.views.filter(function (v) { return v.orient === 'Front'; })[0], w = sh.views.filter(function (x) { return x.view.id === fv.id; })[0];
      var ss = DW.slotsIn(w.proj)[0], as = DW.arcSlotsIn(w.proj)[0];
      assert(ss && as, 'both slots found');
      DW.addSlotCallout(doc, fv.id, w.proj, { c: ss.ends[0].c, r: ss.ends[0].r });
      DW.addSlotCallout(doc, fv.id, w.proj, { c: as.sides[0].c, r: as.sides[0].r });
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var texts = sh.dims.filter(function (d) { return d.view === fv.id; }).map(function (d) { return d.text; });
      assert(texts.indexOf('.375 X 1.375 SLOT') >= 0 && texts.indexOf('R1.000 ARC SLOT .250 WIDE 60°') >= 0, 'texts ' + texts.join(' | '));
      assert(sh.prims.some(function (p) { return p.k === 'text' && p.text === '.375 X 1.375 SLOT'; }), 'drawn');
      var bad = null;
      try { DW.addSlotCallout(doc, fv.id, w.proj, { c: [99, 99], r: 0.2 }); } catch (e) { bad = e.message; }
      assert(bad && /slot/.test(bad), 'refused: ' + bad);
      // the part changes: a wider straight slot
      var r2 = build(code(0.5)); noErrors(r2);
      sh = DW.compute(doc, r2.mesh, r2.model, { build: r2.build });
      texts = sh.dims.filter(function (d) { return d.view === fv.id; }).map(function (d) { return d.text + (d.dangling ? ' (dangling)' : ''); });
      assert(texts.indexOf('.500 X 1.500 SLOT') >= 0, 'follows the slot: ' + texts.join(' | '));
      return texts.join(' | ');
    });
    test('rfDD: in a True isometric view a two-pick dimension from a hole\'s centre (an ellipse) to a corner reads the 3D distance, not the projected one', function () {
      if (!DW) return 'no drawing engine';
      var r = build('p.sketch("Front").rect(0, 0, 100, 50).circle(30, 25, 5).extrude(10);'); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-26' }); DW.standard3View(doc, r.mesh, r.model.units);
      var iso = doc.views.filter(function (v) { return v.orient === 'Isometric'; })[0], F0 = DW.frameOf(DW.orientation('Isometric'));
      function pj(p) { return [Kernel.vec.dot(p, F0.u), Kernel.vec.dot(p, F0.v)]; }
      near(DW.trueLength(r.mesh, F0, pj([30, 25, 10]), pj([100, 50, 10])), Math.hypot(70, 25), 1e-6, 'centre to corner (trueLength)');
      DW.setDimType(doc, iso.id, 'true');
      iso.dims = [DW.smartDim({ center: { c: pj([30, 25, 10]) } }, { point: pj([100, 50, 10]) }, null, { aligned: true })];
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), sd = sh.dims.filter(function (x) { return x.view === iso.id; })[0];
      assert(sd, 'a dimension');
      near(sd.value, Math.hypot(70, 25), 1e-6, 'true 3D distance (' + sd.text + ')');
      return sd.text;
    });
    // ---- rfDD2 (follow-up): Dimension Type True / Projected, a narrow span's text kept off its neighbour, BOM per sheet
    test('rfDD2: a 4 × 2 × 1 inch block — the Standard 3 View isometric starts Dimension Type True: its 4.000 edge reads 4.000 (Projected 3.266, 4 × √(2/3)); the choice is saved with the view (JSON round trip); orthographic views stay projected; an auxiliary view can be True', function () {
      if (!DW) return 'no drawing engine';
      var r = build('p.units("in");\np.sketch("Front").rect(0, 0, 4, 2).extrude(1);'); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-26' }); DW.standard3View(doc, r.mesh, 'in'); doc.autoDims = false;
      var iso = doc.views.filter(function (v) { return v.orient === 'Isometric'; })[0], front = doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
      assert(iso.dimType === 'true' && !front.dimType, 'defaults: iso ' + iso.dimType + ', front ' + front.dimType);
      var F0 = DW.frameOf(DW.orientation('Isometric'));
      function pj(p) { return [Kernel.vec.dot(p, F0.u), Kernel.vec.dot(p, F0.v)]; }
      iso.dims = [DW.smartDim({ point: pj([0, 2, 1]) }, { point: pj([4, 2, 1]) }, null, { aligned: true })];
      function val(dc) { var sh = DW.compute(dc, r.mesh, r.model, { build: r.build }); var d = sh.dims.filter(function (x) { return x.view === iso.id; })[0]; return d; }
      var d1 = val(doc);
      near(d1.value, 4, 1e-9, 'True'); assert(d1.text === '4.000', 'text ' + d1.text);
      DW.setDimType(doc, iso.id, 'projected');
      var d2 = val(doc);
      near(d2.value, 4 * Math.sqrt(2 / 3), 1e-6, 'Projected'); assert(d2.text === '3.266', 'text ' + d2.text);
      var back = JSON.parse(JSON.stringify(doc)), isoB = back.views.filter(function (v) { return v.id === iso.id; })[0];
      assert(!isoB.dimType, 'Projected saved');
      near(val(back).value, 4 * Math.sqrt(2 / 3), 1e-6, 'Projected after the round trip');
      DW.setDimType(back, iso.id, 'true');
      var back2 = JSON.parse(JSON.stringify(back));
      near(val(back2).value, 4, 1e-9, 'True after the round trip');
      var aux = DW.addAuxiliaryView(doc, r.mesh, front.id, { a: [0, 0], b: [4, 2] });
      assert(!aux.dimType, 'an auxiliary view starts Projected');
      DW.setDimType(doc, aux.id, 'true');
      assert(aux.dimType === 'true', 'and can be True');
      var bad = null;
      try { DW.setDimType(doc, DW.addProjectedView(doc, r.mesh, front.id, 'right').id, 'true'); } catch (e) { bad = e.message; }
      assert(bad, 'a projected view has no True');
      return d1.text + ' / ' + d2.text;
    });
    test('rfDD2: a .100 notch dimensioned beside a chain dimension on one line — its text, too wide for the span, goes outside on the free side (left) instead of on the neighbour\'s dimension line; alone it keeps the default side (right)', function () {
      if (!DW) return 'no drawing engine';
      var r = build('p.units("in");\np.sketch("Front").polyline([[0,0],[4,0],[4,2],[1.1,2],[1.1,1.5],[1,1.5],[1,2],[0,2]], true).extrude(0.25);'); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-26' }); DW.standard3View(doc, r.mesh, 'in'); doc.autoDims = false;
      var front = doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
      function dim(a, b) { var d = DW.smartDim({ point: a }, { point: b }, [(a[0] + b[0]) / 2, 2.4], { scale: 1 }); delete d.tside; return d; }
      function textX(sh, i) { var d = sh.dims.filter(function (x) { return x.view === front.id && x.index === i; })[0]; return d && d.tbox ? (d.tbox.x0 + d.tbox.x1) / 2 : null; }
      front.dims = [dim([1, 2], [1.1, 2])];
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views.filter(function (x) { return x.view.id === front.id; })[0];
      var x10 = w.toSheet([1, 2])[0], x11 = w.toSheet([1.1, 2])[0], alone = textX(sh, 0);
      assert(alone > x11, 'alone: right of the notch ' + alone + ' > ' + x11);
      front.dims = [dim([1.1, 2], [4, 2]), dim([1, 2], [1.1, 2])];
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var nx = textX(sh, 1), d1 = sh.dims.filter(function (x) { return x.view === front.id && x.index === 1; })[0];
      assert(d1.text === '.100' && nx < x10, 'beside the chain: left of the notch ' + nx + ' < ' + x10 + ' (' + d1.text + ')');
      return '.100 at ' + nx.toFixed(3) + ' (alone ' + alone.toFixed(3) + ')';
    });
    test('rfDD2: Add Sheet starts the new sheet with no BOM while sheet 1 keeps its own (SolidWorks: a BOM table belongs to the sheet it was inserted on)', function () {
      if (!DW) return 'no drawing engine';
      var r = build('p.sketch("Front").rect(0, 0, 40, 20).extrude(5);'); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-26' }); DW.standard3View(doc, r.mesh, r.model.units);
      doc.bom = { show: true, anchor: 'top-right' };
      var i = DW.addSheet(doc, {});
      assert(doc.activeSheet === i && !doc.bom, 'new sheet: no BOM ' + JSON.stringify(doc.bom));
      DW.activateSheet(doc, 0);
      assert(doc.bom && doc.bom.show, 'sheet 1 keeps its BOM');
      return 'sheet ' + (i + 1) + ' without a BOM';
    });
  })();
  // --- end rfDD ---
