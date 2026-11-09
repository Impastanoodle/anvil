  // --- rfKE (local-2026-11-09a, lane fitspline) --- Fit Spline as ONE multi-span cubic B-spline entity
  // ({ t: 'spline', style: true, deg: 3, knots, pts: control points }, Kernel.fitSplineEntity), within the tolerance of
  // the chain; exact profiles / extrudes, DXF SPLINE out and in (knots and control points), generateScript and save /
  // load, Constrained (refits when its source chain moves), trim / split pieces, knot insertion, offset.
  (function () {
    if (typeof Kernel === 'undefined' || !Kernel.fitSplineEntity || typeof SketchSolver === 'undefined') return;
    var K = Kernel, S = SketchSolver;
    group('rfKE: Fit Spline as one B-spline');
    // 3 lines + 2 tangent arcs (inch): 4 along, R1 up, 2 up, R2 over, 3 back
    function rfKEChain() {
      return [{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'arc', cx: 4, cy: 1, r: 1, a0: -90, a1: 0 }, { t: 'line', x1: 5, y1: 1, x2: 5, y2: 3 },
        { t: 'arc', cx: 3, cy: 3, r: 2, a0: 0, a1: 90 }, { t: 'line', x1: 3, y1: 5, x2: 0, y2: 5 }];
    }
    // dense samples of the chain (lines / arcs as they are)
    function rfKESamples(ents, n) {
      var out = [];
      ents.forEach(function (e) {
        for (var k = 0; k <= n; k++) {
          if (e.t === 'line') out.push([e.x1 + (e.x2 - e.x1) * k / n, e.y1 + (e.y2 - e.y1) * k / n]);
          else { var a = (e.a0 + (e.a1 - e.a0) * k / n) * Math.PI / 180; out.push([e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a)]); }
        }
      });
      return out;
    }
    // the exact distance from p to the chain
    function rfKEChainDist(ents, p) {
      var best = Infinity;
      ents.forEach(function (e) {
        if (e.t === 'line') {
          var dx = e.x2 - e.x1, dy = e.y2 - e.y1, t = Math.max(0, Math.min(1, ((p[0] - e.x1) * dx + (p[1] - e.y1) * dy) / (dx * dx + dy * dy)));
          best = Math.min(best, Math.hypot(p[0] - e.x1 - t * dx, p[1] - e.y1 - t * dy));
        } else {
          var ang = Math.atan2(p[1] - e.cy, p[0] - e.cx) * 180 / Math.PI;
          while (ang < e.a0) ang += 360;
          while (ang >= e.a0 + 360) ang -= 360;
          if (ang <= e.a1) best = Math.min(best, Math.abs(Math.hypot(p[0] - e.cx, p[1] - e.cy) - e.r));
          [e.a0, e.a1].forEach(function (a) { a *= Math.PI / 180; best = Math.min(best, Math.hypot(p[0] - e.cx - e.r * Math.cos(a), p[1] - e.cy - e.r * Math.sin(a))); });
        }
      });
      return best;
    }
    // the most the spline and the chain stray from each other, both ways
    function rfKEDev(sp, ents) {
      var fc = S.freeCurve(sp), m = 0, k;
      rfKESamples(ents, 120).forEach(function (p) { m = Math.max(m, S.freeClosest(fc, p).d); });
      for (k = 0; k <= 2000; k++) m = Math.max(m, rfKEChainDist(ents, fc.pt(k / 2000)));
      return m;
    }
    // the exact area of a closed spline (Gauss on each cubic piece)
    function rfKEArea(e) {
      var g = K.splineGeom(e), xs = [-0.906179845938664, -0.538469310105683, 0, 0.538469310105683, 0.906179845938664], ws = [0.236926885056189, 0.478628670499366, 0.568888888888889, 0.478628670499366, 0.236926885056189], a = 0;
      g.bez.forEach(function (B) { for (var i = 0; i < 5; i++) { var s = (xs[i] + 1) / 2, p = K.bzPoint(B, s), d = K.bzDeriv(B, s); a += ws[i] / 4 * (p[0] * d[1] - p[1] * d[0]); } });
      return Math.abs(a);
    }
    function rfKERoundRect() {
      return [{ t: 'line', x1: 1, y1: 0, x2: 5, y2: 0 }, { t: 'arc', cx: 5, cy: 1, r: 1, a0: -90, a1: 0 }, { t: 'line', x1: 6, y1: 1, x2: 6, y2: 3 }, { t: 'arc', cx: 5, cy: 3, r: 1, a0: 0, a1: 90 },
        { t: 'line', x1: 5, y1: 4, x2: 1, y2: 4 }, { t: 'arc', cx: 1, cy: 3, r: 1, a0: 90, a1: 180 }, { t: 'line', x1: 0, y1: 3, x2: 0, y2: 1 }, { t: 'arc', cx: 1, cy: 1, r: 1, a0: 180, a1: 270 }];
    }

    test('rfKE: 3 lines + 2 tangent arcs become ONE B-spline (clamped cubic, knots + control points) within the tolerance, both ways, at .001 and .0001 in', function () {
      var out = [];
      [1e-3, 1e-4].forEach(function (tol) {
        var ch = rfKEChain(), r = K.fitSplineEntity(ch, [0, 1, 2, 3, 4], { tol: tol });
        assert(r.ok, JSON.stringify(r));
        var e = r.e;
        assert(e.t === 'spline' && e.style && e.deg === 3 && K.isBSpline(e) && K.bsValid(e), 'a B-spline entity');
        assert(e.knots.length === e.pts.length + 4, 'knots = control points + 4');
        near(e.pts[0][0], 0, 1e-12, 'starts at the chain start'); near(e.pts[0][1], 0, 1e-12, 'y0');
        near(e.pts[e.pts.length - 1][0], 0, 1e-12, 'ends at the chain end'); near(e.pts[e.pts.length - 1][1], 5, 1e-12, 'y1');
        var dv = rfKEDev(e, ch);
        assert(dv < tol, 'deviation ' + dv + ' under ' + tol);
        assert(r.dev < tol && r.dev >= dv * 0.5, 'reported deviation ' + r.dev + ' (measured ' + dv + ')');
        out.push(tol + ': ' + (e.knots.length - 7) + ' spans, ' + dv.toExponential(2));
      });
      return out.join('; ');
    });

    test('rfKE: a closed fit (rounded rectangle 6 × 4, R1 corners, Closed spline) at .0001 extrudes .5 deep to the spline\'s own area × .5 within 1e-6, its area within the tolerance of the chain\'s', function () {
      var r = K.fitSplineEntity(rfKERoundRect(), [0, 1, 2, 3, 4, 5, 6, 7], { tol: 1e-4, closed: true });
      assert(r.ok && r.e.closed, 'closed: ' + JSON.stringify(r.e && r.e.closed));
      var e = r.e, P = e.pts;
      assert(P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1], 'first and last control points equal');
      var A = rfKEArea(e), chainA = 24 - (4 - Math.PI), perim = 12 + 2 * Math.PI;
      assert(Math.abs(A - chainA) < 1e-4 * perim, 'area ' + A + ' vs chain ' + chainA);
      var b = build('p.units("in");\np.sketch("Front").bspline(' + JSON.stringify(e.pts) + ', ' + JSON.stringify(e.knots) + ', { closed: true });\np.extrude(0.5);');
      assert(!b.errors.length, JSON.stringify(b.errors));
      nearRel(b.mp.volume, A * 0.5, 1e-6, 'volume = area × depth');
      // C2 through the seam: first and second derivatives (per knot length) at the end of the last piece = at the start of the first
      var g = K.splineGeom(e), B0 = g.bez[0], B1 = g.bez[g.bez.length - 1], h0 = g.knots[1] - g.knots[0], h1 = g.knots[g.bez.length] - g.knots[g.bez.length - 1];
      for (var c = 0; c < 2; c++) {
        near(3 * (B0[1][c] - B0[0][c]) / h0, 3 * (B1[3][c] - B1[2][c]) / h1, 1e-6, 'C1 at the seam [' + c + ']');
        near(6 * (B0[0][c] - 2 * B0[1][c] + B0[2][c]) / (h0 * h0), 6 * (B1[1][c] - 2 * B1[2][c] + B1[3][c]) / (h1 * h1), 1e-4, 'C2 at the seam [' + c + ']');
      }
      return 'volume ' + b.mp.volume.toFixed(9) + ', ' + (e.knots.length - 7) + ' spans';
    });

    test('rfKE: sketch DXF R2000 writes ONE SPLINE with the B-spline\'s own knots and control points; DXF in reads it back as one B-spline (control points 1e-9); R12 arcs within its tolerance', function () {
      var r = K.fitSplineEntity(rfKEChain(), [0, 1, 2, 3, 4], { tol: 1e-4 }), e = r.e;
      var txt = K.exportDXFSketch({ entities: [e] }, 'in', { version: 'R2000' });
      assert((txt.match(/\nSPLINE\r?\n/g) || []).length === 1, 'one SPLINE');
      var back = DxfImport.parse(txt, {}).entities;
      assert(back.length === 1 && K.isBSpline(back[0]), 'one B-spline back: ' + JSON.stringify(back.map(function (x) { return x.t; })));
      var b = back[0], md = 0;
      assert(b.pts.length === e.pts.length && b.knots.length === e.knots.length, 'same counts');
      b.pts.forEach(function (q, i) { md = Math.max(md, Math.hypot(q[0] - e.pts[i][0], q[1] - e.pts[i][1])); });
      assert(md < 1e-9, 'control points ' + md);
      b.knots.forEach(function (u, i) { near(u, e.knots[i], 1e-6, 'knot ' + i); });
      var r12 = K.exportDXFSketch({ entities: [e] }, 'in', {}), arcs = (r12.match(/\nARC\r?\n/g) || []).length;
      assert(arcs > 4, 'R12: arcs along it (' + arcs + ')');
      return md.toExponential(1) + ', R12 ' + arcs + ' arcs';
    });

    test('rfKE: a foreign DXF SPLINE (uniform interior knots, not Bézier spans) reads in as ONE B-spline of the same curve', function () {
      var C = [[0, 0], [1, 2], [3, 3], [5, 1], [6, 2], [8, 0]], U = [0, 0, 0, 0, 1, 2, 3, 3, 3, 3];
      var lines = ['0', 'SECTION', '2', 'ENTITIES', '0', 'SPLINE', '8', '0', '70', '8', '71', '3', '72', String(U.length), '73', String(C.length)];
      U.forEach(function (u) { lines.push('40', String(u)); });
      C.forEach(function (c) { lines.push('10', String(c[0]), '20', String(c[1]), '30', '0'); });
      lines.push('0', 'ENDSEC', '0', 'EOF');
      var back = DxfImport.parse(lines.join('\n'), {}).entities;
      assert(back.length === 1 && K.isBSpline(back[0]), 'one B-spline: ' + JSON.stringify(back));
      var ref = { t: 'spline', style: true, deg: 3, knots: U, pts: C }, fa = S.freeCurve(ref), fb = S.freeCurve(back[0]), m = 0;
      for (var k = 0; k <= 50; k++) m = Math.max(m, Math.hypot(fa.pt(k / 50)[0] - fb.pt(k / 50)[0], fa.pt(k / 50)[1] - fb.pt(k / 50)[1]));
      assert(m < 1e-9, 'same curve: ' + m);
      return m.toExponential(1);
    });

    test('rfKE: generateScript (.bspline, .fitSource) and save / load keep the B-spline and its Constrained link', function () {
      var ch = rfKEChain(), r = K.fitSplineEntity(ch, [0, 1, 2, 3, 4], { tol: 1e-3 });
      ch.forEach(function (e) { e.construction = true; e.fitSrc = 1; });
      r.e.fit = { id: 1, tol: 1e-3, closed: true };
      var model = K.newModel('rfKE');
      K.runScript(model, 'p.units("in");\np.sketch("Front");');
      var sk = model.features.filter(function (f) { return f.type === 'sketch'; })[0];
      sk.entities = ch.concat([r.e]);
      var code = K.generateScript(model);
      assert(/\.bspline\(/.test(code) && /\.fitSource\(1, \[0,1,2,3,4\]\)/.test(code), 'script lines: ' + code);
      var m2 = K.newModel('x');
      K.runScript(m2, code);
      var s2 = m2.features.filter(function (f) { return f.type === 'sketch'; })[0], e2 = s2.entities[5];
      assert(K.isBSpline(e2) && JSON.stringify(e2.pts) === JSON.stringify(r.e.pts) && JSON.stringify(e2.knots) === JSON.stringify(r.e.knots), 'same B-spline');
      assert(e2.fit && e2.fit.id === 1 && e2.fit.tol === 1e-3 && s2.entities.slice(0, 5).every(function (x) { return x.fitSrc === 1; }), 'link kept');
      var m3 = JSON.parse(JSON.stringify(model)), e3 = m3.features.filter(function (f) { return f.type === 'sketch'; })[0].entities[5];
      assert(JSON.stringify(e3) === JSON.stringify(r.e), 'save / load');
      return code.split('\n').length + ' script lines';
    });

    test('rfKE: Constrained: a dimension change on the source chain refits the spline (its ends on the new chain ends, within the tolerance)', function () {
      var ch = rfKEChain(), r = K.fitSplineEntity(ch, [0, 1, 2, 3, 4], { tol: 1e-3 });
      ch.forEach(function (e) { e.construction = true; e.fitSrc = 7; });
      r.e.fit = { id: 7, tol: 1e-3, closed: true };
      var sk = { entities: ch.concat([r.e]), rels: [
        { type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '4.p1'] },
        { type: 'tangent', refs: ['0', '1'] }, { type: 'tangent', refs: ['1', '2'] }, { type: 'tangent', refs: ['2', '3'] }, { type: 'tangent', refs: ['3', '4'] },
        { type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['2'] }, { type: 'horizontal', refs: ['4'] }, { type: 'coincident', refs: ['0.p1', 'O'] },
        { type: 'coincident', refs: ['5.p1', '0.p1'] }, { type: 'coincident', refs: ['5.p2', '4.p2'] }],
        dims: [{ e: 0, k: 'len', off: -0.3 }, { e: 2, k: 'len', off: 0.3 }, { e: 4, k: 'len', off: 0.3 }, { e: 1, k: 'r' }, { e: 3, k: 'r' }] };
      S.solve(sk);
      var before = JSON.stringify(sk.entities[5].pts), n0 = K.syncFitSplines(sk);
      assert(n0 === 0, 'nothing to refit at the start: ' + n0);
      var res = S.setDim(sk, 1, 3);   // the vertical line 2 → 3 long
      assert(res && res.ok !== false, 'dimension set: ' + JSON.stringify(res));
      near(Math.abs(sk.entities[2].y2 - sk.entities[2].y1), 3, 1e-6, 'the source moved');
      var e = sk.entities[5];
      assert(JSON.stringify(e.pts) !== before, 'the spline refitted');
      var end = sk.entities[4], P = e.pts[e.pts.length - 1];
      near(P[0], end.x2, 1e-6, 'end x on the chain end'); near(P[1], end.y2, 1e-6, 'end y on the chain end');
      var dv = rfKEDev(e, sk.entities.slice(0, 5));
      assert(dv < 1e-3, 'within the tolerance of the moved chain: ' + dv);
      return 'end at ' + P.map(function (x) { return x.toFixed(4); }).join(', ') + ', deviation ' + dv.toExponential(2);
    });

    test('rfKE: trim pieces (SketchSolver.freePiece via Kernel.bsSub), Insert Spline Point (knot insertion) and Offset keep a B-spline on the same curve', function () {
      var e = K.fitSplineEntity(rfKEChain(), [0, 1, 2, 3, 4], { tol: 1e-4 }).e, fc = S.freeCurve(e), k, m = 0;
      var U = e.knots, ua = U[3], L = U[e.pts.length] - ua;
      var piece = K.bsSub(e, ua + 0.3 * L, ua + 0.7 * L);
      assert(piece && K.bsValid(piece), 'a B-spline piece');
      var fp = S.freeCurve(piece);
      for (k = 0; k <= 40; k++) { var q = fp.pt(k / 40), w = fc.pt(0.3 + 0.4 * k / 40); m = Math.max(m, Math.hypot(q[0] - w[0], q[1] - w[1])); }
      assert(m < 1e-9, 'piece on the curve: ' + m);
      var ins = K.bsInsertKnot(e, ua + 0.43 * L), ei = { t: 'spline', style: true, deg: 3, knots: ins.knots, pts: ins.pts }, fi = S.freeCurve(ei), m2 = 0;
      assert(ins.pts.length === e.pts.length + 1, 'one control point more');
      for (k = 0; k <= 200; k++) m2 = Math.max(m2, Math.hypot(fi.pt(k / 200)[0] - fc.pt(k / 200)[0], fi.pt(k / 200)[1] - fc.pt(k / 200)[1]));
      assert(m2 < 1e-9, 'same curve after insertion: ' + m2);
      // Trim at a crossing line: the piece kept is a B-spline ending on the line
      var sk = { entities: [JSON.parse(JSON.stringify(e)), { t: 'line', x1: 2, y1: -1, x2: 2, y2: 6 }] };
      var tr = S.trimAt(sk, 0, [1, 0], {});
      assert(tr.ok, 'trimmed: ' + JSON.stringify(tr));
      var kept = sk.entities.filter(function (x) { return K.isBSpline(x); });
      assert(kept.length >= 1, 'B-spline pieces kept: ' + JSON.stringify(sk.entities.map(function (x) { return x.t + (x.knots ? '/bs' : ''); })));
      // Offset .25: a B-spline .25 off the curve
      var o = S.offsetEntity(e, 0.25);
      assert(o, 'an offset');
      {
        assert(K.isBSpline(o), 'offset is a B-spline');
        var fo = S.freeCurve(o), m3 = 0;
        for (k = 0; k <= 100; k++) m3 = Math.max(m3, Math.abs(S.freeClosest(fc, fo.pt(k / 100)).d - 0.25));
        assert(m3 < 2e-3, 'offset .25 within 2e-3: ' + m3);
      }
      return 'piece ' + m.toExponential(1) + ', insert ' + m2.toExponential(1);
    });
  })();
