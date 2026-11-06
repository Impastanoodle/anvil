  // --- rfJO (2026-11-06, lane sketchgaps-3): Sketch Fillet between a line and a spline the line's extension misses
  // (the spline carried on, the line extended; never a fillet arc of 180° or more: one that only fits as a loop is
  // refused), and an Arc Slot as SolidWorks draws it (arcs + construction arc) edited by its radius and an end drag. ---
  (function () {
    group('rfJO: line-to-spline fillet where the line misses the spline (no loop fillets), arc slot editing');
    var S = SketchSolver;
    function cp(o) { return JSON.parse(JSON.stringify(o)); }
    var L = { t: 'line', x1: 0, y1: 0, x2: 2, y2: 0 }, SP = { t: 'spline', pts: [[3, 1], [4, 3], [5, 6]] };
    function rfJOFillet(r) { var s = { entities: [cp(L), cp(SP)] }; return { s: s, res: S.filletPair(s, { i: 0, uvi: [1, 0], j: 1, uvj: [4, 3] }, r) }; }
    test('rfJO: line (0,0)-(2,0) and a spline from (3,1) up through (4,3), the line\'s extension missing it: R.5 fillets, the spline carried on down past (3,1), the line extended to the arc, arc under 180° tangent to both', function () {
      var q = rfJOFillet(0.5), s = q.s, res = q.res;
      assert(res.ok, res.error);
      var A = s.entities[res.arc], Ln = s.entities[0], P = s.entities[1];
      near(A.r, 0.5, 1e-12, 'R.5');
      assert(A.a1 - A.a0 > 0 && A.a1 - A.a0 < 180, 'a corner round: ' + (A.a1 - A.a0));
      near(Math.abs(A.cy - Ln.y1), 0.5, 1e-6, 'tangent to the line (centre .5 above it)');
      assert(Ln.x2 > 2 && Math.abs(Math.hypot(Ln.x2 - A.cx, Ln.y2 - A.cy) - 0.5) < 1e-6, 'the line extended to the arc: ' + JSON.stringify(Ln));
      var p0 = P.pts[0];
      assert(P.pts.length === 4 && p0[1] < 1 && Math.abs(Math.hypot(p0[0] - A.cx, p0[1] - A.cy) - 0.5) < 1e-5, 'spline carried on down to the arc: ' + JSON.stringify(P.pts));
    });
    test('rfJO: R3 has no corner round there (it only fits as a 250° loop round the line\'s end): refused with the reason, the sketch unchanged (it used to take the loop)', function () {
      var s = { entities: [cp(L), cp(SP)] }, b4 = JSON.stringify(s), res = S.filletPair(s, { i: 0, uvi: [1, 0], j: 1, uvj: [4, 3] }, 3);
      assert(!res.ok && /smaller radius/.test(res.error) && JSON.stringify(s) === b4, JSON.stringify(res));
      // a spline dipping towards the line (lowest .6 above it): R.5 fits only past its end, carried on, as a corner round
      var s2 = { entities: [cp(L), { t: 'spline', pts: [[3, 3], [4, 0.6], [5, 3]] }] }, r2 = S.filletPair(s2, { i: 0, uvi: [1, 0], j: 1, uvj: [4, 0.6] }, 0.5);
      assert(r2.ok, r2.error);
      var A2 = s2.entities[r2.arc];
      assert(A2.a1 - A2.a0 < 180, 'under 180°: ' + (A2.a1 - A2.a0));
    });
    test('rfJO: an Arc Slot R3, 30° → 120°, width .5 is drawn as SolidWorks draws it (outer / inner arcs, two end arcs, construction arc; 4 degrees of freedom with R and the width): R → 4 moves every arc with it, a drag of an end turns the slot', function () {
      var f = { entities: [{ t: 'aslot', cx: 0, cy: 0, r: 3, a0: 30, a1: 120, w: 0.5 }], dims: [{ e: 0, k: 'r' }, { e: 0, k: 'w' }] };
      assert(S.explodeSlot(f, 0) === 0, 'exploded');
      assert(f.entities.length === 5 && f.entities.every(function (e) { return e.t === 'arc'; }) && f.entities[4].construction, 'arcs: ' + f.entities.map(function (e) { return e.t; }));
      assert(f.dims.length === 1 && f.dims[0].e === 4 && f.dims[0].k === 'r', 'R on the construction arc ' + JSON.stringify(f.dims));
      assert(S.analyze(f).dof === 4, 'dof ' + S.analyze(f).dof);
      assert(S.setDim(f, 0, 4).ok !== false, 'R 4');
      var E = f.entities, c = [E[4].cx, E[4].cy];
      near(E[4].r, 4, 1e-9, 'centre arc'); near(E[0].r, 4.25, 1e-9, 'outer'); near(E[2].r, 3.75, 1e-9, 'inner');
      [0, 2].forEach(function (k) { near(Math.hypot(E[k].cx - c[0], E[k].cy - c[1]), 0, 1e-9, 'concentric ' + k); });
      near(E[4].a1 - E[4].a0, 90, 0.01, 'sweep about kept (the slot is under defined: the solve moves it least)');
      var st = cp(E), dr = S.drag(f, '4.p2', [-4, 0.5], st);
      assert(dr && dr.ok !== false, 'drag ' + JSON.stringify(dr));
      E = f.entities;
      var p2 = [E[4].cx + E[4].r * Math.cos(E[4].a1 * Math.PI / 180), E[4].cy + E[4].r * Math.sin(E[4].a1 * Math.PI / 180)];
      near(p2[0], -4, 1e-4, 'end x where dragged'); near(p2[1], 0.5, 1e-4, 'end y');
      near(E[1].cx, p2[0], 1e-6, 'end cap follows'); near(E[1].cy, p2[1], 1e-6, 'end cap follows y'); near(E[0].r - E[2].r, 0.5, 1e-9, 'width kept');
    });
  })();
