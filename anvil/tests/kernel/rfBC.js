  // --- rfBC ---
  // (2026-10-13) Stretch Entities by a box (the points inside it move, what crosses it stretches), spline curvature
  // through Split / Trim / a scaled block instance, inch angle tolerances keep their leading zero
  (function () {
    var K = window.Kernel, S = window.SketchSolver, DW = typeof Drawing !== 'undefined' ? Drawing : null;
    group('rfBC: box Stretch, spline curvature on pieces and block instances, angle tolerances');
    function rfBCRect() {   // a 10 x 6 rectangle drawn as four lines, as the Corner Rectangle tool makes it
      var f = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 10, y1: 0, x2: 10, y2: 6 }, { t: 'line', x1: 10, y1: 6, x2: 0, y2: 6 }, { t: 'line', x1: 0, y1: 6, x2: 0, y2: 0 }], rels: [] };
      for (var j = 0; j < 4; j++) { f.rels.push({ type: j % 2 ? 'vertical' : 'horizontal', refs: [String(j)] }); f.rels.push({ type: 'coincident', refs: [j + '.p2', ((j + 1) % 4) + '.p1'] }); }
      return f;
    }
    function rfBCBox(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
    test('rfBC: Stretch with a box over the right half of a rectangle moves the right side and stretches the top and bottom; the left side stays; a width distance and the top line\'s length dimension read the new size', function () {
      var f = rfBCRect();
      f.rels.push({ type: 'distance', refs: ['3', '1'], v: 10 });
      f.dims = [{ e: 2, k: 'len', off: 1 }];
      var r = S.stretchEntities(f, [0, 1, 2], rfBCBox(6, -1, 12, 7), { dx: 2, dy: 0 });
      assert(r.ok, r.error);
      var E = f.entities;
      near(E[1].x1, 12, 1e-9, 'right side x'); near(E[1].x2, 12, 1e-9, 'right side x (top)');
      near(E[0].x1, 0, 1e-9, 'bottom left end stays'); near(E[0].x2, 12, 1e-9, 'bottom stretched'); near(E[2].x1, 12, 1e-9, 'top stretched'); near(E[2].x2, 0, 1e-9, 'top left end stays');
      near(E[3].x1, 0, 1e-9, 'left side stays'); near(E[3].y1, 6, 1e-9, 'left side stays (top)');
      var dist = f.rels.filter(function (q) { return q.type === 'distance'; })[0];
      near(dist.v, 12, 1e-9, 'width distance updated');
      near(K.dimValue(E[2], f.dims[0]), 12, 1e-9, 'top length dimension');
      assert(S.analyze(f).conflicts === 0, 'solves');
      // nothing inside the box: nothing to stretch, the sketch as it was
      var g = rfBCRect(), before = JSON.stringify(g.entities), r2 = S.stretchEntities(g, [0], rfBCBox(4, -1, 6, 1), { dx: 2, dy: 0 });
      assert(!r2.ok && JSON.stringify(g.entities) === before, 'no end inside: refused, unchanged');
      return 'width ' + dist.v;
    });
    test('rfBC: a rectangle entity stays a rectangle stretched sideways (two corners in the box) and becomes four lines stretched on a slant; a slot stretches by one end; a window box round a whole circle moves it', function () {
      var f = { entities: [{ t: 'rect', x: 0, y: 0, w: 10, h: 6 }] };
      assert(S.stretchEntities(f, [0], rfBCBox(6, -1, 12, 7), { dx: 3, dy: 0 }).ok, 'sideways');
      var e = f.entities[0];
      assert(e.t === 'rect' && e.x === 0 && e.y === 0 && Math.abs(e.w - 13) < 1e-9 && e.h === 6, 'still a rectangle ' + JSON.stringify(e));
      var g = { entities: [{ t: 'rect', x: 0, y: 0, w: 10, h: 6 }] };
      assert(S.stretchEntities(g, [0], rfBCBox(6, -1, 12, 7), { dx: 2, dy: 1 }).ok, 'slant');
      assert(g.entities.length === 4 && g.entities.every(function (l) { return l.t === 'line'; }), 'four lines: ' + g.entities.map(function (l) { return l.t; }));
      // the right side goes where the box sends it; its Horizontal top and bottom take the left side up with it
      near(g.entities[1].x1, 12, 1e-9, 'right side moved x'); near(g.entities[1].y1, 1, 1e-9, 'right side moved y'); near(g.entities[0].x1, 0, 1e-9, 'left end stays in x'); near(g.entities[0].y1, 1, 1e-7, 'bottom still horizontal');
      assert(S.analyze(g).conflicts === 0, 'solved');
      var s = { entities: [{ t: 'slot', x1: 0, y1: 0, x2: 10, y2: 0, w: 2 }, { t: 'circle', cx: 20, cy: 0, r: 1 }] };
      assert(S.stretchEntities(s, [0, 1], rfBCBox(8, -2, 22, 2), { dx: 5, dy: 0 }).ok, 'slot');
      var sl = s.entities[0], c = s.entities[1];
      assert(sl.x1 === 0 && Math.abs(sl.x2 - 15) < 1e-9 && sl.w === 2 && Math.abs(c.cx - 25) < 1e-9 && c.r === 1, 'slot ' + JSON.stringify(sl) + ' circle ' + JSON.stringify(c));
      return 'ok';
    });
    test('rfBC: an L-shape with a tangent arc corner — a box round the arc and the right leg moves the arc whole, stretches the bottom and the inner top; the tangents still hold', function () {
      var f = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 8, y2: 0 }, { t: 'arc', cx: 8, cy: 2, r: 2, a0: 270, a1: 360 }, { t: 'line', x1: 10, y1: 2, x2: 10, y2: 4 },
        { t: 'line', x1: 10, y1: 4, x2: 4, y2: 4 }, { t: 'line', x1: 4, y1: 4, x2: 4, y2: 10 }, { t: 'line', x1: 4, y1: 10, x2: 0, y2: 10 }, { t: 'line', x1: 0, y1: 10, x2: 0, y2: 0 }],
        rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'tangent', refs: ['0', '1'] }, { type: 'tangent', refs: ['1', '2'] },
          { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '4.p1'] }, { type: 'coincident', refs: ['4.p2', '5.p1'] }, { type: 'coincident', refs: ['5.p2', '6.p1'] }, { type: 'coincident', refs: ['6.p2', '0.p1'] }] };
      var r = S.stretchEntities(f, [0, 1, 2, 3], rfBCBox(7, -1, 11, 5), { dx: 3, dy: 0 });
      assert(r.ok, r.error);
      var E = f.entities;
      near(E[1].cx, 11, 1e-9, 'arc centre moved'); near(E[1].r, 2, 1e-9, 'arc radius kept');
      near(E[0].x2, 11, 1e-9, 'bottom stretched'); near(E[0].x1, 0, 1e-9, 'bottom left end stays');
      near(E[2].x1, 13, 1e-9, 'right leg moved'); near(E[3].x1, 13, 1e-9, 'inner top stretched'); near(E[3].x2, 4, 1e-9, 'inner corner stays');
      near(E[4].x1, 4, 1e-9, 'upper leg stays');
      assert(S.analyze(f).conflicts === 0, 'tangents hold');
      return 'ok';
    });
    test('rfBC: an arc with one end in the box keeps its radius and its tangents, its other end sliding along the bottom line (as the relations demand)', function () {
      var f = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 8, y2: 0 }, { t: 'arc', cx: 8, cy: 2, r: 2, a0: 270, a1: 360 }, { t: 'line', x1: 10, y1: 2, x2: 10, y2: 6 }],
        rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'tangent', refs: ['0', '1'] }, { type: 'tangent', refs: ['1', '2'] }, { type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['2'] }] };
      var r = S.stretchEntities(f, [1, 2], rfBCBox(9, 1, 11, 7), { dx: 1, dy: 0 });
      assert(r.ok, r.error);
      var E = f.entities, p1 = [E[1].cx + E[1].r * Math.cos(E[1].a0 * Math.PI / 180), E[1].cy + E[1].r * Math.sin(E[1].a0 * Math.PI / 180)];
      near(E[2].x1, 11, 1e-7, 'right line moved'); near(p1[1], 0, 1e-7, 'the arc still meets the bottom'); near(p1[0], 9, 1e-7, 'its end slid along'); near(E[1].r, 2, 1e-7, 'radius kept');
      near(E[0].x1, 0, 1e-7, 'the bottom line\'s far end stays'); near(E[0].x2, 9, 1e-7, 'the bottom line follows the arc');
      assert(S.analyze(f).conflicts === 0, 'solves');
      return 'r ' + E[1].r.toFixed(4);
    });
    var base = { t: 'spline', pts: [[0, 0], [10, 5], [20, 0], [30, 5], [40, 0]], tans: [null, null, [0, 15, null, 0.05], null, null] };
    function rfBCc(o) { return JSON.parse(JSON.stringify(o)); }
    test('rfBC: Split Entities keeps a spline point\'s curvature control on the piece that keeps the point (the point just after a cut, and just before one); the cut ends get none', function () {
      var out = [];
      [[5, 2.5], [15, 2.5], [25, 2.5]].forEach(function (at) {
        var f = { entities: [rfBCc(base)] };
        var r = S.freeSplit(f, 0, [at]);
        assert(r.ok, 'split at ' + at + ': ' + r.error);
        var hit = f.entities.map(function (e, i) {
          var k = e.pts.map(function (q) { return Math.hypot(q[0] - 20, q[1]) < 1e-6; }).indexOf(true);
          return k >= 0 ? { i: i, k: k } : null;
        }).filter(Boolean);
        assert(hit.length === 1, 'one piece has the point (20, 0)');
        var pc = f.entities[hit[0].i], tg = pc.tans && pc.tans[hit[0].k];
        assert(tg && tg[3] === 0.05, 'curvature kept at ' + at + ': ' + JSON.stringify(pc.tans));
        near(K.splineCurvatureAt(pc, hit[0].k).out, 0.05, 1e-6, 'curvature on the piece');
        f.entities.forEach(function (e) { [0, e.pts.length - 1].forEach(function (k) { var t = e.tans && e.tans[k]; if (Math.hypot(e.pts[k][0] - 20, e.pts[k][1]) > 1e-6) assert(!t || t[3] == null, 'a cut / end point has no curvature: ' + JSON.stringify(t)); }); });
        out.push(at[0] + ': ' + pc.pts.length + ' pts');
      });
      return out.join(', ');
    });
    test('rfBC: Trim keeps the curvature control on the piece left', function () {
      var f = { entities: [rfBCc(base), { t: 'line', x1: 15, y1: -10, x2: 15, y2: 10 }] };
      var r = S.trimAt(f, 0, [5, 3], {});
      assert(r && r.ok !== false, 'trim: ' + (r && r.error));
      var sp = f.entities.filter(function (e) { return e.t === 'spline'; })[0];
      var k = sp.pts.map(function (q) { return Math.hypot(q[0] - 20, q[1]) < 1e-6; }).indexOf(true);
      assert(k >= 0 && sp.pts[0][0] > 14, 'the piece from the line on: ' + JSON.stringify(sp.pts));
      assert(sp.tans[k] && sp.tans[k][3] === 0.05, 'kept ' + JSON.stringify(sp.tans));
      near(K.splineCurvatureAt(sp, k).out, 0.05, 1e-6, 'curvature on the piece');
      return 'ok';
    });
    test('rfBC: a block instance inserted at scale 2 has half the curvature (twice the radius) at that spline point; at scale 0.5 twice it', function () {
      var f = { entities: [rfBCc(base)] };
      assert(K.makeBlock(f, [0], 'S', [0, 0]).ok !== false, 'make block');
      var r2 = K.insertBlock(f, 'S', 100, 0, 0, 2), r3 = K.insertBlock(f, 'S', 200, 0, 30, 0.5);
      assert(r2.ok && r3.ok, 'inserted');
      var I = K.blockInstances(f), out = [];
      [[r2.id, 0.025], [r3.id, 0.1]].forEach(function (q) {
        var inst = I.filter(function (x) { return x.id === q[0]; })[0], sp = f.entities[inst.ents[0]];
        near(sp.tans[2][3], q[1], 1e-12, 'stored curvature ' + q[1]);
        near(K.splineCurvatureAt(sp, 2).out, q[1], 1e-6, 'curvature of the placed spline');
        out.push(sp.tans[2][3]);
      });
      return out.join(', ');
    });
    test('rfBC: drawing angle tolerances keep the leading zero in inches (±0.5°, +0.5°/-0.0°, limit 45.5°/44.5°) while lengths drop it (±.005); the sketch label too', function () {
      if (!DW || !DW.dimLabel) return 'no Drawing';
      var a = DW.dimLabel({ kind: 'angle', value: 45, prec: 1, tol: { type: 'symmetric', plus: 0.5 } }, 'in');
      assert(a.text === '45.0° ±0.5°', a.text);
      var b = DW.dimLabel({ kind: 'angle', value: 45, tol: { type: 'bilateral', plus: 0.5, minus: 0, prec: 1 } }, 'in');
      assert(b.upper === '+0.5°' && b.lower === '-0.0°', b.upper + ' / ' + b.lower);
      var c = DW.dimLabel({ kind: 'angle', value: 45, tol: { type: 'limit', plus: 0.5, minus: 0.5 } }, 'in');
      assert(c.upper === '45.5°' && c.lower === '44.5°', c.text);
      var l = DW.dimLabel({ kind: 'len', value: 0.5, prec: 3, tol: { type: 'symmetric', plus: 0.005 } }, 'in');
      assert(l.text === '.500 ±.005', l.text);
      var m = DW.dimLabel({ kind: 'angle', value: 30, tol: { type: 'symmetric', plus: 0.25 } }, 'mm');
      assert(m.text === '30° ±0.25°', m.text);
      return [a.text, b.upper + '/' + b.lower, l.text].join(' | ');
    });
  })();
  // --- end rfBC ---
