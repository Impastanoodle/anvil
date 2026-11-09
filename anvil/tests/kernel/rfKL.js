  // --- rfKL (local-2026-11-09a, lane fitspline2) --- Fit Spline knots at curvature jumps (few control points: see
  // rfKE's first test for the counts) and pasted Constrained fit splines with their own link (Kernel.relinkFitCopies)
  (function () {
    if (typeof Kernel === 'undefined' || !Kernel.relinkFitCopies) return;
    var K = Kernel;
    group('rfKL: Fit Spline knots at curvature jumps, pasted links');
    function rfKEChain() {
      return [{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'arc', cx: 4, cy: 1, r: 1, a0: -90, a1: 0 }, { t: 'line', x1: 5, y1: 1, x2: 5, y2: 3 },
        { t: 'arc', cx: 3, cy: 3, r: 2, a0: 0, a1: 90 }, { t: 'line', x1: 3, y1: 5, x2: 0, y2: 5 }];
    }
    test('rfKL: a corner (lines meeting at 90°) keeps the spline C2 (no double knot) and within the tolerance; a tangent line-to-line joint adds no knot either', function () {
      var r = K.fitSplineEntity([{ t: 'line', x1: 0, y1: 0, x2: 2, y2: 0 }, { t: 'line', x1: 2, y1: 0, x2: 4, y2: 0 }, { t: 'line', x1: 4, y1: 0, x2: 4, y2: 2 }], [0, 1, 2], { tol: 1e-3 });
      assert(r.ok && r.dev < 1e-3, JSON.stringify(r.dev));
      var U = r.e.knots.slice(4, -4);
      assert(U.every(function (u, i) { return i === 0 || u > U[i - 1]; }), 'simple interior knots: ' + JSON.stringify(U));
      return r.e.pts.length + ' control points';
    });
    test('rfKL: a pasted copy of a Constrained fit spline with its sources gets its own link (Kernel.relinkFitCopies): it follows the copied chain, the original follows its own; a copy without its sources is unlinked', function () {
      var ch = rfKEChain(), r = K.fitSplineEntity(ch, [0, 1, 2, 3, 4], { tol: 1e-3 });
      ch.forEach(function (e) { e.construction = true; e.fitSrc = 1; });
      r.e.fit = { id: 1, tol: 1e-3, closed: true };
      var f = { entities: ch.concat([r.e]) };
      // paste: the six copied 10 to the right
      var copies = f.entities.map(function (e) { return K.translateEntity(e, 10, 0); });
      copies.forEach(function (e) { f.entities.push(e); });
      assert(K.relinkFitCopies(f, 6, 6) === 1, 'one link renewed');
      var o = f.entities[5], c = f.entities[11];
      assert(o.fit.id === 1 && c.fit.id === 2 && f.entities.slice(6, 11).every(function (e) { return e.fitSrc === 2; }) && f.entities.slice(0, 5).every(function (e) { return e.fitSrc === 1; }), 'own ids');
      // move the copied chain's last line end: only the copy refits
      K.syncFitSplines(f);   // (both take their signatures)
      var oPts = JSON.stringify(o.pts);
      f.entities[10].x2 = 8;
      assert(K.syncFitSplines(f) === 1, 'one refit');
      assert(JSON.stringify(o.pts) === oPts, 'the original stays');
      near(c.pts[c.pts.length - 1][0], 8, 1e-9, 'the copy follows its chain');
      // a copy of the spline alone is unlinked
      var g = { entities: ch.concat([r.e]).map(function (e) { return JSON.parse(JSON.stringify(e)); }) };
      g.entities.push(K.translateEntity(r.e, 0, 10));
      K.relinkFitCopies(g, 6, 1);
      assert(!g.entities[6].fit && g.entities[5].fit.id === 1, 'copy alone: no link');
      return 'ids ' + o.fit.id + ' / ' + c.fit.id;
    });
  })();
