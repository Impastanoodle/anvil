  // --- rfIQ (2026-11-05, lane sketchinfer) --- Sketch Fillet between a line and a spline the line reaches but where the
  // radius has no room on the spline itself: the spline is carried on past its free end to the fillet (refused only
  // when no tangent arc of that radius fits, and never a loop of 180° or more on the carried-on part); Fully Define
  // Sketch with the Ordinate scheme from chosen datums.
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    group('rfIQ: line-to-spline fillet on the spline carried on, Ordinate Fully Define from datums');
    var SS = SketchSolver;
    function cp(o) { return JSON.parse(JSON.stringify(o)); }
    var LN = { t: 'line', x1: 0.25760842778608595, y1: 10.400845489651358, x2: 6.244559147457532, y2: 10.79634653923979 };
    var SP = { t: 'spline', pts: [[15, 3], [20, 6.547729426318654], [25, 13.688468137610922]] };

    test('rfIQ: a line whose extension crosses the spline, R4 (no room on the spline itself): the spline is carried on past its end, the line extended, the arc R4 under 180° tangent to both; no conflicts', function () {
      var s = { entities: [cp(LN), cp(SP)] }, fc0 = SS.freeCurve(SP);
      var res = SS.filletPair(s, { i: 0, uvi: [3.25, 10.6], j: 1, uvj: [20, 6.55] }, 4);
      assert(res.ok, 'fillet: ' + res.error);
      var A = s.entities[res.arc], L = s.entities[0], P = s.entities[1], end = P.pts[P.pts.length - 1];
      near(A.r, 4, 1e-12, 'R4');
      assert(A.a1 - A.a0 > 0 && A.a1 - A.a0 < 180, 'a corner round, not a loop: ' + (A.a1 - A.a0));
      var d = [L.x2 - L.x1, L.y2 - L.y1], dl = Math.hypot(d[0], d[1]);
      near(Math.abs((A.cx - L.x1) * d[1] - (A.cy - L.y1) * d[0]) / dl, 4, 1e-6, 'tangent to the line');
      near(Math.hypot(L.x2 - A.cx, L.y2 - A.cy), 4, 1e-6, 'the line ends on the arc');
      near(Math.hypot(end[0] - A.cx, end[1] - A.cy), 4, 1e-5, 'the spline ends on the arc');
      assert(P.pts.length === 4 && end[0] > 25, 'carried on past (25, 13.69): ' + JSON.stringify(end));
      // the new spline lies on the old one carried on
      var pc = SS.freeCurve(P), xc = { e: fc0.e, t0: fc0.t0 - (fc0.reach || 3), t1: fc0.t1 + (fc0.reach || 3), n: 3000, closed: false, pt: fc0.pt, d1: fc0.d1 }, worst = 0;
      for (var k = 0; k <= 60; k++) worst = Math.max(worst, SS.freeClosest(xc, pc.pt(pc.t0 + (pc.t1 - pc.t0) * k / 60)).d);
      assert(worst < 1e-5, 'on the original carried on: ' + worst);
      assert(res.analysis.conflicts === 0, 'no conflicts');
      return 'R4 sweep ' + (A.a1 - A.a0).toFixed(1) + '°, spline to ' + end.map(function (v) { return v.toFixed(2); }).join(', ');
    });

    test('rfIQ: R1000 fits nowhere (only as a loop): refused with the reason, the sketch unchanged; a spline end joined to other geometry is not carried on', function () {
      var s = { entities: [cp(LN), cp(SP)] }, b4 = JSON.stringify(s);
      var res = SS.filletPair(s, { i: 0, uvi: [3.25, 10.6], j: 1, uvj: [20, 6.55] }, 1000);
      assert(!res.ok && /carried on/.test(res.error) && /smaller radius/.test(res.error) && JSON.stringify(s) === b4, JSON.stringify(res));
      var j = { entities: [cp(LN), cp(SP), { t: 'line', x1: 15, y1: 3, x2: 15, y2: -2 }, { t: 'line', x1: 25, y1: 13.688468137610922, x2: 30, y2: 13.688468137610922 }], rels: [{ type: 'coincident', refs: ['1.p1', '2.p1'] }, { type: 'coincident', refs: ['1.p2', '3.p1'] }] }, j4 = JSON.stringify(j);
      var rj = SS.filletPair(j, { i: 0, uvi: [3.25, 10.6], j: 1, uvj: [20, 6.55] }, 4);
      assert(!rj.ok && /joined/.test(rj.error) && JSON.stringify(j) === j4, 'both ends joined: ' + JSON.stringify(rj));
      return rj.error;
    });

    test('rfIQ: Fully Define Sketch, Ordinate both ways from the left and bottom edges (datums): one set per direction zeroed on the datum, values 4 / 3 / 1 and 2 / 1.5 / 0.5, Fully Defined', function () {
      var f = { entities: [{ t: 'rect', x: 0, y: 0, w: 4, h: 2 }, { t: 'circle', cx: 3, cy: 1.5, r: 0.25 }, { t: 'circle', cx: 1, cy: 0.5, r: 0.25 }], rels: [{ type: 'coincident', refs: ['0.v0', 'O'] }] };
      var r = SS.fullyDefine(f, { hDatum: '0.e3', vDatum: '0.e0', hScheme: 'ordinate', vScheme: 'ordinate', units: 'in' });
      assert(r.status === 'full', 'status ' + r.status);
      var sets = SS.ordinateSets(f), ids = Object.keys(sets);
      assert(ids.length === 2, 'two sets ' + JSON.stringify(sets));
      var bx = ids.map(function (k) { return sets[k]; }).filter(function (s) { return s.axis === 'x'; })[0], by = ids.map(function (k) { return sets[k]; }).filter(function (s) { return s.axis === 'y'; })[0];
      assert(bx.zero === '0.e3' && by.zero === '0.e0', 'zeros ' + bx.zero + ' ' + by.zero);
      function vals(s) { return s.members.map(function (i) { return f.rels[i].v; }).sort(function (a, b) { return b - a; }).join(); }
      assert(vals(bx) === '4,3,1' && vals(by) === '2,1.5,0.5', 'values ' + vals(bx) + ' / ' + vals(by));
      return vals(bx) + ' / ' + vals(by);
    });
  })();
