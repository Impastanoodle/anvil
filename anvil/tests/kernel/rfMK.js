  // --- rfMK (2026-11-13, lane drawperf) --- the drawing of a perforated panel in less time, the same drawing: what does
  // not depend on the view is worked out once per mesh (facet faces, corners, seam runs: mesh._drawingHLR), an occluder
  // nowhere in front of a segment is passed over before the hidden-line test (and a grid cell holding none is not
  // opened), meshEdges finds a piece's split points by a binary search and its lines by a numeric hash, the curve and
  // circle lookups use integer cells, and the title block's mass is integrated once per solid (kept on build.body) and
  // only when a field shows it. Output was hash-checked identical (SVG, DXF R12 / R2000 of every example's standard
  // views and of 90 / 600-hole panels) before / after each step; these tests count the work, not seconds.
  (function () {
    group('rfMK: perforated panel drawing: work done once per part, occluders behind the segment skipped, mass asked once');
    var T = 0.0598, R = 0.125, D = Drawing._;
    function rfMKcode(cols, rows, r) {
      var sx = 22 / cols, sy = 46 / rows;
      return 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, 0, 24, 48).end().baseFlange(' + T + ');\n' +
        'p.sketch("Top", ' + T + ').circle(' + (1 + sx / 2) + ', ' + (1 + sy / 2) + ', ' + (r || R) + ').end().cut("through", { reverse: true });\n' +
        'p.linearPattern({ dir: "x", spacing: ' + sx + ', count: ' + cols + ', dir2: "z", spacing2: ' + sy + ', count2: ' + rows + ', reverse2: true });\n';
    }
    function rfMKdraw(r, mesh, ctx) {
      var doc = Drawing.newDrawing(r.model, {});
      doc.date = '2026-01-01';
      Drawing.standard3View(doc, mesh || r.mesh, 'in');
      var sh = Drawing.compute(doc, mesh || r.mesh, r.model, ctx || { build: r.build });
      return { doc: doc, sheet: sh, svg: Drawing.toSVG(sh), dxf: Drawing.toDXF(sh, { version: 'R2000' }) };
    }
    function rfMKcount(dxf, kind) { return (dxf.match(new RegExp('\\n' + kind + '\\r?\\n', 'g')) || []).length; }

    test('rfMK: 100-hole panel: the drawing from one mesh (view-independent work shared) = the drawing with a fresh mesh per view, 100 circles a view', function () {
      var r = build(rfMKcode(10, 10));
      noErrors(r);
      var a = rfMKdraw(r);
      assert(r.mesh._drawingHLR && r.mesh._drawingHLR.seam !== undefined, 'the seam runs are kept on the mesh');
      // the same views projected each from its own copy of the mesh (nothing shared between them)
      var doc = Drawing.newDrawing(r.model, {});
      doc.date = '2026-01-01';
      Drawing.standard3View(doc, K.meshFromBody(r.build.body), 'in');
      var pv = Drawing.projectView;
      Drawing.projectView = function (m, F, o) { return pv(K.meshFromBody(r.build.body), F, o); };
      var sh;
      try { sh = Drawing.compute(doc, K.meshFromBody(r.build.body), r.model, { build: r.build }); } finally { Drawing.projectView = pv; }
      assert(Drawing.toSVG(sh) === a.svg, 'SVG differs');
      assert(Drawing.toDXF(sh, { version: 'R2000' }) === a.dxf, 'DXF differs');
      // the Top view and the hole rims: at least 100 circles on the sheet, the views' lines and arcs all there
      var circles = rfMKcount(a.dxf, 'CIRCLE');
      assert(circles >= 100, circles + ' circles');
      assert(rfMKcount(a.dxf, 'LINE') > 0, 'lines');
    });

    test('rfMK: the seam runs are worked out once per part for all four standard views (were once per view)', function () {
      var r = build(rfMKcode(10, 10)), H = D.hlrOps, v0 = H.views, s0 = H.seamRuns;
      noErrors(r);
      rfMKdraw(r);
      assert(H.views - v0 === 4, (H.views - v0) + ' views projected');
      assert(H.seamRuns - s0 === 1, (H.seamRuns - s0) + ' seam runs');
      var pv = Drawing.projectView(r.mesh, 'Bottom', {});
      assert(pv && H.seamRuns - s0 === 1, 'a fifth view reuses them');
    });

    test('rfMK: hidden-line work grows linearly with the holes (occluder visits and split-point tests, 150 → 600 holes under 6x; all-pairs is 16x)', function () {
      function ops(c, rows) {
        var r = build(rfMKcode(c, rows)), H = D.hlrOps, E = D.edgeOps;
        noErrors(r);
        var e0 = E.n; Drawing.meshEdges(r.mesh); var eo = E.n - e0;
        var h0 = H.hidden, v0 = H.visits;
        Drawing.projectView(r.mesh, 'Top', {});
        return { edges: eo, hidden: H.hidden - h0, visits: H.visits - v0 };
      }
      var a = ops(15, 10), b = ops(30, 20);
      assert(a.edges > 0 && a.visits > 0 && a.hidden > 0, 'counted: ' + JSON.stringify(a));
      assert(b.edges / a.edges < 6, 'split-point tests ' + a.edges + ' → ' + b.edges);
      assert(b.visits / a.visits < 6, 'occluder visits ' + a.visits + ' → ' + b.visits);
      // on the Top view every rim lies on the top face: only the occluders in front are tested, about 13 per test
      assert(b.visits < 20 * b.hidden, b.visits + ' visits for ' + b.hidden + ' hidden-line tests');
    });

    test('rfMK: the title block\'s mass is integrated once per solid, not at all when no field shows it, and follows a change to the part', function () {
      var r = build(rfMKcode(6, 5)), u = { build: r.build, mesh: r.mesh };
      noErrors(r);
      var m0 = D.massAsks || 0;
      var tb1 = Drawing.titleBlock(Drawing.newDrawing(r.model, {}), r.model, u);
      assert((D.massAsks || 0) - m0 === 1, 'first sheet: ' + ((D.massAsks || 0) - m0) + ' asks');
      assert(/\d/.test(tb1.mass), 'MASS shows a number: ' + tb1.mass);
      rfMKdraw(r);
      // a new build object holding the same solid (an unchanged rebuild) reuses it
      Drawing.titleBlock(Drawing.newDrawing(r.model, {}), r.model, { build: Object.assign({}, r.build), mesh: r.mesh });
      assert((D.massAsks || 0) - m0 === 1, 'same solid: ' + ((D.massAsks || 0) - m0) + ' asks');
      // no field showing mass, weight, volume or area: not asked for at all
      var r2 = build(rfMKcode(6, 5)), d2 = Drawing.newDrawing(r2.model, {}), m1 = D.massAsks || 0;
      d2.titleBlock = { mass: 'SEE BOM' };
      var tb2 = Drawing.titleBlock(d2, r2.model, { build: r2.build, mesh: r2.mesh });
      assert(tb2.mass === 'SEE BOM' && (D.massAsks || 0) === m1, 'asked ' + ((D.massAsks || 0) - m1) + ' times');
      // the part changes (bigger holes, less steel): a new solid, asked again, the MASS field lighter
      var r3 = build(rfMKcode(6, 5, 0.3)), m2 = D.massAsks || 0;
      var tb3 = Drawing.titleBlock(Drawing.newDrawing(r3.model, {}), r3.model, { build: r3.build, mesh: r3.mesh });
      assert((D.massAsks || 0) - m2 === 1, 'changed part: ' + ((D.massAsks || 0) - m2) + ' asks');
      assert(parseFloat(tb3.mass) < parseFloat(tb1.mass), 'mass ' + tb1.mass + ' → ' + tb3.mass);
      var p3 = rfMKdraw(r3).sheet.prims.filter(function (p) { return p.k === 'text' && p.text === tb3.mass; });
      assert(p3.length === 1, 'the sheet\'s MASS cell shows ' + tb3.mass + ': ' + p3.length);
    });

    test('rfMK: three-view drawing of a 600-hole panel in a generous bound (was about 3 s here before the lane), same circle count as rfLU', function () {
      var r = build(rfMKcode(30, 20));
      noErrors(r);
      var t0 = performance.now(), a = rfMKdraw(r), ms = performance.now() - t0;
      assert(rfMKcount(a.dxf, 'CIRCLE') >= 600, rfMKcount(a.dxf, 'CIRCLE') + ' circles');
      assert(ms < 30000, (ms / 1000).toFixed(1) + ' s');
    });
  })();
