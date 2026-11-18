  // --- rfOI (local-2026-11-18a, lane sketchflow7: sketching like a SolidWorks user, report
  // test-reports/2026-11-18-sketch-flow-7.md) --- Sketch Fillet with R equal to what is left of a line makes the full
  // round (the line goes, the two fillets meet tangent), and Extend onto the end of a line it is Collinear with joins
  // them (the Collinear becomes Parallel or goes, so the join is not redundant).
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var S = SketchSolver;
    group('rfOI: full-round fillets; Extend onto a collinear piece');
    function rfOINotch() {
      // a notch 1 wide, 1 deep: left side up, top across, right side down
      return { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 },
        entities: [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 1 }, { t: 'line', x1: 0, y1: 1, x2: 1, y2: 1 }, { t: 'line', x1: 1, y1: 1, x2: 1, y2: 0 }],
        rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'vertical', refs: ['0'] }, { type: 'horizontal', refs: ['1'] }, { type: 'vertical', refs: ['2'] }] };
    }
    test('rfOI: a notch 1 wide filleted R.5 at both inside corners: the second fillet takes the rest of the top line (was refused "Radius too large … at most R.500"); the top line goes, the two arcs meet tangent at the middle, nothing over defined', function () {
      var f = rfOINotch();
      var r1 = S.filletCorner(f, S.curveCorner(f, [0, 1], 0.01), 0.5);
      assert(r1.ok, 'first fillet: ' + r1.error);
      var c2 = S.curveCorner(f, [1, 1], 0.01);
      assert(c2, 'the second corner');
      var r2 = S.filletCorner(f, c2, 0.5);
      assert(r2.ok, 'second fillet: ' + r2.error);
      var lines = f.entities.filter(function (e) { return e.t === 'line'; }), arcs = f.entities.filter(function (e) { return e.t === 'arc'; });
      assert(lines.length === 2 && arcs.length === 2, 'two sides and two arcs: ' + JSON.stringify(f.entities));
      arcs.forEach(function (a) { near(a.cx, 0.5, 1e-9, 'arc centre x'); near(a.cy, 0.5, 1e-9, 'arc centre y'); near(a.r, 0.5, 1e-9, 'r'); });
      var k1 = f.entities.indexOf(arcs[0]), k2 = f.entities.indexOf(arcs[1]);
      assert(f.rels.some(function (r) { return r.type === 'tangent' && r.refs.indexOf(String(k1)) >= 0 && r.refs.indexOf(String(k2)) >= 0; }), 'the arcs tangent to each other: ' + JSON.stringify(f.rels));
      assert(f.rels.some(function (r) { return r.type === 'coincident' && r.refs.some(function (x) { return x.indexOf(k1 + '.') === 0; }) && r.refs.some(function (x) { return x.indexOf(k2 + '.') === 0; }); }), 'and joined');
      var an = S.analyze(f);
      assert(an.conflicts === 0 && an.redundant === 0, 'clean: ' + JSON.stringify([an.status, an.conflicts, an.redundant]));
      // an R larger than what is left is still refused
      var g = rfOINotch();
      S.filletCorner(g, S.curveCorner(g, [0, 1], 0.01), 0.5);
      var r3 = S.filletCorner(g, S.curveCorner(g, [1, 1], 0.01), 0.6);
      assert(!r3.ok && /too large/.test(r3.error), 'R.6 refused: ' + JSON.stringify(r3));
    });
    test('rfOI: a left edge split by a notch (two Collinear pieces), the notch deleted: Extend of the lower piece reaches the upper piece and joins it (Coincident kept, was dropped as redundant); a drag keeps them joined', function () {
      var f = { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 },
        entities: [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 2 }, { t: 'line', x1: 0, y1: 3, x2: 0, y2: 5 }],
        rels: [{ type: 'vertical', refs: ['0'] }, { type: 'collinear', refs: ['0', '1'] }] };
      var r = S.extendEntity(f, 0, [0, 1.9]);
      assert(r.ok, r.error);
      near(f.entities[0].y2, 3, 1e-9, 'reaches the upper piece');
      assert(f.rels.some(function (x) { return x.type === 'coincident' && x.refs.join() === '0.p2,1.p1'; }), 'joined: ' + JSON.stringify(f.rels));
      var an = S.analyze(f);
      assert(an.redundant === 0 && an.conflicts === 0, 'not redundant: ' + JSON.stringify(f.rels));
      assert(S.drag(f, '1.p2', [0.4, 5.2], JSON.parse(JSON.stringify(f.entities))).ok, 'dragged');
      near(f.entities[0].x2, f.entities[1].x1, 1e-9, 'still joined x'); near(f.entities[0].y2, f.entities[1].y1, 1e-9, 'y');
    });
  })();
