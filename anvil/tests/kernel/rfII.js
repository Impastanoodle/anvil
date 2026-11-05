  // --- rfII (2026-11-05, lane sketchinfer) --- the midpoint of a rectangle / polygon / polyline / slot side is a point
  // ref ('3.e0.mid': SketchSolver.parseRef s 'em', refPoint, refName) that distances / Midpoint relations drive; the
  // inference of a Line leaving a spline end (Tangent) and the Line tool's woken-line locks (opts.dirRels: Parallel /
  // Perpendicular).
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    group('rfII: side midpoint refs, spline-end Tangent, woken-line Parallel / Perpendicular inference');
    var SS = SketchSolver;
    function sk(ents, rels) { return { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: ents, rels: rels || [] }; }
    function has(f, type, refs) { return (f.rels || []).some(function (r) { return r.type === type && r.refs.slice().sort().join() === refs.slice().sort().join(); }); }

    test('rfII: side midpoints — polygon side k is corner k to k + 1, rectangle sides, an open polyline has one fewer, a slot its two sides; bad refs give null', function () {
      var f = sk([{ t: 'poly', cx: 0, cy: 0, r: 2, n: 6, rot: 0 }, { t: 'rect', x: 1, y: 1, w: 4, h: 2 }, { t: 'polyline', pts: [[0, 0], [2, 0], [2, 2]] }, { t: 'slot', x1: 0, y1: 0, x2: 4, y2: 0, w: 1 }, { t: 'line', x1: 0, y1: 0, x2: 2, y2: 2 }]);
      var p = SS.parseRef('0.e2.mid');
      assert(p && p.e === 0 && p.s === 'em' && p.k === 2, 'parse ' + JSON.stringify(p));
      assert(SS.parseRef('0.mid.mid') === null && SS.parseRef('0.e.mid') === null && SS.parseRef('0.p1.mid') === null, 'only .e<k>.mid');
      var c0 = [2, 0], c1 = [2 * Math.cos(Math.PI / 3), 2 * Math.sin(Math.PI / 3)], m = SS.refPoint(f, '0.e0.mid');
      near(m[0], (c0[0] + c1[0]) / 2, 1e-12, 'poly e0 x'); near(m[1], (c0[1] + c1[1]) / 2, 1e-12, 'poly e0 y');
      var m5 = SS.refPoint(f, '0.e5.mid'), c5 = [2 * Math.cos(5 * Math.PI / 3), 2 * Math.sin(5 * Math.PI / 3)];
      near(m5[0], (c5[0] + 2) / 2, 1e-12, 'poly e5 closes on corner 0'); near(m5[1], c5[1] / 2, 1e-12, 'poly e5 y');
      assert(SS.refPoint(f, '0.e6.mid') === null, 'no side 6');
      var r0 = SS.refPoint(f, '1.e0.mid'), r1 = SS.refPoint(f, '1.e1.mid');
      assert(r0[0] === 3 && r0[1] === 1 && r1[0] === 5 && r1[1] === 2, 'rect bottom / right ' + r0 + ' ' + r1);
      assert(SS.refPoint(f, '2.e1.mid')[1] === 1 && SS.refPoint(f, '2.e2.mid') === null, 'open polyline: two sides');
      var s0 = SS.refPoint(f, '3.e0.mid'), s1 = SS.refPoint(f, '3.e1.mid');
      assert(s0[0] === 2 && s0[1] === 0.5 && s1[0] === 2 && s1[1] === -0.5 && SS.refPoint(f, '3.e2.mid') === null, 'slot sides ' + s0 + ' ' + s1);
      assert(SS.refPoint(f, '4.e0.mid') === null, 'a line has .mid, not .e0.mid');
      assert(SS.refKind(f, '0.e0.mid') === 'point', 'a point ref');
      assert(SS.refName(f, '0.e1.mid') === 'Polygon1 edge 2 midpoint' || /edge 2 midpoint$/.test(SS.refName(f, '0.e1.mid')), SS.refName(f, '0.e1.mid'));
      return SS.refName(f, '0.e1.mid');
    });

    test('rfII: a distance from a polygon side midpoint to the origin drives (2.5 → 3.25); a Midpoint relation to a rectangle side midpoint holds; removing an entity before it renumbers the ref', function () {
      var f = sk([{ t: 'point', x: 9, y: 9 }, { t: 'poly', cx: 1, cy: 0.5, r: 2, n: 6, rot: 10 }]);
      var r = SS.addRelation(f, 'distance', ['1.e0.mid', 'O'], { value: 2.5 });
      assert(r.ok, 'added: ' + JSON.stringify(r.error || r.status));
      var m = SS.refPoint(f, '1.e0.mid');
      near(Math.hypot(m[0], m[1]), 2.5, 1e-7, 'solved to 2.5');
      var k = f.rels.length - 1, sr = SS.setRelValue(f, k, 3.25);
      assert(!sr || sr.ok !== false, 'setRelValue ' + JSON.stringify(sr));
      m = SS.refPoint(f, '1.e0.mid');
      near(Math.hypot(m[0], m[1]), 3.25, 1e-7, 'driven to 3.25');
      var g = sk([{ t: 'rect', x: 0, y: 0, w: 4, h: 2 }, { t: 'point', x: 1.7, y: 2.4 }]);
      var r2 = SS.addRelation(g, 'coincident', ['1', '0.e2.mid']);
      assert(r2.ok, 'point on the top side midpoint: ' + JSON.stringify(r2.error));
      var q = SS.refPoint(g, '1'), tm = SS.refPoint(g, '0.e2.mid');
      near(q[0], tm[0], 1e-7, 'x'); near(q[1], tm[1], 1e-7, 'y');
      SS.removeEntity(f, 0);
      assert(f.rels.some(function (rl) { return rl.type === 'distance' && rl.refs[0] === '0.e0.mid'; }), 'renumbered: ' + JSON.stringify(f.rels));
      return 'driven ' + Math.hypot(m[0], m[1]).toFixed(4);
    });

    test('rfII: a sketch with a side-midpoint distance round-trips through generateScript', function () {
      var src = 'p.units("in");\np.sketch("Front").polygon(0, 0, 1.5, 6, 0).rel("distance", ["0.e1.mid", "O"], 1.2).solve().id();\n';
      var r = build(src);
      noErrors(r);
      var f = r.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      var m = SS.refPoint(f, '0.e1.mid');
      near(Math.hypot(m[0], m[1]), 1.2, 1e-7, 'built');
      var s = K.generateScript(r.model);
      assert(s.indexOf('"0.e1.mid"') >= 0, 'written: ' + s);
      var r2 = build(s), f2 = r2.model.features.filter(function (x) { return x.type === 'sketch'; })[0], m2 = SS.refPoint(f2, '0.e1.mid');
      near(Math.hypot(m2[0], m2[1]), 1.2, 1e-7, 'round trip');
      return 'ok';
    });

    test('rfII: a line leaving an open spline end along its tangent infers Coincident + Tangent; off the tangent, Coincident only; SketchSolver.freeEndDir', function () {
      var sp = { t: 'spline', pts: [[0, 0], [1, 1], [3, 1.5]] };
      var f = sk([sp]);
      var d = SS.freeEndDir(sp, [3, 1.5]);
      assert(d && Math.abs(Math.hypot(d[0], d[1]) - 1) < 1e-12, 'unit ' + d);
      f.entities.push({ t: 'line', x1: 3, y1: 1.5, x2: 3 + 2 * d[0], y2: 1.5 + 2 * d[1] });
      var added = SS.infer(f, 1, { placed: [[3, 1.5], [3 + 2 * d[0], 1.5 + 2 * d[1]]] });
      assert(has(f, 'coincident', ['1.p1', '0.p2']) && has(f, 'tangent', ['1', '0']), 'tangent: ' + JSON.stringify(added));
      var g = sk([JSON.parse(JSON.stringify(sp)), { t: 'line', x1: 3, y1: 1.5, x2: 3 + 2 * d[1], y2: 1.5 - 2 * d[0] }]);
      SS.infer(g, 1, { placed: [[3, 1.5]] });
      assert(has(g, 'coincident', ['1.p1', '0.p2']) && !has(g, 'tangent', ['1', '0']), 'square: no tangent ' + JSON.stringify(g.rels));
      return 'ok';
    });

    test('rfII: opts.dirRels adds Parallel / Perpendicular to the woken line only when the line runs that way; inferPreview lists it', function () {
      var base = function () { return sk([{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 1 }]); };
      var f = base();
      f.entities.push({ t: 'line', x1: 5, y1: 0, x2: 8, y2: 1 });
      SS.infer(f, 1, { placed: [[5, 0], [8, 1]], dirRels: [{ type: 'parallel', ref: '0' }] });
      assert(has(f, 'parallel', ['1', '0']), 'parallel ' + JSON.stringify(f.rels));
      var g = base();
      g.entities.push({ t: 'line', x1: 5, y1: 0, x2: 4, y2: 3 });
      SS.infer(g, 1, { placed: [[5, 0], [4, 3]], dirRels: [{ type: 'perpendicular', ref: '0' }] });
      assert(has(g, 'perpendicular', ['1', '0']), 'perpendicular ' + JSON.stringify(g.rels));
      var h = base();
      h.entities.push({ t: 'line', x1: 5, y1: 0, x2: 8, y2: 1.2 });
      SS.infer(h, 1, { placed: [[5, 0], [8, 1.2]], dirRels: [{ type: 'parallel', ref: '0' }] });
      assert(!has(h, 'parallel', ['1', '0']), 'not parallel: nothing ' + JSON.stringify(h.rels));
      var pv = SS.inferPreview(base(), { t: 'line', x1: 5, y1: 0, x2: 8, y2: 1 }, { placed: [[5, 0], [8, 1]], dirRels: [{ type: 'parallel', ref: '0' }] });
      assert(pv.some(function (c) { return c.type === 'parallel'; }), 'preview ' + JSON.stringify(pv));
      var n = SS.infer(base(), 0, { dirRels: [{ type: 'parallel', ref: '0' }] });
      assert(!n.some(function (r) { return r.type === 'parallel'; }), 'never to itself');
      return 'ok';
    });
  })();
