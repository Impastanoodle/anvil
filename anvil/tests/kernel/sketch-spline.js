  // --- sketch-spline: Spline, Ellipse and Partial Ellipse (kernel-sketch.js splineGeom / ellipsePoint / area-true
  // profiles, kernel-script.js SPLINE / ELLIPSE DXF and the builder, sketch-solver.js refs). Volumes are exact: the
  // profile points of a spline or ellipse are moved off the curve so the polygon has the curve's own area ---
  (function () {
    group('sketch-spline: Spline, Ellipse and Partial Ellipse');
    var SS = SketchSolver;
    function near2(a, b, tol, label) { near(a[0], b[0], tol, label + ' x'); near(a[1], b[1], tol, label + ' y'); }
    // exact area of a closed chain of Bézier spans (Green's theorem, 3-point Gauss-Legendre: exact for cubics)
    function bezArea(bez) {
      var g = [[-Math.sqrt(0.6), 5 / 9], [0, 8 / 9], [Math.sqrt(0.6), 5 / 9]], a = 0;
      bez.forEach(function (B) {
        g.forEach(function (gw) {
          var s = 0.5 + 0.5 * gw[0], p = K.bezPoint(B, s), u = 1 - s;
          var d = [3 * u * u * (B[1][0] - B[0][0]) + 6 * u * s * (B[2][0] - B[1][0]) + 3 * s * s * (B[3][0] - B[2][0]), 3 * u * u * (B[1][1] - B[0][1]) + 6 * u * s * (B[2][1] - B[1][1]) + 3 * s * s * (B[3][1] - B[2][1])];
          a += 0.5 * gw[1] * 0.5 * (p[0] * d[1] - p[1] * d[0]);
        });
      });
      return a;
    }
    function d1(B, s) { var u = 1 - s; return [3 * u * u * (B[1][0] - B[0][0]) + 6 * u * s * (B[2][0] - B[1][0]) + 3 * s * s * (B[3][0] - B[2][0]), 3 * u * u * (B[1][1] - B[0][1]) + 6 * u * s * (B[2][1] - B[1][1]) + 3 * s * s * (B[3][1] - B[2][1])]; }
    function d2(B, s) { var u = 1 - s; return [6 * u * (B[2][0] - 2 * B[1][0] + B[0][0]) + 6 * s * (B[3][0] - 2 * B[2][0] + B[1][0]), 6 * u * (B[2][1] - 2 * B[1][1] + B[0][1]) + 6 * s * (B[3][1] - 2 * B[2][1] + B[1][1])]; }
    test('sketch-spline: the spline passes through its points, is C2 (derivatives in chord-length parameter continuous at every point), natural at free ends, periodic when closed', function () {
      var pts = [[0, 0], [5, 4], [12, 3], [20, 0], [26, 6]], g = K.splineGeom({ pts: pts }), h = [];
      assert(g.bez.length === 4 && !g.closed, 'four spans');
      g.bez.forEach(function (B, i) { near2(B[0], pts[i], 1e-12, 'span ' + i + ' start'); near2(B[3], pts[i + 1], 1e-12, 'span ' + i + ' end'); h.push(g.knots[i + 1] - g.knots[i]); });
      for (var i = 1; i < 4; i++) {
        var a = d1(g.bez[i - 1], 1), b = d1(g.bez[i], 0), A = d2(g.bez[i - 1], 1), Bv = d2(g.bez[i], 0);
        near2([a[0] / h[i - 1], a[1] / h[i - 1]], [b[0] / h[i], b[1] / h[i]], 1e-9, 'C1 at point ' + i);
        near2([A[0] / (h[i - 1] * h[i - 1]), A[1] / (h[i - 1] * h[i - 1])], [Bv[0] / (h[i] * h[i]), Bv[1] / (h[i] * h[i])], 1e-9, 'C2 at point ' + i);
      }
      near2(d2(g.bez[0], 0), [0, 0], 1e-9, 'natural start'); near2(d2(g.bez[3], 1), [0, 0], 1e-9, 'natural end');
      var c = K.splineGeom({ pts: pts, closed: true }), m = c.bez.length, hc = function (k) { return c.knots[k + 1] - c.knots[k]; };
      assert(c.closed && m === 5, 'closed: five spans');
      near2(c.bez[m - 1][3], pts[0], 1e-12, 'closes on the first point');
      var e1 = d2(c.bez[m - 1], 1), s1 = d2(c.bez[0], 0);
      near2([e1[0] / (hc(m - 1) * hc(m - 1)), e1[1] / (hc(m - 1) * hc(m - 1))], [s1[0] / (hc(0) * hc(0)), s1[1] / (hc(0) * hc(0))], 1e-9, 'C2 through the first point');
      return 'knots ' + g.knots.map(fmt).join(' ');
    });
    test('sketch-spline: Tangent Driving fixes the direction and speed at a point (weight 2 at 90°); Maintain internal continuity off (local) is C1 with the neighbours\' chord as tangent', function () {
      var g = K.splineGeom({ pts: [[0, 0], [5, 4], [12, 3]], tans: [null, [90, 2], null] }), h0 = g.knots[1] - g.knots[0], h1 = g.knots[2] - g.knots[1];
      var a = d1(g.bez[0], 1), b = d1(g.bez[1], 0);
      near2([a[0] / h0, a[1] / h0], [0, 2], 1e-12, 'incoming tangent'); near2([b[0] / h1, b[1] / h1], [0, 2], 1e-12, 'outgoing tangent');
      var l = K.splineGeom({ pts: [[0, 0], [5, 4], [12, 3], [20, 0]], local: true }), q = d1(l.bez[1], 0), hq = l.knots[2] - l.knots[1];
      var want = [(12 - 0) / (l.knots[2] - l.knots[0]), (3 - 0) / (l.knots[2] - l.knots[0])];
      near2([q[0] / hq, q[1] / hq], want, 1e-12, 'local tangent at point 1');
      // a local spline: moving point 3 leaves the first span alone
      var l2 = K.splineGeom({ pts: [[0, 0], [5, 4], [12, 3], [20, 6]], local: true });
      near2(l2.bez[0][2], l.bez[0][2], 1e-12, 'first span unchanged');
      return 'ok';
    });
    test('sketch-spline: Ellipse, Partial Ellipse and Spline extrude to their exact volumes (πab·h; spline area by Green\'s theorem) on Front, Top and Right', function () {
      var r = build('p.sketch("Front").ellipse(3, 2, 20, 10, 30).extrude(5);');
      noErrors(r); nearRel(r.mp.volume, Math.PI * 200 * 5, 1e-9, 'ellipse');
      r = build('p.sketch("Top").ellipse(1, 1, 6, 10, 15).extrude(5);');
      noErrors(r); nearRel(r.mp.volume, Math.PI * 60 * 5, 1e-9, 'tall ellipse, Top');
      r = build('p.sketch("Right").partialEllipse(0, 0, 20, 10, 0, 0, 180).line(-20, 0, 20, 0).extrude(5);');
      noErrors(r); nearRel(r.mp.volume, Math.PI * 100 * 5, 1e-9, 'half ellipse + line, Right');
      var spl = { t: 'spline', pts: [[0, 0], [10, 5], [20, 0], [10, -5]], closed: true };
      r = build('p.sketch("Front").spline(' + JSON.stringify(spl.pts) + ', true).extrude(2);');
      noErrors(r); nearRel(r.mp.volume, Math.abs(bezArea(K.splineGeom(spl).bez)) * 2, 1e-9, 'closed spline');
      var open = { t: 'spline', pts: [[0, 0], [5, 4], [12, 3], [20, 0]], tans: [[80, 1.5], null, null, null] };
      r = build('p.sketch("Front").spline(' + JSON.stringify(open.pts) + ', false, ' + JSON.stringify(open.tans) + ').line(0, 0, 20, 0).extrude(1);');
      noErrors(r);
      nearRel(r.mp.volume, Math.abs(bezArea(K.splineGeom(open).bez)), 1e-9, 'open spline closed by a line');   // the line adds no area (it lies on y = 0)
      var prof = r.model.features[0].profile;
      assert(prof.free && prof.free.length === 1 && prof.free[0].t === 'spline', 'profile.free');
      assert(prof.loops[0].fseg.filter(function (x) { return x !== -1; }).length === prof.loops[0].pts.length - 1, 'every chord but the line on the spline: ' + JSON.stringify(prof.loops[0].fseg));
      return fmt(r.mp.volume);
    });
    test('sketch-spline: a Cut-Extrude of an ellipse and a closed spline through a plate removes exactly their areas; nested in a rectangle they are holes (sketch DXF layer HOLES)', function () {
      var spl = [[12, 0], [18, 6], [24, 0], [18, -6]];
      var r = build('p.sketch("Front").rect(-30, -20, 60, 40).extrude(4);\np.sketch("Front", 4).ellipse(0, 0, 10, 5, 20).spline(' + JSON.stringify(spl) + ', true).cut("through", { reverse: true });');
      noErrors(r);
      var holes = Math.PI * 50 + Math.abs(bezArea(K.splineGeom({ pts: spl, closed: true }).bez));
      nearRel(r.mp.volume, (2400 - holes) * 4, 1e-9, 'plate minus holes');
      var sk = { entities: [{ t: 'rect', x: -30, y: -20, w: 60, h: 40 }, { t: 'ellipse', cx: 0, cy: 0, rx: 10, ry: 5, rot: 20 }, { t: 'spline', pts: spl, closed: true }] };
      var d = DxfCheck.parse(K.exportDXFSketch(sk, 'mm', { version: 'R2000' }));
      var lay = d.entities.map(function (e) { return e.type + '@' + e.layer; }).sort().join(' ');
      assert(lay === 'ELLIPSE@HOLES LINE@OUTLINE LINE@OUTLINE LINE@OUTLINE LINE@OUTLINE SPLINE@HOLES', lay);
      return fmt(r.mp.volume);
    });
    test('sketch-spline: sketch DXF R2000 writes SPLINE (degree 3, knots = control points + 4, the spans\' own control points) and ELLIPSE (major axis, ratio ≤ 1, parameters; a tall ellipse swaps its axes)', function () {
      var spl = { t: 'spline', pts: [[0, 0], [5, 4], [12, 3]] }, g = K.splineGeom(spl);
      var txt = K.exportDXFSketch({ entities: [spl, { t: 'ellipse', cx: 1, cy: 2, rx: 4, ry: 9, rot: 0 }, { t: 'pellipse', cx: 0, cy: 0, rx: 5, ry: 3, rot: 0, a0: 90, a1: 270 }] }, 'mm', { version: 'R2000' });
      var P = txt.split(/\r?\n/), pairs = [];
      for (var i = 0; i + 1 < P.length; i += 2) pairs.push([+P[i], P[i + 1]]);
      function entity(type, nth) { var k = -1, out = []; for (var j = 0; j < pairs.length; j++) { if (pairs[j][0] === 0) { if (out.length) break; if (pairs[j][1] === type && ++k === nth) out.push(pairs[j]); continue; } if (out.length) out.push(pairs[j]); } return out; }
      function vals(ent, code) { return ent.filter(function (q) { return q[0] === code; }).map(function (q) { return +q[1]; }); }
      var S = entity('SPLINE', 0), kn = vals(S, 40), cx = vals(S, 10), cy = vals(S, 20);
      assert(vals(S, 71)[0] === 3 && vals(S, 72)[0] === kn.length && vals(S, 73)[0] === cx.length && kn.length === cx.length + 4, 'degree / counts: ' + kn.length + ' knots, ' + cx.length + ' control points');
      assert(cx.length === 7, 'two spans: 7 control points');
      near(cx[1], g.bez[0][1][0], 1e-6, 'first inner control point x'); near(cy[5], g.bez[1][2][1], 1e-6, 'last inner control point y');
      near(kn[kn.length - 1], g.knots[2], 1e-9, 'last knot = chord length');
      var E = entity('ELLIPSE', 0);
      near(vals(E, 11)[0], 0, 1e-9, 'tall ellipse: major axis along y (x)'); near(vals(E, 21)[0], 9, 1e-9, 'major axis along y'); near(vals(E, 40)[0], 4 / 9, 1e-9, 'ratio');
      near(vals(E, 41)[0], 0, 1e-9, 'start'); near(vals(E, 42)[0], 2 * Math.PI, 1e-8, 'end');
      var PE = entity('ELLIPSE', 1);
      near(vals(PE, 41)[0], Math.PI / 2, 1e-8, 'partial start'); near(vals(PE, 42)[0], 3 * Math.PI / 2, 1e-8, 'partial end');
      return 'SPLINE ' + cx.length + ' / ' + kn.length + ', ELLIPSE ×2';
    });
    test('sketch-spline: sketch DXF R12 writes them as ARCs (LINE where straight) that chain end to end and stay within 0.001 mm (0.00004 in) of the curve; a laser-ready check passes', function () {
      var ents = [{ t: 'ellipse', cx: 0, cy: 0, rx: 30, ry: 12, rot: 15 }, { t: 'spline', pts: [[-25, -15], [-20, -5], [-15, -15]] }, { t: 'line', x1: -25, y1: -15, x2: -15, y2: -15 },
        { t: 'pellipse', cx: 15, cy: 0, rx: 5, ry: 3, rot: 0, a0: 90, a1: 270 }, { t: 'line', x1: 15, y1: 3, x2: 15, y2: -3 }];
      var det = [];
      ['mm', 'in'].forEach(function (u) {
        var txt = K.exportDXFSketch({ entities: ents }, u), c = DxfCheck.check(txt, { units: u }), d = DxfCheck.parse(txt);
        assert(c.ok, u + ': ' + c.errors.slice(0, 4).join('; '));
        assert(!d.entities.some(function (e) { return e.type === 'SPLINE' || e.type === 'ELLIPSE' || e.type === 'LWPOLYLINE'; }), 'R12 has no SPLINE / ELLIPSE');
        // every arc's middle lies on the ellipse within the tolerance (the first ellipse's arcs: centre near the origin)
        var tol = u === 'in' ? 4e-5 : 1e-3, e = ents[0], worst = 0;
        DxfCheck.parse(K.exportDXFSketch({ entities: [e] }, u)).entities.forEach(function (a) {
          if (a.type !== 'ARC') return;
          var a0 = a.a0, a1 = a.a1; while (a1 <= a0) a1 += 360;
          var m = (a0 + a1) / 2 * Math.PI / 180, q = [a.c[0] + a.r * Math.cos(m), a.c[1] + a.r * Math.sin(m)];
          var ro = e.rot * Math.PI / 180, lx = Math.cos(ro) * q[0] + Math.sin(ro) * q[1], ly = -Math.sin(ro) * q[0] + Math.cos(ro) * q[1];
          var f = Math.sqrt(lx * lx / (e.rx * e.rx) + ly * ly / (e.ry * e.ry));   // the radial distance off the ellipse is about |f − 1|·r
          worst = Math.max(worst, Math.abs(f - 1) * Math.hypot(lx, ly));
        });
        assert(worst < 2 * tol, u + ': arc off the ellipse by ' + worst);
        det.push(u + ' ' + JSON.stringify(c.counts));
      });
      return det.join('; ');
    });
    test('sketch-spline: scripts round-trip .spline (closed, tangents), .ellipse and .partialEllipse; a mirrored copy and a translated copy stay true entities', function () {
      var code = 'p.sketch("Front").spline([[0, 0], [5, 4], [12, 3]], false, [[45, 1.2], null, null]).line(0, 0, 12, 3).ellipse(30, 0, 8, 3, 10).partialEllipse(0, 20, 6, 2, 0, 0, 180).line(-6, 20, 6, 20).extrude(2);';
      var r = build(code);
      noErrors(r);
      var s = K.generateScript(r.model);
      assert(/\.spline\(\[\[0,0\],\[5,4\],\[12,3\]\], false, \[\[45,1\.2\],null,null\]\)/.test(s) && /\.ellipse\(30, 0, 8, 3, 10\)/.test(s) && /\.partialEllipse\(0, 20, 6, 2, 0, 0, 180\)/.test(s), s);
      var r2 = build(s.replace(/^[\s\S]*?(p\.)/, '$1'));
      noErrors(r2); nearRel(r2.mp.volume, r.mp.volume, 1e-12, 'same volume after the round trip');
      var ax = K.mirrorAxis('y'), m = K.mirrorEntity({ t: 'pellipse', cx: 2, cy: 1, rx: 5, ry: 3, rot: 20, a0: 10, a1: 100 }, ax);
      var p0 = K.ellipsePoint({ cx: 2, cy: 1, rx: 5, ry: 3, rot: 20 }, 10 * Math.PI / 180), q1 = K.ellipsePoint(m, m.a1 * Math.PI / 180);
      assert(m.t === 'pellipse', 'still a partial ellipse');
      near2(q1, [-p0[0], p0[1]], 1e-9, 'mirrored start becomes the mirror\'s end');
      var ms = K.mirrorEntity({ t: 'spline', pts: [[1, 0], [2, 3]], tans: [[30, 1], null] }, ax);
      assert(ms.t === 'spline' && ms.pts[1][0] === -2 && ms.tans[0][0] === 150, JSON.stringify(ms));
      var tr = K.translateEntity({ t: 'ellipse', cx: 1, cy: 1, rx: 2, ry: 1, rot: 0 }, 3, 4);
      assert(tr.cx === 4 && tr.cy === 5, JSON.stringify(tr));
      return s.split('\n').filter(function (l) { return /spline|llipse/.test(l); }).length + ' curve lines';
    });
    test('sketch-spline: solver refs: spline ends p1 / p2 and points v1…, ellipse centre and axis ends v0…v3, partial ellipse ends; a spline drawn from a line end infers Coincident and follows a drag of the line', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'spline', pts: [[10, 0], [15, 5], [20, 0]] }, { t: 'pellipse', cx: 30, cy: 0, rx: 5, ry: 2, rot: 0, a0: 0, a1: 90 }], rels: [] };
      assert(SS.pointRefs(s, 1).map(function (x) { return x.ref; }).join() === '1.p1,1.v1,1.p2', 'spline refs');
      assert(SS.pointRefs(s, 2).map(function (x) { return x.ref; }).join() === '2.c,2.p1,2.p2,2.v0,2.v1,2.v2,2.v3', 'partial ellipse refs');
      near2(SS.refPoint(s, '2.p2'), [30, 2], 1e-12, 'partial ellipse end at 90°'); near2(SS.refPoint(s, '2.v2'), [25, 0], 1e-12, 'major axis end 2');
      assert(SS.curveRefs(s, 1).length === 0, 'a spline has no line edges');
      SS.infer(s, 1);
      assert(JSON.stringify(s.rels) === '[{"type":"coincident","refs":["1.p1","0.p2"]}]', JSON.stringify(s.rels));
      assert(SS.drag(s, '0.p2', [12, 3], JSON.parse(JSON.stringify(s.entities))).ok, 'drag');
      near2(s.entities[1].pts[0], [12, 3], 1e-6, 'the spline end follows');
      near2(s.entities[1].pts[2], [20, 0], 1e-6, 'its far end stays');
      assert(SS.refName(s, '1.v1') === 'Spline2 point 2' && SS.refName(s, '2.v1') === 'Partial Ellipse3 minor axis end', SS.refName(s, '2.v1'));
      // dragging an ellipse's major axis end turns and stretches it about its centre
      var e = { entities: [{ t: 'ellipse', cx: 0, cy: 0, rx: 10, ry: 4, rot: 0 }], rels: [] };
      for (var st = 1; st <= 18; st++) {   // the mouse sweeps round in small moves, as a drag does
        var an = st * 5 * Math.PI / 180, rr = 10 + 2 * st / 18;
        assert(SS.drag(e, '0.v0', [rr * Math.cos(an), rr * Math.sin(an)], JSON.parse(JSON.stringify(e.entities))).ok, 'axis drag ' + st);
      }
      var E = e.entities[0];
      assert(Math.hypot(E.cx, E.cy) < 1, 'the centre stays (' + E.cx + ', ' + E.cy + ')');
      near2(SS.refPoint(e, '0.v0'), [0, 12], 1e-6, 'the axis end follows');
      // dragging a partial ellipse's end slides it along the ellipse
      var pe = { entities: [{ t: 'pellipse', cx: 0, cy: 0, rx: 10, ry: 4, rot: 0, a0: 0, a1: 90 }], rels: [] };
      var target = K.ellipsePoint(pe.entities[0], 120 * Math.PI / 180);
      assert(SS.drag(pe, '0.p2', target, JSON.parse(JSON.stringify(pe.entities))).ok, 'end drag');
      near(pe.entities[0].rx, 10, 0.5, 'radius kept'); near(pe.entities[0].a1, 120, 3, 'end angle follows');
      return SS.analyze(s).status;
    });
    test('sketch-spline: an ellipse\'s Smart Dimensions are its major / minor radii (rx / ry, the click picks the nearer axis) and drive it', function () {
      var e = { t: 'ellipse', cx: 1, cy: 1, rx: 10, ry: 4, rot: 30 };
      assert(K.dimForEntity(e, K.ellipsePoint(e, 0.1)).k === 'rx' && K.dimForEntity(e, K.ellipsePoint(e, Math.PI / 2 - 0.1)).k === 'ry', 'nearer axis');
      var g = K.dimGeometry(e, { k: 'ry' });
      near(g.value, 4, 1e-12, 'minor radius'); near2(g.Q, K.ellipsePoint(e, Math.PI / 2), 1e-12, 'to the minor axis end');
      var s = { entities: [e], dims: [{ e: 0, k: 'rx' }, { e: 0, k: 'ry' }], rels: [{ type: 'coincident', refs: ['0.c', 'O'] }, { type: 'horizontal', refs: ['0.c', '0.v0'] }] };
      SS.solve(s);   // the Horizontal levels it first
      assert(SS.analyze(s).status === 'full', 'fully defined: ' + SS.analyze(s).status + ' dof ' + SS.analyze(s).dof);
      assert(SS.setDim(s, 0, 12).ok, 'drive rx');
      near(s.entities[0].rx, 12, 1e-9, 'rx'); near(s.entities[0].rot % 180, 0, 1e-6, 'level');
      return 'dof ' + SS.analyze(s).dof;
    });
    test('sketch-spline: Trim refuses a spline / ellipse (for now) but trims a line where it crosses an ellipse', function () {
      var ents = [{ t: 'ellipse', cx: 0, cy: 0, rx: 10, ry: 5, rot: 0 }, { t: 'line', x1: -20, y1: 0, x2: 0, y2: 0 }];
      var threw = false;
      try { K.trimEntity(ents, 0, [10, 0]); } catch (err) { threw = /cannot be trimmed/.test(err.message); }
      assert(threw, 'spline / ellipse trim refused with a message');
      var out = K.trimEntity(ents, 1, [-5, 0]);
      assert(out.length === 2 && out[1].t === 'line', JSON.stringify(out));
      near(Math.max(out[1].x1, out[1].x2), -10, 0.06, 'trimmed at the ellipse (to its chord tolerance)');
      return JSON.stringify(out[1]);
    });
  })();
  // --- end sketch-spline ---
