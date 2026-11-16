  // --- rfMW (local-2026-11-15b, lane sketchflow round 4) --- the engine side of test-reports/2026-11-15-sketch-flow-4.md:
  // a deleted circular / linear pattern instance becomes an instance to skip (the Pattern relation stays), SketchXpert's
  // first solution deletes the dimension and the redundant relation before any corner, and a circular pattern's radius
  // and angular spacing both stay editable
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var S = SketchSolver;
    group('rfMW: pattern instances deleted, SketchXpert solution order, circular pattern edits');
    function rfMWSk(E, R, D) { return { id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 }, entities: JSON.parse(JSON.stringify(E)), rels: JSON.parse(JSON.stringify(R || [])), dims: JSON.parse(JSON.stringify(D || [])) }; }
    function rfMWDel(f, i) { S.removeEntity(f, i); f.entities.splice(i, 1); if (f.dims) { f.dims = f.dims.filter(function (d) { return d.e !== i; }); f.dims.forEach(function (d) { if (d.e > i) d.e--; }); } }
    function rfMWPat(f) { return (f.rels || []).filter(function (r) { return r.type === 'pattern'; })[0]; }
    function rfMWHole() { return rfMWSk([{ t: 'circle', cx: 3, cy: 0.75, r: 0.25 }], [], [{ e: 0, k: 'dia' }]); }

    test('rfMW: deleting one copy of a circular pattern of a hole leaves the pattern with that instance skipped; the angle and radius still edit the rest', function () {
      var f = rfMWHole();
      var r = S.circularPattern(f, [0], { count: 8, angle: 180, equal: true, cx: 0, cy: 0 });
      assert(r.ok, r.error);
      var pr = rfMWPat(f), c3 = +pr.refs[2 + 1 + 3];   // the copy of instance 4 (refs: L0, L1, the seed, the copies)
      assert(pr.pat.inst.join() === '1,2,3,4,5,6,7', 'instances ' + pr.pat.inst.join());
      rfMWDel(f, c3);
      pr = rfMWPat(f);
      assert(pr, 'the Pattern relation stays');
      assert(pr.pat.inst.join() === '1,2,3,5,6,7' && pr.refs.length === 2 + 1 + 6, 'instance 4 skipped: ' + pr.pat.inst.join() + ' / ' + pr.refs.join());
      assert(S.analyze(f).status !== 'over', 'not over defined');
      var ai = f.rels.map(function (x, i) { return x.type === 'angle' ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      var sa = S.setRelValue(f, ai, 20);
      assert(sa.ok, 'angle 20: ' + sa.error);
      var ri = f.dims.map(function (d, i) { return d.k === 'len' ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      var sr = S.setDim(f, ri, 3);
      assert(sr.ok, 'radius 3 after the angle: ' + sr.error);
      var holes = f.entities.filter(function (e) { return e.t === 'circle'; });
      assert(holes.length === 7, 'seven holes: ' + holes.length);
      holes.forEach(function (h) { near(Math.hypot(h.cx, h.cy), 3, 1e-6, 'on R3'); });
      var angs = holes.map(function (h) { return Math.round(Math.atan2(h.cy, h.cx) * 180 / Math.PI * 1e4) / 1e4; });
      var a0 = angs[0];
      [0, 1, 2, 3, 5, 6, 7].forEach(function (k, j) { near(angs[j], a0 + 20 * k, 1e-4, 'instance ' + k); });
    });

    test('rfMW: a straight slot patterned 6 round the origin: the angular spacing 60 -> 40 and then the radius 3 both reach their values (the solver stopped short on the swung arcs)', function () {
      var x = 3, y0 = 0.5, y1 = 1.5, r = 0.125;
      var E = [{ t: 'line', x1: x - r, y1: y0, x2: x - r, y2: y1 }, { t: 'arc', cx: x, cy: y1, r: r, a0: 0, a1: 180 }, { t: 'line', x1: x + r, y1: y1, x2: x + r, y2: y0 }, { t: 'arc', cx: x, cy: y0, r: r, a0: 180, a1: 360 },
        { t: 'line', x1: x, y1: y0, x2: x, y2: y1, construction: true }];
      var R = [{ type: 'tangent', refs: ['0', '1'] }, { type: 'tangent', refs: ['1', '2'] }, { type: 'tangent', refs: ['2', '3'] }, { type: 'tangent', refs: ['3', '0'] },
        { type: 'coincident', refs: ['0.p2', '1.p2'] }, { type: 'coincident', refs: ['1.p1', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p2'] }, { type: 'coincident', refs: ['3.p1', '0.p1'] },
        { type: 'coincident', refs: ['4.p1', '3.c'] }, { type: 'coincident', refs: ['4.p2', '1.c'] }, { type: 'vertical', refs: ['4'] }];
      var f = rfMWSk(E, R);
      var pr = S.circularPattern(f, [0, 1, 2, 3, 4], { count: 6, angle: 360, equal: true, cx: 0, cy: 0 });
      assert(pr.ok, pr.error);
      var ai = f.rels.map(function (q, i) { return q.type === 'angle' ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      var sa = S.setRelValue(f, ai, 40);
      assert(sa.ok, 'angle 40: ' + sa.error);
      var ri = f.dims.map(function (d, i) { return d.k === 'len' ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      var L0 = f.entities[f.dims[ri].e], R0 = Math.hypot(L0.x2 - L0.x1, L0.y2 - L0.y1);
      var sr = S.setDim(f, ri, 3);
      assert(sr.ok, 'radius 3: ' + sr.error);
      var cl = f.entities.filter(function (e) { return e.t === 'line' && e.construction && Math.hypot(e.x2 - e.x1, e.y2 - e.y1) < 2; });
      assert(cl.length === 6, 'six slot centerlines: ' + cl.length + ' ' + JSON.stringify(f.entities.filter(function (e) { return e.t === 'line'; }).map(function (e) { return [+(Math.hypot(e.x2 - e.x1, e.y2 - e.y1)).toFixed(4), !!e.construction]; })));
      var angs = cl.map(function (e) { return Math.atan2(e.y1, e.x1) * 180 / Math.PI; }).sort(function (a, b) { return a - b; });
      var steps = angs.map(function (a) { var d = ((a - angs[0]) % 360 + 360) % 360; return d / 40; });
      steps.forEach(function (s, k) { near(s, Math.round(s), 1e-7, 'a multiple of 40 (' + k + ')'); });
      var st = steps.map(Math.round); assert(st.filter(function (s, k) { return st.indexOf(s) === k; }).length === 6 && st.some(function (s0) { return st.every(function (s) { return ((s - s0) % 9 + 9) % 9 < 6; }); }), 'six consecutive steps of 40: ' + st.join());
      assert(S.analyze(f).conflicts === 0, 'no conflicts');
      return 'R ' + R0.toFixed(4) + ' -> 3';
    });

    test('rfMW: deleting one copy of a linear pattern leaves the pattern with that instance skipped; the seed or the last copy deleted ends it', function () {
      var f = rfMWHole();
      var r = S.linearPattern ? S.linearPattern(f, [0], { count1: 4, spacing1: 1 }) : null;
      assert(r && r.ok, 'linear pattern: ' + (r && r.error));
      var pr = rfMWPat(f), na = (pr.pat.nd | 0) + 1, n0 = pr.pat.inst.length;
      var last = +pr.refs[pr.refs.length - 1];
      var anchorEnts = pr.refs.slice(0, na).map(function (x) { return parseInt(x, 10); });
      if (anchorEnts.indexOf(last) >= 0) last = +pr.refs[na + 1];
      rfMWDel(f, last);
      pr = rfMWPat(f);
      assert(pr && pr.pat.inst.length === n0 - 1, 'one instance fewer: ' + (pr && JSON.stringify(pr.pat)));
      rfMWDel(f, 0);
      assert(!rfMWPat(f), 'the seed deleted: no pattern');
    });

    test('rfMW: SketchXpert on a plate over defined by a redundant Equal and a third dimension: the first solution deletes the dimension and the Equal, never a corner Coincident', function () {
      var E = [[0, 0, 4, 0], [4, 0, 4, 2], [4, 2, 0, 2], [0, 2, 0, 0]].map(function (p) { return { t: 'line', x1: p[0], y1: p[1], x2: p[2], y2: p[3] }; });
      var R = [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'vertical', refs: ['1'] }, { type: 'coincident', refs: ['1.p1', '0.p2'] },
        { type: 'horizontal', refs: ['2'] }, { type: 'coincident', refs: ['2.p1', '1.p2'] }, { type: 'vertical', refs: ['3'] }, { type: 'coincident', refs: ['3.p1', '2.p2'] }, { type: 'coincident', refs: ['3.p2', 'O'] },
        { type: 'equal', refs: ['3', '1'] }];
      var f = rfMWSk(E, R, [{ e: 0, k: 'len' }, { e: 1, k: 'len' }, { e: 2, k: 'len' }]);
      assert(S.analyze(f).status === 'over', 'over defined');
      var d = S.diagnose(f);
      assert(d.solutions.length, 'solutions');
      var first = d.solutions[0];
      assert(first.remove.length === 2 && first.remove.some(function (x) { return x.src === 'dim' && x.index === 2; }) && first.remove.some(function (x) { return x.src === 'rel' && x.index === 9; }), 'first solution: ' + first.names.join('; '));
      assert(!d.solutions.slice(0, 1).some(function (s) { return s.names.some(function (n) { return /^Coincident/.test(n); }); }), 'no Coincident first');
      var ap = S.diagnoseApply(f, first.remove);
      assert(ap.analysis.status === 'full', 'fully defined after: ' + ap.analysis.status);
      return first.names.join('; ') + ' of ' + d.solutions.length;
    });
  })();
