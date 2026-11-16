  // --- rfMT (local-2026-11-15a, lane sketchflow round 3) --- a value change or a drag moves what SolidWorks moves:
  // a Linear Sketch Pattern's spacing moves the copies (the seed slot was pulled apart), an Offset Entities chain
  // dimension moves the offset (the base outline moved half the change), dragging one of a mirrored pair moves its
  // mirror image (the centerline and the outline it hangs on slid too)
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var S = SketchSolver;
    group('rfMT: pattern spacing, offset chain dimension and mirrored drags move only what they should');
    function rfMTSketch(E, R) { return { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: JSON.parse(JSON.stringify(E)), rels: JSON.parse(JSON.stringify(R || [])) }; }
    function rfMTChain(P) {
      var E = [], R = [];
      for (var i = 0; i + 1 < P.length; i++) E.push({ t: 'line', x1: P[i][0], y1: P[i][1], x2: P[i + 1][0], y2: P[i + 1][1] });
      E.forEach(function (e, i) { R.push({ type: 'coincident', refs: [i + '.p2', ((i + 1) % E.length) + '.p1'] }); R.push({ type: Math.abs(e.y1 - e.y2) < 1e-12 ? 'horizontal' : 'vertical', refs: [String(i)] }); });
      return { E: E, R: R };
    }
    function rfMTRect(x0, y0, x1, y1) { return rfMTChain([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]); }
    function rfMTSlot(x, y0, y1, r) {   // a vertical straight slot as Anvil draws it: 2 lines, 2 arcs, a centerline
      return [{ t: 'line', x1: x - r, y1: y0, x2: x - r, y2: y1 }, { t: 'arc', cx: x, cy: y1, r: r, a0: 0, a1: 180 }, { t: 'line', x1: x + r, y1: y1, x2: x + r, y2: y0 }, { t: 'arc', cx: x, cy: y0, r: r, a0: 180, a1: 360 },
        { t: 'line', x1: x, y1: y0, x2: x, y2: y1, construction: true }];
    }
    function rfMTSlotRels(b) {
      var s = function (k) { return String(b + k); };
      return [{ type: 'tangent', refs: [s(0), s(1)] }, { type: 'tangent', refs: [s(1), s(2)] }, { type: 'tangent', refs: [s(2), s(3)] }, { type: 'tangent', refs: [s(3), s(0)] },
        { type: 'coincident', refs: [s(0) + '.p2', s(1) + '.p2'] }, { type: 'coincident', refs: [s(1) + '.p1', s(2) + '.p1'] }, { type: 'coincident', refs: [s(2) + '.p2', s(3) + '.p2'] }, { type: 'coincident', refs: [s(3) + '.p1', s(0) + '.p1'] },
        { type: 'coincident', refs: [s(4) + '.p1', s(3) + '.c'] }, { type: 'coincident', refs: [s(4) + '.p2', s(1) + '.c'] }, { type: 'vertical', refs: [s(4)] }];
    }

    test('rfMT: Linear Sketch Pattern of a slot (5 at .75), spacing changed to 1: the seed slot stays whole where it is and the copies move (the seed was pulled apart, an end arc of negative radius)', function () {
      var o = rfMTRect(0, 0, 6, 3), E = o.E.concat(rfMTSlot(1, 1, 2, 0.125)), f = rfMTSketch(E, o.R.concat(rfMTSlotRels(4)));
      var r = S.linearPattern(f, [4, 5, 6, 7, 8], { angle1: 0, spacing1: 0.75, count1: 5, count2: 1, dimX: true });
      assert(r.ok, 'pattern: ' + r.error);
      var ri = f.rels.map(function (q) { return q.type === 'distance' && Math.abs(q.v - 0.75) < 1e-9; }).indexOf(true);
      assert(ri >= 0, 'the spacing dimension: ' + JSON.stringify(f.rels.filter(function (q) { return q.v != null; })));
      var seed0 = JSON.stringify(f.entities.slice(4, 9));
      var s = S.setRelValue(f, ri, 1);
      assert(s.ok, 'spacing 1: ' + s.error);
      f.entities.slice(4, 9).forEach(function (e, k) { var e0 = JSON.parse(seed0)[k]; Object.keys(e0).forEach(function (key) { if (typeof e0[key] === 'number') near(e[key], e0[key], 1e-7, 'seed ' + (4 + k) + ' ' + key); }); });
      var caps = f.entities.filter(function (e) { return e.t === 'arc'; }).map(function (e) { assert(e.r > 0, 'radius ' + e.r); return Math.round(e.cx * 1e6) / 1e6; });
      caps = caps.filter(function (x, i) { return caps.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
      assert(caps.join() === '1,2,3,4,5', 'slots at 1 .. 5: ' + caps.join());
      return caps.join();
    });

    test('rfMT: Offset Entities of an L outline .25 inward as one chain, its dimension changed to .375: the outline stays and every offset line moves (the outline\'s loose lines took half the change)', function () {
      var o = rfMTChain([[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3], [0, 0]]), f = rfMTSketch(o.E, o.R);
      f.rels.push({ type: 'coincident', refs: ['0.p1', 'O'] });
      var base0 = JSON.stringify(f.entities);
      var r = S.offsetSelection(f, [0, 1, 2, 3, 4, 5], { d: 0.25, reverse: false, chain: true, dims: true });
      assert(r.ok, 'offset: ' + r.error);
      var inner = function () { return f.entities.slice(6); }, inside = inner().every(function (e) { return e.x1 > 0.1 && e.y1 > 0.1; });
      if (!inside) { f = rfMTSketch(JSON.parse(base0), o.R.concat([{ type: 'coincident', refs: ['0.p1', 'O'] }])); r = S.offsetSelection(f, [0, 1, 2, 3, 4, 5], { d: 0.25, reverse: true, chain: true, dims: true }); assert(r.ok, 'offset reversed: ' + r.error); }
      var ri = f.rels.map(function (q) { return q.type === 'distance' && Math.abs(q.v - 0.25) < 1e-9; }).indexOf(true);
      assert(ri >= 0, 'the offset dimension');
      var s = S.setRelValue(f, ri, 0.375);
      assert(s.ok, '.375: ' + s.error);
      assert(JSON.stringify(f.entities.slice(0, 6).map(function (e) { return [e.x1, e.y1, e.x2, e.y2].map(function (x) { return Math.round(x * 1e7) / 1e7; }); })) === JSON.stringify(JSON.parse(base0).map(function (e) { return [e.x1, e.y1, e.x2, e.y2]; })), 'the outline stays: ' + JSON.stringify(f.entities.slice(0, 6)));
      var want = [[0.375, 0.375], [3.625, 0.375], [3.625, 0.625], [0.625, 0.625], [0.625, 2.625], [0.375, 2.625]];
      want.forEach(function (w) { assert(inner().some(function (e) { return Math.abs(e.x1 - w[0]) < 1e-7 && Math.abs(e.y1 - w[1]) < 1e-7; }), 'an offset corner at ' + w + ': ' + JSON.stringify(inner())); });
      return 'offset .375 all round';
    });

    test('rfMT: dragging one of two holes held Symmetric about a centerline between a rectangle\'s side midpoints: its mirror image follows and the centerline and rectangle stay (they slid .02 for a .25 drag)', function () {
      var o = rfMTRect(0, 0, 6, 3);
      var E = o.E.concat([{ t: 'line', x1: 3, y1: 0, x2: 3, y2: 3, construction: true }, { t: 'circle', cx: 1, cy: 0.75, r: 0.2 }, { t: 'circle', cx: 5, cy: 0.75, r: 0.2 }]);
      var f = rfMTSketch(E, o.R.concat([{ type: 'midpoint', refs: ['4.p1', '0'] }, { type: 'midpoint', refs: ['4.p2', '2'] }, { type: 'symmetric', refs: ['5', '6', '4'] }]));
      var start = JSON.parse(JSON.stringify(f.entities));
      for (var k = 1; k <= 8; k++) { var r = S.drag(f, '5.c', [1 + k * 0.25 / 8, 0.75 - k * 0.15 / 8], start); assert(r.ok, 'drag step ' + k); }
      var c0 = f.entities[5], c1 = f.entities[6], cl = f.entities[4];
      near(c0.cx, 1.25, 1e-6, 'the hole went with the pointer');
      near(cl.x1, 3, 1e-9, 'the centerline stays'); near(f.entities[1].x1, 6, 1e-9, 'the rectangle stays');
      near(c1.cx, 6 - c0.cx, 1e-9, 'the mirror image follows'); near(c1.cy, c0.cy, 1e-9, 'at the same height');
      return 'hole ' + c0.cx.toFixed(6) + ', mirror ' + c1.cx.toFixed(6);
    });
  })();
