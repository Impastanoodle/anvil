  // --- rfJU (2026-11-06, lane shopflow-2, test-reports/2026-11-06-shop-flow.md findings 2, 4, 5) --- (2) a multi-edge
  // Edge Flange whose placement moves the walls in off the edges (Material Inside / Outside, Bend from Virtual Sharp,
  // Tangent to Bend) mitres every shared corner as SolidWorks does (Butt, bend closed, gap .01 in) even without
  // `miter`: before, both walls ran through the corner (overlapping metal, folded over the blank × T, no gap for Closed
  // Corner). (4) the flat DXF's $EXTMIN / $EXTMAX are the blank's extents, the bend notes outside them. (5) a Hole Table
  // on a view with no holes is refused; a Punch Table keeps its empty table. 14 ga, R .075, K .5 (a bend's exact
  // volume is BA × T per length), a 10 x 6 base.
  (function () {
    group('rfJU: multi-edge Edge Flange auto mitre (Closed Corner on it), flat DXF extents = the blank, Hole Table refused on a view with no holes');
    var DW = Drawing, T = 0.0747, R = 0.075, G = 0.01;
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n';
    var E4 = '[[5, ' + T + ', 0], [5, ' + T + ', 6], [0, ' + T + ', 3], [10, ' + T + ', 3]]', E2 = '[[5, ' + T + ', 0], [0, ' + T + ', 3]]', E1 = '[[5, ' + T + ', 0]]';
    function fl(edges, o) { return 'p.flange(2, ' + edges + ', { lengthRef: "outer", ' + (o || 'position: "inside"') + ' });\n'; }
    function blankArea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? Math.abs(K.signedArea(l)) : -Math.abs(K.signedArea(l))); }, 0); }
    function make(code) {
      var r = build(code); noErrors(r);
      var c = Evaluate.checkBody(r.body, { maxPairs: 1 });
      assert(!c.openEdges.length && !c.nonManifoldEdges.length, 'closed solid: ' + c.openEdges.length + ' open, ' + c.nonManifoldEdges.length + ' non-manifold');
      r.flat = K.flatPattern(r.model, r.build, r.mesh);
      r.ex = r.mp.volume - blankArea(r.flat) * T;   // folded − blank × T
      return r;
    }
    test('rfJU: four edges of the 10 x 6 base in one Edge Flange, Material Inside, no miter set: each corner mitred (walls stop T + g/√2 from the outer corner), as miter: true does; one edge folds to its blank × T exactly, four corners are four times one', function () {
      var one = make(HEAD + fl(E1)), two = make(HEAD + fl(E2)), four = make(HEAD + fl(E4)), mit = make(HEAD + fl(E4, 'position: "inside", miter: true'));
      near(one.ex, 0, 1e-12, 'one edge: folded − blank × T');
      near(four.mp.volume, mit.mp.volume, 1e-12, 'the same part as miter: true');
      near(blankArea(four.flat), blankArea(mit.flat), 1e-12, 'the same blank');
      near(four.ex, 4 * two.ex, 1e-12, 'four corners = 4 × one corner');
      assert(two.ex < 0 && two.ex > -1e-3, 'one corner\'s closed bend (helicoid) under its strip, as SolidWorks: ' + two.ex);
      // the front wall (z 0..T) ends T + g/√2 from the corner x = 0
      var ins = four.body.pointTester(), xe = T + G / Math.SQRT2;
      assert(ins([xe + 0.002, 1, T / 2]) && !ins([xe - 0.002, 1, T / 2]), 'front wall ends at x = ' + xe.toFixed(5));
      assert(ins([T / 2, 1, xe + 0.002]) && !ins([T / 2, 1, xe - 0.002]), 'side wall ends at z = ' + xe.toFixed(5));
      return 'corner ' + two.ex.toExponential(4) + ' in³';
    });
    test('rfJU: Rectangular .25 Corner Reliefs at the four mitred corners: the folded box = its blank × T exactly', function () {
      var r0 = build(HEAD + fl(E4)); noErrors(r0);
      var cs = K.cornerReliefCandidates(r0.model, r0.build).map(function (c) { return c.at; });
      assert(cs.length === 4, 'four corners: ' + JSON.stringify(cs));
      var r = make(HEAD + fl(E4) + 'p.cornerRelief(' + JSON.stringify(cs) + ', 0.25, { reliefType: "rect" });\n');
      nearRel(r.mp.volume, blankArea(r.flat) * T, 1e-9, 'folded = blank × T');
      assert(r.flat.loops.length === 1, 'one blank loop');
    });
    test('rfJU: every placement that moves the walls in (inside, outside, virtualSharp, tangentToBend) mitres unasked = miter: true (closed, manifold); Bend Outside unmitred keeps its open corner (folded = blank × T)', function () {
      ['inside', 'outside', 'virtualSharp', 'tangentToBend'].forEach(function (pos) {
        var a = make(HEAD + fl(E2, 'position: "' + pos + '"')), b = make(HEAD + fl(E2, 'position: "' + pos + '", miter: true'));
        near(a.mp.volume, b.mp.volume, 1e-12, pos + ': volume');
      });
      var bo = make(HEAD + fl(E2, 'position: "bendOutside"'));
      near(bo.ex, 0, 1e-12, 'Bend Outside, open corner');
    });
    test('rfJU: Closed Corner on the auto-mitred corner: Butt .01 is refused (the walls are already g/√2 apart), Butt .005 closes it and adds exactly its blank strip × T', function () {
      var pt = '[[' + (T + G / Math.SQRT2) + ', 1, ' + T / 2 + ']]';
      var r0 = make(HEAD + fl(E4));
      var bad = build(HEAD + fl(E4) + 'p.closedCorner(' + pt + ', { cornerType: "butt", gap: 0.01 });\n');
      var msg = Object.keys(bad.errors).map(function (k) { return bad.errors[k]; }).join(' ');
      assert(/already within the gap/.test(msg), 'refused: ' + msg);
      var r = make(HEAD + fl(E4) + 'p.closedCorner(' + pt + ', { cornerType: "butt", gap: 0.005 });\n');
      assert(r.mp.volume > r0.mp.volume, 'adds metal');
      near(r.ex, r0.ex, 1e-12, 'the added metal is its blank strip × T');
    });
    test('rfJU: flat DXF header (R12, R2000, Notes on): $EXTMIN 0,0 and $EXTMAX the blank size; the bend notes outside it stay in the file', function () {
      var r = build('p.units("in");\np.sheet(0.0598, 0.06, 0.44);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(2, [[2, 0.0598, 3]], { position: "inside", lengthRef: "outer" });\n'); noErrors(r);
      var flat = K.flatPattern(r.model, r.build, r.mesh);
      ['R12', 'R2000'].forEach(function (v) {
        var t = K.exportDXFFlat(flat, 'in', { version: v, notes: true }), d = DxfCheck.parse(t);
        var mn = d.header.$EXTMIN.map(Number), mx = d.header.$EXTMAX.map(Number);
        near(mn[0], 0, 1e-9, v + ' EXTMIN x'); near(mn[1], 0, 1e-9, v + ' EXTMIN y');
        near(mx[0], flat.size[0], 1e-6, v + ' EXTMAX x'); near(mx[1], flat.size[1], 1e-6, v + ' EXTMAX y');
        var texts = d.entities.filter(function (e) { return e.type === 'TEXT'; });
        assert(texts.some(function (e) { return e.p[1] < 0 || e.p[1] > flat.size[1]; }), v + ': the note outside the blank still written: ' + JSON.stringify(texts.map(function (e) { return e.p; })));
        assert(DxfCheck.check(t, { units: 'in' }).ok, v + ' reads back');
      });
    });
    test('rfJU: Hole Table on a view with no holes is refused (flat of a louvered panel, Front of a plain plate); a Punch Table on the same flat is made; a view with holes still takes one', function () {
      var T18 = 0.0478, code = 'p.units("in");\np.sheet(' + T18 + ', 0.05, 0.44);\np.sketch("Top").rect(0, -8, 12, 8).end().baseFlange();\np.formingTool("louver", [6, ' + T18 + ', 4], { angle: 90 });\n';
      var r = build(code); noErrors(r);
      var doc = DW.newDrawing(r.model, { projection: 'third' });
      DW.standard3View(doc, r.mesh, 'in');
      var fv = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, fit: true });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var w = sh.views.filter(function (x) { return x.view.id === fv.id; })[0], o = { p: [w.flat.bbox.umin, w.flat.bbox.vmin] }, threw = null;
      try { DW.addHoleTable(doc, fv.id, { all: true, origin: o }, w); } catch (e) { threw = e.message; }
      assert(threw && /no holes in/.test(threw), 'flat refused: ' + threw);
      assert(!(doc.holeTables || []).length, 'no table added');
      var pt = DW.addHoleTable(doc, fv.id, { punch: true, origin: o }, w);
      assert(pt && doc.holeTables.length === 1, 'Punch Table made');
      // a plain plate's Front view (no circles) and, with two holes, its Top view
      var p2 = build('p.units("in");\np.sketch("Top").rect(0, -2, 4, 2).end().extrude(0.25);\n'); noErrors(p2);
      var d2 = DW.newDrawing(p2.model, {}); DW.standard3View(d2, p2.mesh, 'in');
      var s2 = DW.compute(d2, p2.mesh, p2.model), w2 = s2.views[0], b2 = w2.proj.bounds;
      threw = null;
      try { DW.addHoleTable(d2, w2.view.id, { all: true, origin: { p: [b2.umin, b2.vmin] } }, w2); } catch (e) { threw = e.message; }
      assert(threw && /no holes in/.test(threw), 'plate refused: ' + threw);
      var p3 = build('p.units("in");\np.sketch("Top").rect(0, -2, 4, 2).end().extrude(0.25);\np.sketch("Top", 0.25).circle(1, -1, 0.1405).circle(3, -1, 0.1405).end().cut("through", { reverse: true });\n'); noErrors(p3);
      var d3 = DW.newDrawing(p3.model, {}); DW.standard3View(d3, p3.mesh, 'in');
      var s3 = DW.compute(d3, p3.mesh, p3.model), w3 = s3.views.filter(function (x) { return x.view.orient === 'Top'; })[0], b3 = w3.proj.bounds;
      var ht = DW.addHoleTable(d3, w3.view.id, { all: true, origin: { p: [b3.umin, b3.vmin] } }, w3);
      assert(ht && d3.holeTables.length === 1, 'holes: a table');
    });
  })();
