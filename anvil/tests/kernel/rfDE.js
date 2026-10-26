  // --- rfDE (2026-10-26, lane DE: sketch curves and polish, QUEUE.md "Sketch tab follow-ups (2026-10-07T12)") ---
  // (1) a line / circle trimmed at a spline or an ellipse is cut at the true crossing (the curve stands out of
  // Kernel.trimCuts as a point and its exact crossings come in as cuts), not at a facet; (2) spline / spline crossings
  // are found (freeHits' Newton had its signs flipped and every such crossing was dropped); (3) Corner on a partial
  // ellipse cuts it back or runs it on round its ellipse; (4) a spline handle ('3.h1') is a line for an angle dimension:
  // adding one makes the handle driving without changing the curve, and setting the value turns the handle, not the
  // points (its angle is a solver unknown); (5) a point Coincident with a spline / ellipse stays on it when dragged;
  // (6) DxfCheck reads a sketch's SPLINE / ELLIPSE (R2000) and chains them into the loop; (7) an infinite line and a
  // handle angle survive the script round trip.
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    group('rfDE: sketch curves');
    var SS = SketchSolver;
    function rfDESk(ents, rels) { return { id: 1, type: 'sketch', plane: { ref: 'Front' }, entities: JSON.parse(JSON.stringify(ents)), rels: rels ? JSON.parse(JSON.stringify(rels)) : [] }; }
    function rfDEOn(e, p) { return SS.freeClosest(SS.freeCurve(e), p).d; }
    var SPL = { t: 'spline', pts: [[0, 0], [1, 1], [2, -0.5], [3, 0.5], [4, 0]] };
    var ELL = { t: 'ellipse', cx: 0, cy: 0, rx: 2, ry: 1, rot: 20 };
    test('rfDE: a line or a circle trimmed at a spline / an ellipse ends on the true curve (was a facet: up to 0.02 off)', function () {
      var f = rfDESk([SPL, { t: 'line', x1: 1.5, y1: -2, x2: 1.5, y2: 2 }]);
      assert(SS.trimAt(f, 1, [1.5, 1.9]).ok, 'trim the line');
      var l = f.entities[1];
      assert(l.t === 'line' && Math.max(l.y1, l.y2) < 0.5, 'the top part went: ' + JSON.stringify(l));
      near(Math.min(rfDEOn(SPL, [l.x1, l.y1]), rfDEOn(SPL, [l.x2, l.y2])), 0, 1e-5, 'line end on the spline');
      near(Math.abs(l.x2 - l.x1), 0, 1e-5, 'the line stays vertical');
      f = rfDESk([ELL, { t: 'line', x1: -3, y1: 0.2, x2: 3, y2: 0.2 }]);
      assert(SS.trimAt(f, 1, [2.9, 0.2]).ok, 'trim the line at the ellipse');
      var l2 = f.entities[1];
      near(rfDEOn(ELL, [l2.x2, l2.y2]), 0, 1e-5, 'line end on the ellipse (' + JSON.stringify(l2) + ')');
      f = rfDESk([SPL, { t: 'circle', cx: 2, cy: 0, r: 1 }]);
      assert(SS.trimAt(f, 1, [2, 1]).ok, 'trim the circle');
      var a = f.entities[1], D = Math.PI / 180;
      assert(a.t === 'arc', 'an arc is left: ' + JSON.stringify(a));
      [a.a0, a.a1].forEach(function (g, k) { near(rfDEOn(SPL, [a.cx + a.r * Math.cos(g * D), a.cy + a.r * Math.sin(g * D)]), 0, 1e-5, 'arc end ' + k + ' on the spline'); });
      // the hover span of Trim to closest stops at the true crossing too
      f = rfDESk([{ t: 'spline', pts: [[0, 0], [1, 1], [2, 0]] }, { t: 'line', x1: 0.7, y1: -1, x2: 0.7, y2: 2 }]);
      var sp = SS.trimSpan(f, 1, [0.7, 1.9]), lo = sp.pts[0];
      near(rfDEOn(f.entities[0], lo), 0, 1e-9, 'span starts on the curve');
    });
    test('rfDE: a spline trimmed at another spline: the crossing is found and the piece left is the same curve', function () {
      var S2 = { t: 'spline', pts: [[0, -1], [2, 1.5], [4, -1]] }, f = rfDESk([SPL, S2]);
      var hits = SS.freeHits(SS.freeCurve(SPL), { fc: SS.freeCurve(S2) });
      assert(hits.length === 2, 'two crossings: ' + JSON.stringify(hits));
      hits.forEach(function (t) { near(rfDEOn(S2, SS.freeCurve(SPL).pt(t)), 0, 1e-9, 'crossing on both curves'); });
      assert(SS.trimAt(f, 0, [0.3, 0.4]).ok, 'trim');
      var p = f.entities[0];
      assert(p.t === 'spline' && p.pts.length === 4, 'one spline piece left: ' + JSON.stringify(f.entities));
      near(rfDEOn(S2, p.pts[0]), 0, 1e-6, 'its new end on the other spline');
      var fc = SS.freeCurve(p), dev = 0;
      for (var k = 0; k <= 40; k++) dev = Math.max(dev, rfDEOn(SPL, fc.pt(fc.t0 + (fc.t1 - fc.t0) * k / 40)));
      assert(dev < 1e-5, 'the piece follows the original curve (' + dev + ')');
      assert((f.rels || []).some(function (r) { return r.type === 'coincident' && r.refs.indexOf('0.p1') >= 0; }), 'its new end held on the other spline');
    });
    test('rfDE: Corner on a partial ellipse — run on round its ellipse to a line, or cut back to it', function () {
      var f = rfDESk([{ t: 'pellipse', cx: 0, cy: 0, rx: 2, ry: 1, rot: 0, a0: 0, a1: 150 }, { t: 'line', x1: 1, y1: -2, x2: 1, y2: -0.5 }]);
      var r = SS.cornerTrim(f, 0, [1.9, 0.3], 1, [1, -1]);
      assert(r.ok, 'corner: ' + JSON.stringify(r));
      var e = f.entities[0], l = f.entities[1];
      near(e.a0, 300, 1e-6, 'start runs back to -60°'); near(e.a1, 510, 1e-6, 'end kept');
      near(l.y2, -Math.sqrt(3) / 2, 1e-9, 'the line meets it');
      f = rfDESk([{ t: 'pellipse', cx: 0, cy: 0, rx: 2, ry: 1, rot: 0, a0: 0, a1: 150 }, { t: 'line', x1: 1, y1: 0.3, x2: 1, y2: 3 }]);
      r = SS.cornerTrim(f, 0, [1.9, 0.3], 1, [1, 2]);
      assert(r.ok, 'cut back: ' + JSON.stringify(r));
      near(f.entities[0].a1, 60, 1e-6, 'cut back to 60°'); near(f.entities[0].a0, 0, 1e-9, 'start kept');
      near(f.entities[1].y1, Math.sqrt(3) / 2, 1e-9, 'line start on the ellipse');
    });
    test('rfDE: an angle dimension on a spline handle turns the handle (driving, a solver unknown), the curve is unchanged until then', function () {
      var f = rfDESk([SPL, { t: 'line', x1: -1, y1: -1, x2: 5, y2: -1 }], [{ type: 'fix', refs: ['1'], at: [-1, -1, 5, -1] }]);
      var fc0 = SS.freeCurve(f.entities[0]), ts = [0.5, 1.3, 2.7, 3.5], P0 = ts.map(function (t) { return fc0.pt(t); }), an0 = SS.analyze(f);
      assert(SS.refKind(f, '0.h1') === 'line' && SS.refName(f, '0.h1') === 'Spline1 handle 2', 'a handle ref is a line');
      var r = SS.addRelation(f, 'angle', ['1', '0.h1']);
      assert(r.ok, 'angle added: ' + r.error);
      var ri = f.rels.length - 1, tg = f.entities[0].tans[1];
      assert(tg && Math.abs(tg[0] + 25.673187) < 1e-5, 'handle made driving at its own angle: ' + JSON.stringify(tg));
      var fc1 = SS.freeCurve(f.entities[0]);
      ts.forEach(function (t, k) { var q = fc1.pt(t); near(Math.hypot(q[0] - P0[k][0], q[1] - P0[k][1]), 0, 1e-12, 'curve unchanged at ' + t); });
      var an1 = SS.analyze(f);
      assert(an1.dof === an0.dof && !an1.conflicts && !an1.redundant, 'the handle angle adds one unknown, the dimension takes it: ' + an0.dof + ' -> ' + an1.dof);
      assert(SS.setRelValue(f, ri, 30).ok, 'set 30°');
      near(f.entities[0].tans[1][0], -30, 1e-6, 'the handle turned');
      near(SS.measure(f, 'angle', ['1', '0.h1']), 30, 1e-6, 'reads 30°');
      SPL.pts.forEach(function (q, k) { near(Math.hypot(f.entities[0].pts[k][0] - q[0], f.entities[0].pts[k][1] - q[1]), 0, 1e-6, 'spline point ' + k + ' stays'); });
      deepRoundTrip(f);
      function deepRoundTrip(sk) {
        var m = K.newModel('t'); K.runScript(m, 'p.sketch("Front").line(0, 0, 1, 0).end();');
        var g = m.features.filter(function (x) { return x.type === 'sketch'; })[0];
        g.entities = sk.entities; g.rels = sk.rels;
        var m2 = K.newModel('t'); K.runScript(m2, K.generateScript(m));
        var g2 = m2.features.filter(function (x) { return x.type === 'sketch'; })[0];
        assert(g2.rels.some(function (x) { return x.type === 'angle' && x.refs.indexOf('0.h1') >= 0 && Math.abs(x.v - 30) < 1e-6; }), 'the handle angle round-trips: ' + JSON.stringify(g2.rels));
        near(g2.entities[0].tans[1][0], -30, 1e-6, 'the driving handle round-trips');
      }
    });
    test('rfDE: a point Coincident with a spline / an ellipse stays on the curve when dragged', function () {
      var f = rfDESk([SPL, { t: 'point', x: 1, y: 1 }, { t: 'ellipse', cx: 0, cy: 3, rx: 2, ry: 1, rot: 15 }, { t: 'point', x: 2, y: 3 }], [{ type: 'fix', refs: ['0'] }, { type: 'fix', refs: ['2'] }]);
      f.rels.forEach(function (r) { var e = f.entities[+r.refs[0]]; r.at = SS.paramNames(e).map(function (n) { return typeof n === 'number' ? e.pts[n >> 1][n & 1] : e[n]; }); });
      assert(SS.addRelation(f, 'coincident', ['1', '0']).ok && SS.addRelation(f, 'coincident', ['3', '2']).ok, 'point-on-curve relations');
      SS.drag(f, '1', [2.5, 2]);
      near(rfDEOn(f.entities[0], [f.entities[1].x, f.entities[1].y]), 0, 1e-9, 'point on the spline after the drag');
      assert(Math.hypot(f.entities[1].x - 1, f.entities[1].y - 1) > 0.05, 'the point slid along it');
      SS.drag(f, '3', [3, 5]);
      near(rfDEOn(f.entities[2], [f.entities[3].x, f.entities[3].y]), 0, 1e-9, 'point on the ellipse after the drag');
      assert(Math.hypot(f.entities[2].cx, f.entities[2].cy - 3) < 1e-9, 'the fixed ellipse did not move');
    });
    test('rfDE: DxfCheck reads a sketch outline of a spline, a partial ellipse and lines (R2000) as one closed loop', function () {
      var m = K.newModel('t'); K.runScript(m, 'p.sketch("Front").line(0, 0, 4, 0).end();');
      var f = m.features.filter(function (x) { return x.type === 'sketch'; })[0];
      f.entities = [{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'spline', pts: [[4, 0], [5, 1.5], [4, 3]] },
        { t: 'pellipse', cx: 2, cy: 3, rx: 2, ry: 1, rot: 0, a0: 0, a1: 180 }, { t: 'line', x1: 0, y1: 3, x2: 0, y2: 0 }];
      var dxf = K.exportDXFSketch(f, 'in', { version: 'R2000' }), d = DxfCheck.parse(dxf);
      var sp = d.entities.filter(function (e) { return e.type === 'SPLINE'; }), el = d.entities.filter(function (e) { return e.type === 'ELLIPSE'; });
      assert(sp.length === 1 && el.length === 1, 'one SPLINE and one ELLIPSE written: ' + d.entities.map(function (e) { return e.type; }).join());
      var c = DxfCheck.check(dxf, { units: 'in', layers: [sp[0].layer] });
      assert(c.ok, 'check passes: ' + c.errors.join('; '));
      assert(c.loops.length === 1 && c.loops[0].closed && c.loops[0].n === 4, 'one closed loop of 4: ' + JSON.stringify(c.loops));
      // a gap in the loop is caught with the spline in it
      f.entities[1].pts[2] = [4.2, 3];
      var c2 = DxfCheck.check(K.exportDXFSketch(f, 'in', { version: 'R2000' }), { units: 'in', layers: [sp[0].layer] });
      assert(!c2.ok, 'an open loop through the spline is reported');
    });
    test('rfDE: an infinite line and a ray keep their flag through the script round trip and are drawn by no DXF', function () {
      var m = K.newModel('t'); K.runScript(m, 'p.sketch("Front").line(0, 0, 4, 1).line(0, 3, 1, 3).circle(2, 2, 1).end();');
      var f = m.features.filter(function (x) { return x.type === 'sketch'; })[0];
      f.entities[0].infinite = true; f.entities[1].infinite = 'p2';
      var m2 = K.newModel('t'); K.runScript(m2, K.generateScript(m));
      var g = m2.features.filter(function (x) { return x.type === 'sketch'; })[0];
      assert(g.entities[0].infinite === true && g.entities[1].infinite === 'p2', 'flags kept: ' + JSON.stringify(g.entities));
      var types = DxfCheck.parse(K.exportDXFSketch(g, 'in', { version: 'R2000' })).entities.map(function (e) { return e.type; });
      assert(types.join() === 'CIRCLE', 'only the circle is cut geometry: ' + types.join());
      // trimmed between two crossings it is an ordinary line, past one a ray
      var s = rfDESk([{ t: 'line', x1: 0, y1: 0, x2: 1, y2: 0, infinite: true }, { t: 'line', x1: 2, y1: -1, x2: 2, y2: 1 }, { t: 'line', x1: 5, y1: -1, x2: 5, y2: 1 }]);
      assert(SS.trimAt(s, 0, [8, 0]).ok, 'trim past the second crossing');
      var rays = s.entities.filter(function (e) { return e.t === 'line' && e.infinite; });
      assert(rays.length === 1 && rays[0].infinite === 'p1', 'a ray is left running the other way: ' + JSON.stringify(s.entities));
    });
    // lane DE2: an ordinate value edited in an under-defined sketch moves the dimensioned entity only (the zero, the
    // outline and the other members stay), as SolidWorks does
    test('rfDE: editing an ordinate member in an under-defined sketch moves only that entity', function () {
      var f = rfDESk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 10, y1: 0, x2: 10, y2: 6 }, { t: 'line', x1: 10, y1: 6, x2: 0, y2: 6 }, { t: 'line', x1: 0, y1: 6, x2: 0, y2: 0 },
        { t: 'circle', cx: 3, cy: 3, r: 1 }, { t: 'circle', cx: 7, cy: 3, r: 1 }]);
      [['0.p2', '1.p1'], ['1.p2', '2.p1'], ['2.p2', '3.p1'], ['3.p2', '0.p1']].forEach(function (r) { SS.addRelation(f, 'coincident', r); });
      SS.addRelation(f, 'horizontal', ['0']); SS.addRelation(f, 'vertical', ['1']); SS.addRelation(f, 'horizontal', ['2']); SS.addRelation(f, 'vertical', ['3']);
      var a = SS.addOrdinate(f, { zero: '3', target: '4.c', axis: 'x' }), b = SS.addOrdinate(f, { zero: '3', target: '5.c', axis: 'x', ord: a.ord });
      assert(a.ok && b.ok, 'ordinate set');
      assert(SS.analyze(f).status === 'under', 'under-defined');
      var before = JSON.parse(JSON.stringify(f.entities));
      assert(SS.setRelValue(f, b.index, 8).ok, 'edit the second member');
      near(f.entities[5].cx, 8, 1e-9, 'the member moved to 8');
      [0, 1, 2, 3, 4].forEach(function (i) { assert(JSON.stringify(f.entities[i]) === JSON.stringify(before[i]), 'entity ' + i + ' stayed: ' + JSON.stringify(f.entities[i])); });
      near(f.entities[5].cy, 3, 1e-9, 'it moved along the set only');
    });
  })();
