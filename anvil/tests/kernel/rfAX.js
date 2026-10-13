  // ---- rfAX (2026-10-13): sweep of the old sketch follow-ups — Sketch Fillet on a selection's corners, a fillet whose
  // line misses the spline (the spline is carried on), trims keep layers and construction
  (function () {
    var SX = SketchSolver;
    function cp(o) { return JSON.parse(JSON.stringify(o)); }
    test('rfAX: Sketch Fillet with the four lines of a rectangle selected rounds every corner where they meet: 4 arcs, one R dimension, 3 Equal, nothing over defined; a selection that meets nowhere has no corners', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 40, y1: 0, x2: 40, y2: 20 }, { t: 'line', x1: 40, y1: 20, x2: 0, y2: 20 }, { t: 'line', x1: 0, y1: 20, x2: 0, y2: 0 }, { t: 'line', x1: 60, y1: 0, x2: 70, y2: 0, construction: true }],
        rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] }, { type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['3'] }] };
      var cs = SX.selectionCorners(s, [0, 1, 2, 3, 4]);
      assert(cs.length === 4, 'four corners (the construction line is left out): ' + JSON.stringify(cs));
      var r = SX.filletCorners(s, cs, 3, { keepCorner: true });
      assert(r.ok && r.arcs.length === 4, 'four fillets: ' + JSON.stringify(r));
      var arcs = s.entities.filter(function (e) { return e.t === 'arc'; });
      assert(arcs.length === 4 && arcs.every(function (a) { return Math.abs(a.r - 3) < 1e-9 && Math.abs(a.a1 - a.a0 - 90) < 1e-6; }), 'four R3 quarter arcs');
      var eq = s.rels.filter(function (x) { return x.type === 'equal'; }).length, dims = (s.dims || []).filter(function (d) { return d.k === 'r'; }).length;
      assert(eq === 3 && dims === 1 && r.analysis.conflicts === 0 && r.analysis.redundant === 0, 'equal ' + eq + ' dims ' + dims + ' ' + JSON.stringify(r.analysis.status));
      var t = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 20, y1: 0, x2: 20, y2: 10 }, { t: 'line', x1: 30, y1: 0, x2: 40, y2: 0 }] };
      assert(SX.selectionCorners(t, [0, 1, 2]).length === 0, 'lines that do not touch: no corners');
      return eq + ' Equal, ' + dims + ' R';
    });
    test('rfAX: Sketch Fillet between a line and a spline the line\'s extension misses carries the spline on past its free end (its end span\'s own curve) to the fillet, either pick order and a style spline too; the carried-on spline lies on the original carried on; a spline end joined to other geometry is not carried on', function () {
      var ln = { t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, out = [];
      [{ t: 'spline', pts: [[15, 3], [20, 6], [25, 12]] }, { t: 'spline', style: true, pts: [[15, 3], [18, 5], [22, 8], [25, 12]] }].forEach(function (sp) {
        [false, true].forEach(function (splineFirst) {
          var s = { entities: splineFirst ? [cp(sp), cp(ln)] : [cp(ln), cp(sp)] }, li = splineFirst ? 1 : 0, si = 1 - li;
          var fc0 = SX.freeCurve(sp), spec = splineFirst ? { i: 0, uvi: [22, 8], j: 1, uvj: [5, 0] } : { i: 0, uvi: [5, 0], j: 1, uvj: [22, 8] };
          var res = SX.filletPair(s, spec, 2);
          assert(res.ok, (sp.style ? 'style ' : '') + 'fillet: ' + res.error);
          var A = s.entities[res.arc], P = s.entities[si], L = s.entities[li], p0 = P.pts[0];
          near(A.r, 2, 1e-9, 'R2');
          near(Math.hypot(p0[0] - A.cx, p0[1] - A.cy), 2, 1e-5, 'the spline\'s new start is on the fillet');
          assert(p0[0] < 15 && p0[1] < 3, 'the spline was carried back past (15, 3): ' + JSON.stringify(p0));
          near(L.y1, 0, 1e-6, 'the line stays on y = 0'); assert(L.x2 > 5 && Math.abs(L.x2 - A.cx) < 1e-5, 'the line runs to the fillet: ' + L.x2);
          // the new spline lies on the old one carried on
          var pc = SX.freeCurve(P), xc = { e: fc0.e, t0: fc0.t0 - (fc0.reach || 3), t1: fc0.t1 + (fc0.reach || 3), n: 3000, closed: false, pt: fc0.pt, d1: fc0.d1 }, worst = 0;
          for (var k = 0; k <= 60; k++) worst = Math.max(worst, SX.freeClosest(xc, pc.pt(pc.t0 + (pc.t1 - pc.t0) * k / 60)).d);
          assert(worst < 1e-5, 'on the original carried on: ' + worst);
          assert(res.analysis.conflicts === 0, 'no conflicts');
          out.push((sp.style ? 'style ' : '') + p0.map(function (v) { return v.toFixed(2); }).join(','));
        });
      });
      // the spline's start joined to a point: it is not carried on, and the fillet is refused with the reason
      var j = { entities: [cp(ln), { t: 'spline', pts: [[15, 3], [20, 6], [25, 12]] }, { t: 'line', x1: 15, y1: 3, x2: 15, y2: 8 }], rels: [{ type: 'coincident', refs: ['1.p1', '2.p1'] }] }, b4 = JSON.stringify(j);
      var rj = SX.filletPair(j, { i: 0, uvi: [5, 0], j: 1, uvj: [22, 8] }, 2);
      assert(!rj.ok && /carried on/.test(rj.error) && JSON.stringify(j) === b4, 'joined end: ' + JSON.stringify(rj));
      return out.join(' | ');
    });
    test('rfAX: Trim (trimAt, Power Trim) keeps each piece\'s layer and construction: a line, an arc, a circle and a spline cut by two crossing lines', function () {
      var cases = [
        { e: { t: 'line', x1: -10, y1: 0, x2: 10, y2: 0 }, at: [0, 0] },
        { e: { t: 'arc', cx: 0, cy: -5, r: 5, a0: 0, a1: 180 }, at: [0, 0] },
        { e: { t: 'circle', cx: 0, cy: 0, r: 5 }, at: [0, 5] },
        { e: { t: 'spline', pts: [[-10, 0], [-3, 1], [3, -1], [10, 0]] }, at: [0, 0] }
      ], got = [];
      cases.forEach(function (c) {
        [true, false].forEach(function (power) {
          var e = cp(c.e); e.layer = 'ETCH'; e.construction = true;
          var s = { entities: [e, { t: 'line', x1: -3, y1: -20, x2: -3, y2: 20 }, { t: 'line', x1: 3, y1: -20, x2: 3, y2: 20 }], layers: [{ name: 'ETCH', color: '#00aa00', noProfile: true }] };
          var ok = power ? SX.powerTrim(s, [c.at[0] - 0.01, c.at[1] + 0.5], [c.at[0] + 0.01, c.at[1] - 0.5], null, null) > 0 : SX.trimAt(s, 0, c.at, {}).ok;
          var pieces = s.entities.filter(function (o) { return (o.t === c.e.t || (c.e.t === 'circle' && o.t === 'arc')) && !(o.t === 'line' && Math.abs(o.y1) === 20); });
          assert(ok && pieces.length >= 1, c.e.t + (power ? ' power' : '') + ' trimmed: ' + JSON.stringify(s.entities));
          assert(pieces.every(function (o) { return o.layer === 'ETCH' && o.construction === true; }), c.e.t + (power ? ' power' : '') + ' pieces keep layer and construction: ' + JSON.stringify(pieces));
          got.push(c.e.t + (power ? '*' : '') + ' ' + pieces.length);
        });
      });
      return got.join(', ');
    });
  })();
  // --- end rfAX ---
